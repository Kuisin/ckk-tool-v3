# mailrelay — nextjs-web 専用の送信リレー

`no-reply@ckk-tool.co.jp` から送るための内部リレー。`mailrelay:587`（認証なし・
内部ネットワーク限定）で受け、**Sakura Rental Server (`ckk-tool.sakura.ne.jp`)** へ
認証して渡す。さくらが認証送信に DKIM を付けるので、自前 IP / PTR の問題が出ない。

## ⚠️ 使う相手を増やさない（方針）

**リレーを使うのは nextjs-web だけ。**「統一」を理由に他を寄せないこと。

リレーの実利は **送信に失敗しても後で再送される**ことの 1 点で、これが効くのは
nextjs-web だけ。`lib/mailer.ts` の `sendMail` は失敗しても throw せず `false` を
返すだけで再送もしない（通知はベストエフォートで業務を止めない設計）ため、上流が
一時的に詰まると**通知メールが黙って消える**。

**Metabase / Grafana / Open WebUI は各自の SMTP を直接使う。** どれも自前の
メール設定を持ち、失敗も表に出るので、共有基盤に寄せても得るものが無く依存だけが
増える。既に動いているものを書き換えない。

（リソースは判断材料ではない — 実測で mailrelay 35MiB / 0.02% CPU、mail-api 相当の
FastAPI が 50MiB。Metabase 単体で 1.47GiB。判断基準は「その利用者にとって再送に
意味があるか」。）

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

### 社内アプリは HTTP（mail-api）を使う

同じスタックに **`mail-api`**（FastAPI）を置いてある。アプリ側に SMTP の作法を
持たせないための薄い口で、配送・再送・DKIM は postfix が担う。

```
POST http://mail-api:8080/send
X-Mail-Token: <MAIL_API_TOKEN>
{ "to": "...", "subject": "...", "text": "...", "html": "…（任意）" }
→ 200 { "ok": true, "message_id": "<…>" }
→ 401 トークン不一致 / 502 リレーが受け取れなかった
GET  http://mail-api:8080/healthz   # SMTP へ到達できるかも含めて返す
```

差出人は **mail-api が固定**する（アプリごとに違う From を許すと、リレーの
`ALLOWED_SENDER_DOMAINS` と食い違ったときに原因が追いにくい）。`Message-ID` も
ここで採番する — postfix 任せだと `<>` になり、スレッド化と追跡の手掛かりが消える。

**nextjs-web は 2026-08-25 からこの経路**（`MAIL_API_URL=http://mail-api:8080` +
`MAIL_API_TOKEN`）。`lib/mailer.ts` は fetch を 1 回するだけになり、SMTP の
トランスポート設定・TLS・認証・差出人の組み立ては全部こちら側へ移った。

SMTP（`mailrelay:587`）の口も残してあるが、**今の利用者は居ない**（nextjs-web は
HTTP 経由）。将来リレーに載せるべきものが出たときのために開けてあるだけで、
既存の OSS ツールを寄せる意味ではない（上の方針を参照）。

**なぜ直送をやめたか** — `sendMail` は失敗しても throw せず false を返すだけで
再送もしないので、さくら側が一時的に詰まると**通知メールが黙って消えていた**。
リレーを挟むと Postfix が受け取って数日間再送する。代わりに「配送できない」が
見えにくくなるため、Grafana に deferred / bounced のアラートを入れてある
（`monitoring/grafana/provisioning/alerting/mail-alerts.yaml`）。

**他のアプリの設定例は載せない** — 載せると「寄せるのが正しい」と読めてしまう。
Metabase / Grafana / Open WebUI は各自のメール設定のままにすること。

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
