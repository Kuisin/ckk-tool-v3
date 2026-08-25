# mailrelay — shared outbound SMTP

One internal SMTP relay so any app can send mail **from `no-reply@ckk-tool.co.jp`**
without its own mail credentials. Apps connect to `mailrelay:587` (no auth, internal
network only); the relay authenticates to the mailbox's host on **Sakura Rental
Server (`ckk-tool.sakura.ne.jp`)** and hands off — Sakura applies the domain's DKIM on
authenticated send, so delivery is reputable (no self-hosted-IP / PTR problem).

**Coolify 管理**（プロジェクト ckk / `common` 環境 / main 追従）。Postfix
（`boky/postfix`）。`deploy-stack.sh mailrelay` を使わないこと。

## How apps use it

リレーは **`coolify` ネットワーク**に居る（アプリが元から居るネットワーク。
以前の README は `mailrelay_default` に繋げと書いていたが、それだとアプリ側の
ネットワークを増やすことになるので、リレー側を `coolify` に出す形に変えた）。

| Setting | Value |
|---------|-------|
| SMTP host | `mailrelay` |
| SMTP port | `587` |
| Auth / TLS | 認証なし（社内ネットワークの 1 ホップ）。STARTTLS は自己署名なので検証しない |
| From address | `no-reply@ckk-tool.co.jp` |

**nextjs-web は 2026-08-25 からこの経路**（`SMTP_HOST=mailrelay`,
`SMTP_PORT=587`, `MAIL_FROM` 明示、`SMTP_USER`/`SMTP_PASS` は**設定しない**）。
`lib/mailer.ts` は資格情報が無ければ `auth` を渡さない実装になっている
（空の auth を渡すと nodemailer が AUTH を試み、認証を求めないリレーに拒否される）。

**なぜ直送をやめたか** — `sendMail` は失敗しても throw せず false を返すだけで
再送もしないので、さくら側が一時的に詰まると**通知メールが黙って消えていた**。
リレーを挟むと Postfix が受け取って数日間再送する。代わりに「配送できない」が
見えにくくなるため、Grafana に deferred / bounced のアラートを入れてある
（`monitoring/grafana/provisioning/alerting/mail-alerts.yaml`）。

その他のアプリ（未設定）:
- **Metabase:** Admin → Settings → Email → host `mailrelay`, port `587`, no auth。
- **Open WebUI / Grafana:** `SMTP_HOST=mailrelay`, `SMTP_PORT=587`。

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
