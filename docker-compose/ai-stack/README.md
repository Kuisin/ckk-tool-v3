# ai-stack — local LLM + Open WebUI + PDF extractor

Self-hosted AI stack for the CKK system. Runs on the **`docker-mac-pro`** host
(`kaiseisawada@192.168.50.15`, mDNS `docker-macpro.local`) under `~/ai-stack`.
This directory mirrors the live deployment so the setup can be recreated from scratch.

## Services

| Service      | Image                                   | Host port | Purpose |
|--------------|-----------------------------------------|-----------|---------|
| `ollama`     | `xxdoman/ollama-amd-rocm71-vl:latest`   | `11434`   | LLM/VLM runtime (Ollama API), AMD ROCm 7.1 GPU build |
| `open-webui` | `ghcr.io/open-webui/open-webui:main`    | `3000`    | Chat GUI, talks to `ollama` over the compose network |
| `po-extract` | built from [`./extractor`](./extractor) | `8000`    | FastAPI document → JSON endpoint (PDF data extraction) |

All three are one Compose project (`ai-stack`). Internal DNS uses the service
names (`http://ollama:11434`), so only `ollama` needs to be reachable by the others.

## Models

The extractor defaults to a **vision** model (`MODEL=qwen2.5vl`) because it feeds
rendered page images. Pull the models into the `ollama` volume after first start:

```bash
docker compose exec ollama ollama pull qwen2.5vl   # vision — used by po-extract
docker compose exec ollama ollama pull qwen2.5:7b  # text — general chat in Open WebUI
```

Currently installed on the host: `qwen2.5vl:latest`, `qwen2.5:7b`.

## GPU notes (AMD ROCm)

`ollama` uses an AMD GPU via ROCm. The `devices: [/dev/kfd]`,
`device_cgroup_rules: ['c 226:* rmw']`, and `volumes: [/dev/dri:/dev/dri]` lines
pass the GPU through and are **host-specific**. On a machine without an AMD GPU,
swap the image for the stock `ollama/ollama` and remove those three sections to
run on CPU (slower).

## Recreate the stack

```bash
# copy this directory to the host (or git pull there), then:
cd ~/ai-stack
docker compose up -d --build      # build po-extract + start all three
docker compose ps
docker compose exec ollama ollama pull qwen2.5vl
```

Named volumes `ai-stack_ollama` (models) and `ai-stack_open-webui` (chat data,
users, settings) persist across restarts. They are **not** in git — back them up
separately if the Open WebUI accounts/history matter.

## PDF extraction endpoint

`po-extract` exposes `POST /extract` (multipart): a `file` (PDF or image), a
`schema` field (a JSON Schema string describing the desired output), and an
optional `prompt` override. It renders up to `MAX_PAGES` (5) PDF pages at 300 DPI,
sends them to the vision model with `format=<schema>`, and returns parsed JSON.
`GET /healthz` reports status and the active model.

```bash
curl -s http://192.168.50.15:8000/extract \
  -F file=@order.pdf \
  -F 'schema={"type":"object","properties":{"po_number":{"type":["string","null"]},"total":{"type":["number","null"]}}}'
```

From the Next.js app, point at `http://<docker-mac-pro>:8000` (or the `ollama`
host directly at `:11434` for plain chat/completions).

## Source of truth

Live config was captured from `~/ai-stack/docker-compose.yml` on the host. No
`.env` file is used; all configuration is inline in `docker-compose.yml`. If you
change the stack on the host, update this directory too (and vice versa).
