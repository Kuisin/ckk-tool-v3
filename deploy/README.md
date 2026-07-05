# Deploy — nextjs-web (webhook → pull/build/restart)

Auto-deploys `nextjs-web` to the self-hosted Linux server on every commit to `main`.

```
push to main
  └─ GitHub Actions (.github/workflows/deploy-nextjs.yml)
       └─ POST HMAC-signed webhook ──► Nginx (TLS) ──► webhook receiver (127.0.0.1:9000)
                                                          └─ deploy.sh
                                                               git reset --hard origin/main
                                                               docker compose build nextjs-web
                                                               docker compose up -d nextjs-web
```

GitHub only sends a signed trigger — **all pull/build/restart work happens on the server**, inside your Docker Compose folder. Nothing is built in CI.

## Files

| File | Runs where | Purpose |
|------|-----------|---------|
| `.github/workflows/deploy-nextjs.yml` | GitHub Actions | On push to `main`, POST an HMAC-signed webhook to the server |
| `deploy/webhook/hooks.json` | Server | [adnanh/webhook](https://github.com/adnanh/webhook) hook: verify signature → run `deploy.sh` |
| `deploy/webhook/deploy.sh` | Server | `git reset --hard` + `docker compose build/up -d` for the service |
| `deploy/webhook/webhook.service` | Server | systemd unit running the webhook receiver on `127.0.0.1:9000` |

`deploy.sh` is configured through env vars (set in `webhook.service`): `STACK_DIR` (the compose folder — must be a git checkout of the repo the server deploys), `SERVICE` (default `nextjs-web`), `DEPLOY_BRANCH` (`main`), `GIT_REMOTE` (`origin`).

## 1. GitHub secrets

Add two repo secrets. Generate the shared secret once:

```bash
SECRET=$(openssl rand -hex 32)
echo "$SECRET"   # keep this — you also paste it into hooks.json on the server

gh secret set DEPLOY_WEBHOOK_SECRET --body "$SECRET"
gh secret set DEPLOY_WEBHOOK_URL    --body "https://deploy.example.com/hooks/deploy-nextjs-web"
```

`DEPLOY_WEBHOOK_URL` is the public HTTPS URL of the receiver (see step 3).

## 2. Server: install the receiver

```bash
# Debian/Ubuntu (or grab the binary from the adnanh/webhook releases page)
sudo apt-get install -y webhook

sudo useradd --system --create-home --shell /usr/sbin/nologin deploy
sudo usermod -aG docker deploy          # allow docker compose without sudo

sudo mkdir -p /opt/ckk/deploy
sudo cp deploy/webhook/hooks.json deploy/webhook/deploy.sh /opt/ckk/deploy/
sudo chmod +x /opt/ckk/deploy/deploy.sh
sudo chown -R deploy:deploy /opt/ckk

# Paste the SAME secret from step 1 into hooks.json, then lock the file down:
sudo sed -i 's/REPLACE_WITH_DEPLOY_WEBHOOK_SECRET/'"$SECRET"'/' /opt/ckk/deploy/hooks.json
sudo chmod 600 /opt/ckk/deploy/hooks.json

sudo cp deploy/webhook/webhook.service /etc/systemd/system/ckk-webhook.service
# Edit STACK_DIR / SERVICE in the unit to match your compose folder + service name, then:
sudo systemctl daemon-reload
sudo systemctl enable --now ckk-webhook
```

`STACK_DIR` must already be a git checkout of the repo (with the `nextjs-web` compose service and its Dockerfile) and have the `origin` remote pointing at wherever the server should pull from.

## 3. Expose over HTTPS (Nginx)

The receiver listens only on `127.0.0.1:9000`; publish it through the existing Nginx with TLS:

```nginx
location /hooks/ {
    proxy_pass http://127.0.0.1:9000/hooks/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The path must line up with `DEPLOY_WEBHOOK_URL` and the hook `id` in `hooks.json`
(`/hooks/deploy-nextjs-web`).

## 4. Test

- **From GitHub:** Actions tab → *Deploy nextjs-web* → *Run workflow* (or push any commit to `main`).
- **From the server**, tail the receiver: `journalctl -u ckk-webhook -f`.
- **Signature check without a push:**

  ```bash
  BODY='{"ref":"refs/heads/main","sha":"test"}'
  SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.*= //')"
  curl -fsS -X POST https://deploy.example.com/hooks/deploy-nextjs-web \
    -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $SIG" --data "$BODY"
  ```

## Security notes

- HMAC-SHA256 over the request body — an attacker without the secret cannot trigger a deploy.
- Serve only over **HTTPS**; keep `9000` bound to localhost + firewalled.
- `hooks.json` holds the secret in plaintext → `chmod 600`, owned by the `deploy` user.
- `deploy.sh` runs `git reset --hard`; never hand-edit files under `STACK_DIR`.
- Deploys are serialized with `flock`; overlapping triggers are dropped, not queued.
