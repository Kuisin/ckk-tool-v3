"""Prometheus exporter — コンテナ単位の CPU / メモリ / 通信 / ストレージ。

**なぜ自前か**: このホストの Docker は containerd イメージストア
（Storage Driver = overlayfs / snapshotter）で動いており、cAdvisor は
`/var/lib/docker/image/overlayfs/layerdb/...` を読もうとして失敗する
（"failed to identify the read-write layer ID"）。その結果 cAdvisor は
**コンテナ単位の系列を 1 本も出さない**（cgroup 集計だけ）。ここでは Docker
API を直接読み、gpu-exporter と同じ流儀（stdlib のみ・:9401/metrics）で出す。

ラベルは Loki 側（monitoring/alloy/config.alloy）と**同じ規則**にする:
  container   … Coolify のアプリ名（coolify.resourceName）or コンテナ名
  deploy      … 実際のコンテナ名（Coolify はデプロイごとに変わる = デプロイ識別子）
  stack       … coolify.projectName or compose project
  environment … development / production（Coolify 以外は空）
こうしておくと、ログのダッシュボードと同じ変数で resource も絞れる。

収集の間隔は 3 系統に分けている（重い API を毎回叩かないため）:
  stats     15 秒 — CPU/メモリ/通信（コンテナごとに 1 リクエスト・並列）
  sizes    120 秒 — 書き込みレイヤのサイズ（?size=1 は数百 ms かかる）
  system df 300 秒 — ボリューム・イメージ・ビルドキャッシュの使用量（数秒かかる）
"""

import http.client
import json
import os
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, HTTPServer

SOCK = os.environ.get("DOCKER_SOCK", "/var/run/docker.sock")
API = os.environ.get("DOCKER_API_VERSION", "v1.43")
PORT = int(os.environ.get("PORT", "9401"))
STATS_INTERVAL = int(os.environ.get("STATS_INTERVAL", "15"))
SIZE_INTERVAL = int(os.environ.get("SIZE_INTERVAL", "120"))
DF_INTERVAL = int(os.environ.get("DF_INTERVAL", "300"))
WORKERS = int(os.environ.get("WORKERS", "8"))


class UDSConnection(http.client.HTTPConnection):
    """Unix ドメインソケット越しの HTTP。requests/docker SDK を入れないため。"""

    def __init__(self, path: str, timeout: float = 30.0):
        super().__init__("localhost", timeout=timeout)
        self._path = path

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(self.timeout)
        s.connect(self._path)
        self.sock = s


def api_get(path: str, timeout: float = 30.0):
    """Docker API を 1 回叩いて JSON を返す。失敗は None。"""
    conn = UDSConnection(SOCK, timeout)
    try:
        conn.request("GET", f"/{API}{path}", headers={"Host": "docker"})
        resp = conn.getresponse()
        body = resp.read()
        if resp.status != 200:
            print(f"[docker] GET {path} -> HTTP {resp.status}", flush=True)
            return None
        return json.loads(body)
    except Exception as e:  # ソケットが無い・Docker 再起動中 など
        print(f"[docker] GET {path} failed: {e}", flush=True)
        return None
    finally:
        conn.close()


def labels_of(c: dict) -> dict:
    """コンテナ 1 つ → ラベル（Loki 側と同じ規則）。"""
    name = (c.get("Names") or ["/?"])[0].lstrip("/")
    lb = c.get("Labels") or {}
    return {
        "container": lb.get("coolify.resourceName") or name,
        "deploy": name,
        "stack": lb.get("coolify.projectName")
        or lb.get("com.docker.compose.project")
        or "",
        "environment": lb.get("coolify.environmentName") or "",
    }


def fmt(labels: dict) -> str:
    return ",".join(f'{k}="{v}"' for k, v in labels.items() if v != "")


class State:
    """収集結果の置き場。読み書きはロックで守る（HTTP は別スレッド）。"""

    def __init__(self):
        self.lock = threading.Lock()
        self.stats: dict[str, dict] = {}  # container id -> 計算済みの値
        self.sizes: dict[str, dict] = {}  # container id -> {rw, root}
        self.volumes: dict[str, int] = {}  # volume name -> bytes
        self.df: dict[str, dict] = {}  # type -> {size, reclaimable}
        self.labels: dict[str, dict] = {}  # container id -> labels
        self.prev_cpu: dict[str, tuple[int, int]] = {}  # id -> (total, system)
        self.ok = False


S = State()


def collect_stats():
    """CPU / メモリ / 通信。CPU% は前回との差分から自前で出す。"""
    conts = api_get("/containers/json") or []
    ids = [c["Id"] for c in conts]
    with S.lock:
        S.labels = {c["Id"]: labels_of(c) for c in conts}

    def one(cid: str):
        # one-shot=true は precpu を返さないので、前回値との差分で CPU% を出す。
        st = api_get(f"/containers/{cid}/stats?stream=false&one-shot=true", 20.0)
        if not st:
            return cid, None
        cpu = st.get("cpu_stats") or {}
        total = (cpu.get("cpu_usage") or {}).get("total_usage")
        system = cpu.get("system_cpu_usage")
        ncpu = cpu.get("online_cpus") or 0
        pct = None
        if total is not None and system is not None:
            prev = S.prev_cpu.get(cid)
            if prev and system > prev[1] and total >= prev[0]:
                d_total, d_system = total - prev[0], system - prev[1]
                pct = (d_total / d_system) * (ncpu or 1) * 100.0
            S.prev_cpu[cid] = (total, system)
        mem = st.get("memory_stats") or {}
        detail = mem.get("stats") or {}
        usage = mem.get("usage")
        # cAdvisor の working set と同じ考え方: 再利用可能な file cache を引く。
        working = None
        if usage is not None:
            working = usage - int(detail.get("inactive_file", 0) or 0)
        rx = tx = 0
        for net in (st.get("networks") or {}).values():
            rx += int(net.get("rx_bytes", 0) or 0)
            tx += int(net.get("tx_bytes", 0) or 0)
        blk_r = blk_w = 0
        for e in ((st.get("blkio_stats") or {}).get("io_service_bytes_recursive") or []):
            if (e.get("op") or "").lower() == "read":
                blk_r += int(e.get("value", 0) or 0)
            elif (e.get("op") or "").lower() == "write":
                blk_w += int(e.get("value", 0) or 0)
        return cid, {
            "cpu_percent": pct,
            "mem_bytes": working,
            "mem_limit": mem.get("limit"),
            "rx": rx,
            "tx": tx,
            "blk_read": blk_r,
            "blk_write": blk_w,
        }

    out = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for cid, val in ex.map(one, ids):
            if val:
                out[cid] = val
    with S.lock:
        S.stats = out
        S.ok = bool(out)


def collect_sizes():
    """書き込みレイヤ（コンテナ自身が食っている容量）と全体サイズ。"""
    conts = api_get("/containers/json?all=1&size=1", 120.0) or []
    with S.lock:
        S.sizes = {
            c["Id"]: {
                "rw": int(c.get("SizeRw") or 0),
                "root": int(c.get("SizeRootFs") or 0),
            }
            for c in conts
        }
        # 停止中のコンテナのラベルもここで拾える（stats には出ないため）。
        for c in conts:
            S.labels.setdefault(c["Id"], labels_of(c))


def collect_df():
    """ボリューム・イメージ・ビルドキャッシュの使用量（docker system df 相当）。"""
    df = api_get("/system/df", 300.0)
    if not df:
        return
    vols = {}
    for v in df.get("Volumes") or []:
        size = ((v.get("UsageData") or {}).get("Size")) or 0
        if size and size > 0:
            vols[v.get("Name", "?")] = int(size)
    imgs = df.get("Images") or []
    layers = int(df.get("LayersSize") or 0)
    img_reclaim = sum(int(i.get("Size") or 0) for i in imgs if not i.get("Containers"))
    cache = df.get("BuildCache") or []
    with S.lock:
        S.volumes = vols
        S.df = {
            "images": {"size": layers, "reclaimable": img_reclaim},
            "volumes": {"size": sum(vols.values()), "reclaimable": 0},
            "build_cache": {
                "size": sum(int(c.get("Size") or 0) for c in cache),
                "reclaimable": sum(
                    int(c.get("Size") or 0) for c in cache if not c.get("InUse")
                ),
            },
        }


def loop():
    """3 つの間隔で回す 1 本のスレッド（起動直後に 1 回ずつ全部取る）。"""
    last_size = last_df = 0.0
    while True:
        started = time.monotonic()
        try:
            collect_stats()
            if started - last_size >= SIZE_INTERVAL or last_size == 0:
                collect_sizes()
                last_size = started
            if started - last_df >= DF_INTERVAL or last_df == 0:
                collect_df()
                last_df = started
        except Exception as e:
            print(f"[docker] collect loop error: {e}", flush=True)
        time.sleep(max(1.0, STATS_INTERVAL - (time.monotonic() - started)))


def render() -> bytes:
    with S.lock:
        stats, sizes, labels = dict(S.stats), dict(S.sizes), dict(S.labels)
        volumes, df, ok = dict(S.volumes), dict(S.df), S.ok

    out: list[str] = []

    def metric(name, help_, typ, samples):
        if not samples:
            return
        out.append(f"# HELP {name} {help_}")
        out.append(f"# TYPE {name} {typ}")
        for lbl, val in samples:
            out.append(f"{name}{{{lbl}}} {val}")

    def rows(pick):
        acc = []
        for cid, s in stats.items():
            v = pick(s)
            if v is None:
                continue
            acc.append((fmt(labels.get(cid, {})), v))
        return acc

    metric("docker_container_cpu_percent", "CPU 使用率 (%)", "gauge",
           rows(lambda s: None if s["cpu_percent"] is None else round(s["cpu_percent"], 2)))
    metric("docker_container_memory_bytes", "メモリ working set (bytes)", "gauge",
           rows(lambda s: s["mem_bytes"]))
    metric("docker_container_memory_limit_bytes", "メモリ上限 (bytes)", "gauge",
           rows(lambda s: s["mem_limit"]))
    metric("docker_container_network_rx_bytes_total", "受信 (bytes)", "counter",
           rows(lambda s: s["rx"]))
    metric("docker_container_network_tx_bytes_total", "送信 (bytes)", "counter",
           rows(lambda s: s["tx"]))
    metric("docker_container_block_read_bytes_total", "ブロック読み (bytes)", "counter",
           rows(lambda s: s["blk_read"] or None))
    metric("docker_container_block_write_bytes_total", "ブロック書き (bytes)", "counter",
           rows(lambda s: s["blk_write"] or None))

    metric("docker_container_size_rw_bytes",
           "書き込みレイヤのサイズ = そのコンテナが食っている容量 (bytes)", "gauge",
           [(fmt(labels.get(cid, {})), v["rw"]) for cid, v in sizes.items()])
    metric("docker_container_size_root_fs_bytes",
           "イメージ込みの合計サイズ (bytes)", "gauge",
           [(fmt(labels.get(cid, {})), v["root"]) for cid, v in sizes.items()])

    metric("docker_volume_size_bytes", "ボリュームの使用量 (bytes)", "gauge",
           [(f'volume="{n}"', v) for n, v in volumes.items()])

    metric("docker_disk_usage_bytes", "Docker のディスク使用量 (bytes)", "gauge",
           [(f'type="{t}"', v["size"]) for t, v in df.items()])
    metric("docker_disk_reclaimable_bytes", "回収可能な容量 (bytes)", "gauge",
           [(f'type="{t}"', v["reclaimable"]) for t, v in df.items()])

    out.append("# HELP docker_exporter_up 収集できているか")
    out.append("# TYPE docker_exporter_up gauge")
    out.append(f"docker_exporter_up {1 if ok else 0}")
    return ("\n".join(out) + "\n").encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/metrics", "/"):
            self.send_response(404)
            self.end_headers()
            return
        body = render()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    threading.Thread(target=loop, daemon=True).start()
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
