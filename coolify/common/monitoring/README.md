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
| `cadvisor`      | internal | per-container CPU / memory (ollama, open-webui, …) |
| `gpu-exporter`  | internal | AMD GPU util / VRAM / temp / power (from amdgpu sysfs) |

The GPU exporter ([`./gpu-exporter`](./gpu-exporter)) is a tiny Python service that
reads `/sys/class/drm/card*/device/` — no ROCm/kfd needed. Metrics:
`amdgpu_busy_percent`, `amdgpu_vram_used_bytes`, `amdgpu_vram_total_bytes`,
`amdgpu_temperature_celsius`, `amdgpu_power_watts`.

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
