# mailrelay — shared outbound SMTP

One internal SMTP relay so any app can send mail **from `no-reply@ckk-tool.co.jp`**
without its own mail credentials. Apps connect to `mailrelay:587` (no auth, internal
network only); the relay authenticates to the mailbox's host on **Sakura Rental
Server (`ckk-tool.sakura.ne.jp`)** and hands off — Sakura applies the domain's DKIM on
authenticated send, so delivery is reputable (no self-hosted-IP / PTR problem).

Deployed on `docker-mac-pro` at `~/stacks/mailrelay`. Postfix (`boky/postfix`).

## How apps use it

Attach the app's stack to the `mailrelay_default` network, then point its SMTP at:

| Setting | Value |
|---------|-------|
| SMTP host | `mailrelay` |
| SMTP port | `587` |
| Auth / TLS | none (internal trusted network) |
| From address | `no-reply@ckk-tool.co.jp` |

Per-app examples (set after the relay is live):
- **Metabase:** Admin → Settings → Email → host `mailrelay`, port `587`, no auth, from `no-reply@ckk-tool.co.jp`.
- **Open WebUI / Grafana / Next.js app:** the usual `SMTP_HOST=mailrelay`, `SMTP_PORT=587` env.

## Upstream (delivery via Sakura Rental Server)

The relay forwards to `ckk-tool.sakura.ne.jp:587` (STARTTLS submission), authenticated
as the `no-reply@ckk-tool.co.jp` mailbox (`.env`; username = the full email address).
The mailbox is managed in the Sakura control panel (`secure.sakura.ad.jp/rs/cp`).

> ⚠️ **SPF gap:** the domain's current SPF (`v=spf1 include:spf.secure.ne.jp -all`)
> only authorizes the onamae/secure.ne.jp mail host — **not** Sakura's outbound IPs.
> Add `include:_spf.sakura.ne.jp` to the SPF record so authenticated sends via Sakura
> pass SPF at the recipient. Inbound MX stays at `ak115.secure.ne.jp` (unchanged).

## Setup

```bash
cp .env.example .env     # RELAYHOST + USERNAME pre-filled; add RELAYHOST_PASSWORD
docker compose up -d
# test send:
docker exec mailrelay sh -c 'echo "test" | sendmail -f no-reply@ckk-tool.co.jp you@example.com'
docker logs mailrelay --tail 20   # look for "status=sent ... relay=ckk-tool.sakura.ne.jp"
```
