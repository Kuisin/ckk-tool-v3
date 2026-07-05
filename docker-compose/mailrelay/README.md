# mailrelay — shared outbound SMTP

One internal SMTP relay so any app can send mail **from `notification@ckk-tool.co.jp`**
without its own mail credentials. Apps connect to `mailrelay:587` (no auth, internal
network only); the relay authenticates to the domain's own mail host
(**onamae.com / `ak115.secure.ne.jp`**) and hands off — onamae applies the domain's
SPF/DKIM, so delivery is reputable (no self-hosted-IP / PTR problem).

Deployed on `docker-mac-pro` at `~/stacks/mailrelay`. Postfix (`boky/postfix`).

## How apps use it

Attach the app's stack to the `mailrelay_default` network, then point its SMTP at:

| Setting | Value |
|---------|-------|
| SMTP host | `mailrelay` |
| SMTP port | `587` |
| Auth / TLS | none (internal trusted network) |
| From address | `notification@ckk-tool.co.jp` |

Per-app examples (set after the relay is live):
- **Metabase:** Admin → Settings → Email → host `mailrelay`, port `587`, no auth, from `notification@ckk-tool.co.jp`.
- **Open WebUI / Grafana / Next.js app:** the usual `SMTP_HOST=mailrelay`, `SMTP_PORT=587` env.

## Upstream (delivery via onamae.com)

The relay forwards to `ak115.secure.ne.jp:587` (STARTTLS submission), authenticated
as the `notification@ckk-tool.co.jp` mailbox (`.env`). Because the final hop is the
domain's own mail host, the existing SPF/DKIM records (already at onamae) cover it —
**no extra Cloudflare DNS or relay-side DKIM needed**. The mailbox must exist (create
it in the onamae control panel if needed).

## Setup

```bash
cp .env.example .env     # RELAYHOST + USERNAME pre-filled; add RELAYHOST_PASSWORD
docker compose up -d
# test send:
docker exec mailrelay sh -c 'echo "test" | sendmail -f notification@ckk-tool.co.jp you@example.com'
docker logs mailrelay --tail 20   # look for "status=sent ... relay=ak115.secure.ne.jp"
```
