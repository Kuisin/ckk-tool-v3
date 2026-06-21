# dockge — Docker Compose stack manager (GUI)

[Dockge](https://github.com/louislam/dockge) is a self-hosted web UI for managing
Docker Compose stacks. It's the GUI layer of the CKK infra (techstack container #10).

Deployed on **`docker-mac-pro`** (`kaiseisawada@192.168.50.15`) under `~/dockge`.
Web UI: <http://192.168.50.15:5001> (`http://docker-macpro.local:5001`).

## How it works

Dockge talks to the host Docker daemon via the mounted socket and shells out to
`docker compose`. Because those commands run on the **host**, the stacks directory
must be bind-mounted at the **same absolute path** inside the container as on the
host — that path is `DOCKGE_STACKS_DIR`. Any compose project placed in that
directory (one subfolder per stack, each with a `compose.yaml`/`docker-compose.yml`)
shows up in the UI and can be started/stopped/edited there.

## Configuration

Copy `.env.example` to `.env` and set the stacks directory:

```bash
cp .env.example .env
# DOCKGE_STACKS_DIR=/home/kaiseisawada/stacks   (default on docker-mac-pro; no sudo)
# DOCKGE_STACKS_DIR=/opt/stacks                 (Dockge default; needs sudo to create)
```

`/opt/stacks` is the upstream convention but requires root to create. On
`docker-mac-pro` the user has no passwordless sudo, so we use `~/stacks`.

## Deploy / recreate

```bash
# on the host, from ~/dockge:
mkdir -p "$DOCKGE_STACKS_DIR"          # or the path set in .env
docker compose up -d
docker compose ps
```

Then open the UI and create an admin account on first visit. `./data` holds
Dockge's database/settings (not in git).

## Bringing existing stacks under Dockge

Dockge only manages stacks that live inside `DOCKGE_STACKS_DIR`. The `ai-stack`
(ollama + open-webui + po-extract) currently runs from `~/ai-stack`. To manage it
from the UI, move it into the stacks dir (it keeps the same project name, so do it
while stopped):

```bash
cd ~/ai-stack && docker compose down
mv ~/ai-stack "$DOCKGE_STACKS_DIR/ai-stack"
cd "$DOCKGE_STACKS_DIR/ai-stack" && docker compose up -d
```

It will then appear in Dockge. (Skipped by default to avoid restarting the GPU
LLM containers.)
