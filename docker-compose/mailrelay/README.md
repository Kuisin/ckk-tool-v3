# mailrelay — shared outbound SMTP

One internal SMTP relay so any app can send mail **from `notification@ckk-tool.co.jp`**
without its own mail credentials. Apps connect to `mailrelay:587` (no auth, internal
network only); the relay forwards to an authenticated upstream and DKIM-signs.

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

## Upstream (delivery)

Cloudflare manages DNS but does **not** send outbound mail. The relay must hand off
to a real sender via `RELAYHOST` in `.env` — a transactional provider (SendGrid,
Mailgun, SES, Brevo, …) or a mailbox for the domain (Google Workspace / M365). See
`.env.example`.

## DNS to add in Cloudflare (for deliverability)

- **SPF** (`TXT` on `ckk-tool.co.jp`): authorize the upstream, e.g.
  `v=spf1 include:<provider-spf> ~all` (provider gives the include).
- **DKIM** (`TXT`): if the provider signs, add their key; if `DKIM_AUTOGENERATE=true`,
  publish this relay's generated public key (printed in the container logs / the
  `mailrelay-dkim` volume) as `mail._domainkey` (selector `mail`).
- **DMARC** (`TXT` on `_dmarc.ckk-tool.co.jp`): `v=DMARC1; p=quarantine; rua=mailto:notification@ckk-tool.co.jp`.

## Setup

```bash
cp .env.example .env     # fill RELAYHOST + creds
docker compose up -d
docker compose logs mailrelay   # grab the DKIM public key if auto-generated
```
