"""restore-agent — privileged executor for DB + SeaweedFS restores.

Lives in the (non–web-facing) db-backup stack because a restore must:
  * read/write the on-host backup tree (/data/db-backups),
  * run PG17 client tools (pg_dump / pg_restore / psql) against shared-db,
  * stop the seaweedfs container, swap its volume, start it again.

All heavy IO runs in short-lived one-shot containers launched over the Docker
socket (pg tools via postgres:17-alpine, tar via alpine) so this image stays
tiny and the PG client version always matches the server. The admintools WebUI
(the operator-facing surface) never touches the socket — it just calls this
agent over the shared-db network with a bearer token.

Endpoints (all except /healthz require Authorization: Bearer <RESTORE_AGENT_TOKEN>):
  GET  /backups            list restorable artifacts (db dumps, storage tars, snapshots)
  POST /snapshot           take an at-point full backup into pre-restore/<ts>/
  POST /restore            restore db and/or storage (optionally after an at-point backup)
  GET  /status             current/last operation state

Safety model:
  * one operation at a time (STATE.running guard),
  * unless skip_snapshot is set, a fresh at-point full backup is written to
    pre-restore/<ts>/ BEFORE anything is overwritten,
  * every operation is appended to /backups/restore-log.jsonl (survives a DB
    restore because it is on the filesystem, not in the database).
"""
from __future__ import annotations

import json
import os
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import urllib.request

import docker
from docker.errors import ImageNotFound, NotFound
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

# ── config ──────────────────────────────────────────────────────────────────
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/backups"))       # this container's view
BACKUP_HOST_DIR = os.environ.get("BACKUP_HOST_DIR", "/data/db-backups")  # host path for one-shot mounts
TOKEN = os.environ.get("RESTORE_AGENT_TOKEN", "")
DB_URL = os.environ.get("RESTORE_DB_URL", "")                     # superuser DSN to the ckk database
SEAWEED_CONTAINER = os.environ.get("SEAWEED_CONTAINER", "nextjs-seaweedfs")
SEAWEED_VOLUME = os.environ.get("SEAWEED_VOLUME", "nextjs-web_seaweed-data")
SHARED_DB_NETWORK = os.environ.get("SHARED_DB_NETWORK", "shared-db")
PG_IMAGE = os.environ.get("PG_IMAGE", "postgres:17-alpine")
HELPER_IMAGE = os.environ.get("HELPER_IMAGE", "alpine:3.20")
LOG_PATH = BACKUP_DIR / "restore-log.jsonl"

# Coolify — for rolling the nextjs-web app back to the git commit that was live at
# the restore point. Empty COOLIFY_API_URL/TOKEN → app rollback disabled (safe).
COOLIFY_API_URL = os.environ.get("COOLIFY_API_URL", "").rstrip("/")  # e.g. http://coolify:8000/api/v1
COOLIFY_API_TOKEN = os.environ.get("COOLIFY_API_TOKEN", "")
COOLIFY_APP_NAME = os.environ.get("COOLIFY_APP_NAME", "nextjs-web-main")

app = FastAPI(title="restore-agent")

STATE: dict = {"running": False, "phase": "idle", "started_at": None,
               "finished_at": None, "actor": None, "result": None, "error": None}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")


def _stamp() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H%M%S")


def require_token(authorization: str = Header(default="")) -> None:
    if not TOKEN:
        raise HTTPException(503, "restore agent disabled: set RESTORE_AGENT_TOKEN")
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "invalid token")


def _client() -> docker.DockerClient:
    return docker.from_env()


def _host_path(rel: str) -> str:
    """Map a path under this container's /backups to the equivalent host path so a
    one-shot container's bind mount resolves correctly (mounts resolve on the host)."""
    rel = rel.lstrip("/")
    return f"{BACKUP_HOST_DIR}/{rel}" if rel else BACKUP_HOST_DIR


def _run_oneshot(image: str, command: list[str], *, volumes: dict,
                 network: str | None = None, environment: dict | None = None) -> str:
    cli = _client()
    try:
        cli.images.get(image)
    except ImageNotFound:
        cli.images.pull(image)
    out = cli.containers.run(
        image, command=command, volumes=volumes, network=network,
        environment=environment or {}, remove=True, stdout=True, stderr=True,
    )
    return out.decode("utf-8", "replace") if isinstance(out, (bytes, bytearray)) else str(out)


def _admin_dsn() -> str:
    """DB_URL rewritten to the maintenance `postgres` database (so we can drop/kill
    connections to `ckk` without being connected to it)."""
    parts = urlsplit(DB_URL)
    return urlunsplit((parts.scheme, parts.netloc, "/postgres", parts.query, parts.fragment))


def _db_name() -> str:
    return urlsplit(DB_URL).path.lstrip("/") or "ckk"


# ── operations ──────────────────────────────────────────────────────────────
def take_snapshot(reason: str) -> dict:
    """At-point full backup → pre-restore/<ts>/{db.dump,seaweed.tar.gz,manifest.json}."""
    ts = _stamp()
    rel = f"pre-restore/{ts}"
    (BACKUP_DIR / rel).mkdir(parents=True, exist_ok=True)
    manifest: dict = {"created_at": _now(), "reason": reason, "id": rel, "db": None, "storage": None}

    if DB_URL:
        STATE["phase"] = "snapshot: pg_dump"
        # NB: keep default ACL dumping (no --no-privileges) so the app role's
        # GRANTs are captured and restored — otherwise the app 500s post-restore.
        _run_oneshot(
            PG_IMAGE,
            ["sh", "-c", 'pg_dump -Fc --no-owner -d "$DB_URL" -f /out/db.dump'],
            volumes={_host_path(rel): {"bind": "/out", "mode": "rw"}},
            network=SHARED_DB_NETWORK, environment={"DB_URL": DB_URL},
        )
        manifest["db"] = f"{rel}/db.dump"

    STATE["phase"] = "snapshot: seaweed tar"
    _run_oneshot(
        HELPER_IMAGE,
        ["sh", "-c", "tar -czf /out/seaweed.tar.gz -C /src ."],
        volumes={SEAWEED_VOLUME: {"bind": "/src", "mode": "ro"},
                 _host_path(rel): {"bind": "/out", "mode": "rw"}},
    )
    manifest["storage"] = f"{rel}/seaweed.tar.gz"

    (BACKUP_DIR / rel / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def restore_db(rel: str) -> None:
    """Restore the ckk database from a custom-format pg_dump. Terminates other
    sessions first; pg_restore --clean --if-exists overwrites in place."""
    if not DB_URL:
        raise RuntimeError("DB restore disabled: RESTORE_DB_URL is not set")
    src = BACKUP_DIR / rel
    if not src.is_file():
        raise FileNotFoundError(f"db dump not found: {rel}")

    STATE["phase"] = "restore db: terminating connections"
    dbname = _db_name()
    _run_oneshot(
        PG_IMAGE,
        ["sh", "-c",
         'psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c '
         f'"SELECT pg_terminate_backend(pid) FROM pg_stat_activity '
         f"WHERE datname='{dbname}' AND pid<>pg_backend_pid();\""],
        volumes={}, network=SHARED_DB_NETWORK, environment={"ADMIN_URL": _admin_dsn()},
    )

    STATE["phase"] = "restore db: pg_restore"
    _run_oneshot(
        PG_IMAGE,
        ["sh", "-c",
         'pg_restore --clean --if-exists --no-owner '
         '--exit-on-error -d "$DB_URL" /in/' + Path(rel).name],
        volumes={_host_path(str(Path(rel).parent)): {"bind": "/in", "mode": "ro"}},
        network=SHARED_DB_NETWORK, environment={"DB_URL": DB_URL},
    )


def restore_storage(rel: str) -> None:
    """Restore the SeaweedFS volume from a tar.gz: stop the container, wipe the
    volume, untar, start it again."""
    src = BACKUP_DIR / rel
    if not src.is_file():
        raise FileNotFoundError(f"storage tar not found: {rel}")
    cli = _client()

    STATE["phase"] = "restore storage: stopping seaweedfs"
    container = None
    try:
        container = cli.containers.get(SEAWEED_CONTAINER)
        container.stop(timeout=30)
    except NotFound:
        pass  # not running here; proceed to write the volume

    try:
        STATE["phase"] = "restore storage: extracting"
        _run_oneshot(
            HELPER_IMAGE,
            ["sh", "-c",
             "rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null; "
             "tar -xzf /in/" + Path(rel).name + " -C /data"],
            volumes={SEAWEED_VOLUME: {"bind": "/data", "mode": "rw"},
                     _host_path(str(Path(rel).parent)): {"bind": "/in", "mode": "ro"}},
        )
    finally:
        STATE["phase"] = "restore storage: starting seaweedfs"
        if container is not None:
            container.start()


# ── Coolify app-version rollback ────────────────────────────────────────────
def _coolify_enabled() -> bool:
    return bool(COOLIFY_API_URL and COOLIFY_API_TOKEN)


def _coolify_api(method: str, path: str, body: dict | None = None) -> object:
    req = urllib.request.Request(
        f"{COOLIFY_API_URL}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {COOLIFY_API_TOKEN}",
                 "Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (internal, token-auth)
        raw = r.read().decode("utf-8", "replace")
    return json.loads(raw) if raw.strip() else None


def _coolify_app_uuid() -> str:
    apps = _coolify_api("GET", "/applications") or []
    for a in apps:
        if a.get("name") == COOLIFY_APP_NAME:
            return a["uuid"]
    raise RuntimeError(f"Coolify app not found: {COOLIFY_APP_NAME}")


def list_app_versions() -> dict:
    """Recent Coolify deployments of the configured app, so the operator can pick
    the commit that was live at the restore point."""
    if not _coolify_enabled():
        return {"enabled": False, "app": COOLIFY_APP_NAME, "versions": []}
    try:
        uuid = _coolify_app_uuid()
        deps = _coolify_api("GET", f"/deployments/applications/{uuid}") or {}
        rows = deps.get("deployments", deps) if isinstance(deps, dict) else deps
        versions = [{
            "sha": (d.get("commit") or d.get("git_commit_sha") or "")[:40],
            "message": (d.get("commit_message") or d.get("message") or "")[:120],
            "status": d.get("status"),
            "at": d.get("created_at") or d.get("finished_at") or "",
        } for d in (rows or []) if (d.get("commit") or d.get("git_commit_sha"))]
        return {"enabled": True, "app": COOLIFY_APP_NAME, "uuid": uuid, "versions": versions[:30]}
    except Exception as e:  # noqa: BLE001
        return {"enabled": True, "app": COOLIFY_APP_NAME, "error": str(e)[:160], "versions": []}


def rollback_app(sha: str) -> None:
    """Pin the app to a git commit and redeploy it via Coolify."""
    if not _coolify_enabled():
        raise RuntimeError("app rollback disabled: COOLIFY_API_URL / COOLIFY_API_TOKEN not set")
    STATE["phase"] = f"app rollback: pinning {sha[:12]}"
    uuid = _coolify_app_uuid()
    _coolify_api("PATCH", f"/applications/{uuid}", {"git_commit_sha": sha})
    STATE["phase"] = "app rollback: deploying"
    _coolify_api("GET", f"/deploy?uuid={uuid}")


def _run_restore(db_source: str | None, storage_source: str | None,
                 app_version: str | None, skip_snapshot: bool, actor: str) -> None:
    entry: dict = {"at": _now(), "actor": actor, "db_source": db_source,
                   "storage_source": storage_source, "app_version": app_version,
                   "skip_snapshot": skip_snapshot,
                   "snapshot_id": None, "status": "running", "error": None}
    try:
        if not skip_snapshot and (db_source or storage_source):
            snap = take_snapshot(reason=f"pre-restore(db={db_source}, storage={storage_source})")
            entry["snapshot_id"] = snap["id"]
        if db_source:
            restore_db(db_source)
        if storage_source:
            restore_storage(storage_source)
        # App redeploy runs LAST so the freshly-deployed app connects to the
        # already-restored DB + storage.
        if app_version:
            rollback_app(app_version)
        entry["status"] = "success"
        STATE["result"] = {"ok": True, "snapshot_id": entry["snapshot_id"]}
        STATE["error"] = None
    except Exception as e:  # noqa: BLE001
        entry["status"] = "error"
        entry["error"] = f"{type(e).__name__}: {e}"
        STATE["result"] = None
        STATE["error"] = entry["error"]
        traceback.print_exc()
    finally:
        entry["finished_at"] = _now()
        try:
            with LOG_PATH.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        STATE["running"] = False
        STATE["phase"] = "idle"
        STATE["finished_at"] = _now()


# ── listing ─────────────────────────────────────────────────────────────────
def _entries(globpat: str, kind: str) -> list[dict]:
    out = []
    for p in sorted(BACKUP_DIR.glob(globpat), reverse=True):
        if not p.is_file():
            continue
        st = p.stat()
        out.append({"id": str(p.relative_to(BACKUP_DIR)), "kind": kind,
                    "size": st.st_size, "mtime": _fmt_mtime(st.st_mtime)})
    return out


def _fmt_mtime(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def list_backups() -> dict:
    db = _entries("logical/daily/*.dump", "db") + _entries("logical/manual/*.dump", "db")
    storage = (_entries("seaweedfs/daily/*.tar.gz", "storage")
               + _entries("seaweedfs/monthly/*.tar.gz", "storage"))
    snapshots = []
    for d in sorted((BACKUP_DIR / "pre-restore").glob("*"), reverse=True):
        if not d.is_dir():
            continue
        man = d / "manifest.json"
        meta = json.loads(man.read_text()) if man.is_file() else {}
        snapshots.append({
            "id": f"pre-restore/{d.name}", "created_at": meta.get("created_at", d.name),
            "reason": meta.get("reason", ""),
            "db": meta.get("db"), "storage": meta.get("storage"),
        })
    return {"db": db, "storage": storage, "snapshots": snapshots,
            "db_restore_enabled": bool(DB_URL)}


# ── request models + routes ─────────────────────────────────────────────────
class SnapshotIn(BaseModel):
    reason: str = "manual"
    actor: str = "unknown"


class RestoreIn(BaseModel):
    db_source: str | None = None
    storage_source: str | None = None
    app_version: str | None = None
    skip_snapshot: bool = False
    actor: str = "unknown"
    confirm: str = ""


@app.get("/healthz")
def healthz():
    return {"status": "ok", "db_restore_enabled": bool(DB_URL),
            "app_rollback_enabled": _coolify_enabled(), "token_set": bool(TOKEN)}


@app.get("/backups", dependencies=[Depends(require_token)])
def backups():
    return list_backups()


@app.get("/app-versions", dependencies=[Depends(require_token)])
def app_versions():
    return list_app_versions()


@app.get("/status", dependencies=[Depends(require_token)])
def status():
    return STATE


@app.post("/snapshot", dependencies=[Depends(require_token)])
def snapshot(body: SnapshotIn):
    with _lock:
        if STATE["running"]:
            raise HTTPException(409, "an operation is already running")
        STATE.update(running=True, phase="snapshot", started_at=_now(),
                     finished_at=None, actor=body.actor, result=None, error=None)

    def _job():
        try:
            snap = take_snapshot(reason=body.reason)
            STATE["result"] = {"ok": True, "snapshot_id": snap["id"]}
        except Exception as e:  # noqa: BLE001
            STATE["error"] = f"{type(e).__name__}: {e}"
            traceback.print_exc()
        finally:
            STATE.update(running=False, phase="idle", finished_at=_now())

    threading.Thread(target=_job, daemon=True).start()
    return {"started": True}


@app.post("/restore", dependencies=[Depends(require_token)])
def restore(body: RestoreIn):
    if body.confirm != "RESTORE":
        raise HTTPException(400, "confirmation phrase mismatch")
    if not (body.db_source or body.storage_source or body.app_version):
        raise HTTPException(400, "select at least one of db / storage / app version")
    if body.db_source and not DB_URL:
        raise HTTPException(400, "DB restore is disabled (RESTORE_DB_URL not set)")
    if body.app_version and not _coolify_enabled():
        raise HTTPException(400, "app rollback is disabled (Coolify not configured)")
    with _lock:
        if STATE["running"]:
            raise HTTPException(409, "an operation is already running")
        STATE.update(running=True, phase="starting", started_at=_now(),
                     finished_at=None, actor=body.actor, result=None, error=None)
    threading.Thread(
        target=_run_restore,
        args=(body.db_source, body.storage_source, body.app_version,
              body.skip_snapshot, body.actor),
        daemon=True,
    ).start()
    return {"started": True}
