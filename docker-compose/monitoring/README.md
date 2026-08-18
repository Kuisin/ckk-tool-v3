# monitoring — hardware status (Prometheus + Grafana)

Hardware/health monitoring for `docker-mac-pro` (techstack #7). Prometheus scrapes
exporters; Grafana visualizes and alerts. Deployed at `~/stacks/monitoring`
(Dockge-managed).

## Services

| Service | Port | What it measures |
|---------|------|------------------|
| `grafana`       | host `3002` | dashboards & alerting (also public via `cloudflared`) |
| `prometheus`    | internal | metrics store (30d retention), scrapes the exporters |
| `node-exporter` | internal | host CPU, RAM, disk, network, temperatures |
| `cadvisor`      | internal | cgroup 集計のみ（下記の理由でコンテナ単位は出せない） |
| `gpu-exporter`  | internal | AMD GPU util / VRAM / temp / power (from amdgpu sysfs) |
| `docker-exporter` | internal | **コンテナ単位**の CPU / メモリ / 通信 / ストレージ + ボリューム使用量 |
| `alloy`         | internal | 全コンテナの stdout/stderr → Loki |
| `loki`          | internal | ログ保管（30 日） |

The GPU exporter ([`./gpu-exporter`](./gpu-exporter)) is a tiny Python service that
reads `/sys/class/drm/card*/device/` — no ROCm/kfd needed. Metrics:
`amdgpu_busy_percent`, `amdgpu_vram_used_bytes`, `amdgpu_vram_total_bytes`,
`amdgpu_temperature_celsius`, `amdgpu_power_watts`.

### なぜ cAdvisor ではなく docker-exporter なのか

このホストの Docker は **containerd イメージストア**（`Storage Driver: overlayfs`、
snapshotter）で動いている。cAdvisor は
`/var/lib/docker/image/overlayfs/layerdb/mounts/<id>/mount-id` を読もうとして
失敗し（`failed to identify the read-write layer ID`）、**コンテナ単位の系列を
1 本も出さない**（`container_*` は `/`・`/system.slice/...` の cgroup 集計だけ）。
そこで [`./docker-exporter`](./docker-exporter) が Docker API を直接読む
（stdlib のみ・`:9401/metrics`）。

ラベルは Loki 側（[`alloy/config.alloy`](./alloy/config.alloy)）と**同じ規則**:

| ラベル | 意味 |
|---|---|
| `container` | Coolify のアプリ名（`coolify.resourceName`）or コンテナ名 |
| `deploy` | 実際のコンテナ名 = **デプロイ識別子**（Coolify は再デプロイで変わる） |
| `stack` | `coolify.projectName` or compose project |
| `environment` | `development` / `production`（Coolify 以外は空） |

メトリクス: `docker_container_cpu_percent` / `_memory_bytes` / `_memory_limit_bytes` /
`_network_rx_bytes_total` / `_network_tx_bytes_total` / `_block_read_bytes_total` /
`_block_write_bytes_total` / `_size_rw_bytes`（書き込みレイヤ）/ `_size_root_fs_bytes`、
`docker_volume_size_bytes{volume}`、`docker_disk_usage_bytes{type}` /
`docker_disk_reclaimable_bytes{type}`（`docker system df` 相当）、`docker_exporter_up`。

収集間隔は重さで分けている: stats 15 秒 / サイズ 120 秒 / `system df` 300 秒。

## ダッシュボードのフォルダ構成

`grafana/dashboards/<フォルダ名>/` がそのまま Grafana のフォルダになる
（`provisioning/dashboards/provider.yml` にフォルダごとの provider を書く方式。
`foldersFromFilesStructure` は 11.6 でフォルダだけ作られて中身がルートに残るため使わない）。

| フォルダ | 中身 |
|---|---|
| `Dev` | Coolify の development 環境のログ（`environment="development"`） |
| `Prod` | Coolify の production 環境のログ（`environment="production"`） |
| `External` | Coolify 以外のコンテナのログ（`environment=""`） |
| `Platform` | GPU・全体横断のログ・**Resources**（CPU/メモリ/通信）・**Storage**（コンテナ/ボリューム）+ アラートルール |

## Setup

```bash
cp .env.example .env          # set GF_ADMIN_PASSWORD (and GF_ROOT_URL if public)
docker compose up -d --build
```

Grafana is provisioned with the Prometheus datasource and an **"AMD GPU & System"**
dashboard (auto-loaded). Open <http://192.168.50.15:3002>, log in as `admin` /
your `GF_ADMIN_PASSWORD`.

Import extra community dashboards by ID (Dashboards → New → Import):
`1860` (Node Exporter Full), `14282` (cAdvisor).

## Public access (Cloudflare)

The `cloudflared` stack routes **monitor.kai-lab.net → grafana:3000** (connector
joined to this stack's network). Grafana has its own login; add a Cloudflare
**Access** policy on the hostname for an extra auth layer. Set `GF_ROOT_URL` to the
public URL so generated links/redirects are correct.

## Alerts

Grafana Alerting (techstack) can fire on these metrics, e.g. GPU temp >85 °C, VRAM
>95 %, disk >90 %, container OOM. Configure under Alerting → Alert rules.
