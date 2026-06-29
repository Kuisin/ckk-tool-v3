# ai-stack — local LLM + Open WebUI + PDF extractor

Self-hosted AI stack for the CKK system. Runs on the **`docker-mac-pro`** host
(`kaiseisawada@192.168.50.15`, mDNS `docker-macpro.local`) under
`~/stacks/ai-stack` — inside the [Dockge](../dockge) stacks dir, so it's managed
from the Dockge UI (<http://192.168.50.15:5001>). This directory mirrors the live
deployment so the setup can be recreated from scratch.

## Services

| Service      | Image                                   | Host port | Purpose |
|--------------|-----------------------------------------|-----------|---------|
| `ollama`     | `xxdoman/ollama-amd-rocm71-vl:latest`   | `11434`   | LLM/VLM runtime (Ollama API), AMD ROCm 7.1 GPU build |
| `open-webui` | `ghcr.io/open-webui/open-webui:main`    | `3000`    | Chat GUI, talks to `ollama` over the compose network |
| `searxng`    | `searxng/searxng:latest`                | —         | Private metasearch — powers Open WebUI's web search (no API keys) |
| `po-extract` | built from [`./extractor`](./extractor) | `8000`    | FastAPI document → JSON endpoint (PDF data extraction) |

One Compose project (`ai-stack`); services reach each other by name over the
internal network (`http://ollama:11434`, `http://searxng:8080`).

## Web search (internet access)

Open WebUI's **Web Search** is enabled and pointed at the local `searxng`
(`ENABLE_WEB_SEARCH=true`, `WEB_SEARCH_ENGINE=searxng`,
`SEARXNG_QUERY_URL=http://searxng:8080/search?q=<query>`). No external API keys —
SearXNG aggregates public engines and returns JSON results that Open WebUI feeds to
the model. In a chat, toggle **Web Search** on (the globe/＋ menu) to let the model
search the internet; `ENABLE_WEB_LOADER` also lets it read pasted URLs.

`searxng/settings.yml` enables the JSON format (required) and disables the rate
limiter for internal use. Its `secret_key` is a placeholder in git and is replaced
with a random value on deploy:

```bash
# on the host, generate a per-instance key (idempotent — only if still the placeholder):
sed -i "s/CHANGE_ME_ON_DEPLOY/$(openssl rand -hex 32)/" ~/stacks/ai-stack/searxng/settings.yml
docker compose up -d searxng open-webui
```

## Models

The extractor defaults to a **vision** model (`MODEL=qwen2.5vl`) because it feeds
rendered page images. Pull the models into the `ollama` volume after first start:

```bash
docker compose exec ollama ollama pull qwen3:32b   # primary chat model (Open WebUI default)
docker compose exec ollama ollama pull qwen2.5vl   # vision — used by po-extract
docker compose exec ollama ollama pull qwen2.5:7b  # small/fast text fallback
```

`open-webui` sets `DEFAULT_MODELS=qwen3:32b`, so it must be pulled for the default
to resolve. Currently installed on the host: `qwen3:32b`, `qwen2.5vl:latest`,
`qwen2.5:7b`.

The host has **2× AMD gfx906 (Vega 20) GPUs, 32 GB VRAM each (64 GB total)**, so a
32B model (~20 GB Q4) runs comfortably on a single GPU; 70B-class models fit when
split across both. Ollama auto-detects and uses both ROCm devices.

## GPU notes (AMD ROCm)

`ollama` uses an AMD GPU via ROCm. The `devices: [/dev/kfd]`,
`device_cgroup_rules: ['c 226:* rmw']`, and `volumes: [/dev/dri:/dev/dri]` lines
pass the GPU through and are **host-specific**. On a machine without an AMD GPU,
swap the image for the stock `ollama/ollama` and remove those three sections to
run on CPU (slower).

## Recreate the stack

```bash
# copy this directory into the Dockge stacks dir on the host (or git pull there):
cd ~/stacks/ai-stack
docker compose up -d --build      # build po-extract + start all three
docker compose ps
docker compose exec ollama ollama pull qwen2.5vl
```

Named volumes `ai-stack_ollama` (models) and `ai-stack_open-webui` (chat data,
users, settings) persist across restarts. They are **not** in git — back them up
separately if the Open WebUI accounts/history matter.

## PDF extraction endpoint

`po-extract` renders up to `MAX_PAGES` (5) PDF pages at 300 DPI and asks the
vision model to fill a JSON Schema (`format=<schema>`), returning parsed JSON.

**Typed methods (built-in schemas)** — `POST /extract/<doc_type>` (multipart:
`file` + optional `prompt`). No schema needed; each type's schema matches the v3
data model. Types: `order-request` (受注請書 intake — primary), `quote`,
`invoice`, `delivery-note`, `purchase-order`.

```bash
curl -s -X POST http://192.168.50.15:8000/extract/order-request -F file=@order.pdf
```

**Ad-hoc** — `POST /extract` with a caller-supplied `schema` (JSON Schema string):

```bash
curl -s http://192.168.50.15:8000/extract \
  -F file=@doc.pdf \
  -F 'schema={"type":"object","properties":{"po_number":{"type":["string","null"]}}}'
```

`GET /healthz` reports status + model + available `document_types`; `GET /schemas`
returns the built-in schemas.

From the Next.js app, point at `http://<docker-mac-pro>:8000` (or the `ollama`
host directly at `:11434` for plain chat/completions).

## Source of truth

Live config was captured from `~/ai-stack/docker-compose.yml` on the host. No
`.env` file is used; all configuration is inline in `docker-compose.yml`. If you
change the stack on the host, update this directory too (and vice versa).
