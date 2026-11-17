---
title: "Webhook — 変更の合図を受け取る"
description: "外向き Webhook の登録、イベントの形、署名の検証、再送とエラーの扱い。"
---
業務データが変わったとき、登録した URL へ **「何が起きたか」の合図**を POST します。イベントの一覧と形は **[リファレンス（Webhooks）](/manual/ja/integration/reference/webhooks)** にあります（コードから自動生成されるので、常に実装と一致します）。

> ⚠️ 現在は **検証環境（dev）でのみ** 使えます。

## 登録する

1. [API クライアント](/manual/ja/operations/system/external-api/user)（`SY0I`）を開き、下の「**外向き Webhook**」の「新規」を押します。
2. 名前・API クライアント・送信先 URL・受け取りたいイベントを選んで保存します。
3. **署名鍵（`whsec_…`）が 1 度だけ表示されます。** 必ず控えてください（再表示はできません。失くしたら「署名鍵を再発行」します）。
4. 「**テスト送信**」で疎通を確かめます（`webhook.ping` が 1 通飛びます）。

送信先の追加・URL の変更・署名鍵の再発行・有効化は、[特権アクセス](/manual/ja/operations/system/privileged-access/user)（`SY0G`）の承認が要ります。データを外へ出す口を増やす操作だからです。止める・消す・テスト送信・失敗分の再送は承認なしでできます。

### 送信先 URL の決まり

- `https://` はどのホストでも可。`http://` は**社内**（Docker のサービス名、`10.x`・`172.16–31.x`・`192.168.x`、`.loc` / `.local` / `.internal`）だけ。
- ループバック・リンクローカル（クラウドのメタデータ `169.254.169.254` を含む）は不可。送信の直前に名前を引き直して、そこでも確かめます。
- URL に `user:pass@` は入れられません。**リダイレクトは追いません**（3xx は失敗扱い）。
- n8n の Webhook URL は**それ自体が秘密**です。一覧では経路を伏せて表示します。

## 届くもの

```http
POST /webhook/ckk HTTP/1.1
content-type: application/json
webhook-id: evt_1234_order_acceptance.status_changed
webhook-timestamp: 1789000000
webhook-signature: v1,K5oZfzN95Z9UhFK…=
```

```json
{
  "id": "evt_1234_order_acceptance.status_changed",
  "type": "order_acceptance.status_changed",
  "apiVersion": "v1",
  "occurredAt": "2026-09-10T04:11:52.881Z",
  "resource": {
    "type": "order_acceptance",
    "id": "ORD-202609-00042",
    "key": "202609:42"
  },
  "status": { "from": "DRAFT", "to": "CONFIRMED" },
  "links": {
    "list": "/api/v1/order-acceptances?updatedSince=2026-09-10T04%3A11%3A51.881Z"
  }
}
```

- `id` / `webhook-id` は**再送でも同じ**です。受け取り側の重複排除に使います。
- `changedFields` は `.updated` のときだけ付き、**項目名だけ**（値は入りません）。`status` は `.status_changed` のときだけ付きます。
- `resource.id` は画面と同じ書類番号です。**採番が戻って番号が再利用される場合に備え**、`resource.key` も渡します。突き合わせにはこちらが確実です。
- 本体が欲しいときは `links.list` を、API クライアントのトークンで GET します。

### イベントの種類

`<資源>.created` / `.updated` / `.deleted`、状態を持つ資源にはさらに `.status_changed`（`.updated` と**両方**飛びます）。全一覧はリファレンスを見てください。`*`（すべて）も選べます。

## 署名を検証する

署名は [Standard Webhooks](https://www.standardwebhooks.com/) 互換です。各言語に検証ライブラリがあるので、**自前で書かずにそれを使うのがおすすめ**です。

```python
# pip install standardwebhooks
from standardwebhooks.webhooks import Webhook

wh = Webhook("whsec_…")          # 画面に 1 度だけ出た署名鍵
payload = wh.verify(raw_body, headers)   # 不一致なら例外
```

自前で書くなら、手順は次の 3 つです。**検証するのは、パースする前の生の本文**です。

1. `webhook-timestamp` が 5 分以内か確かめる。
2. `webhook-id` + `.` + `webhook-timestamp` + `.` + 生の本文 を、鍵（`whsec_` を除いた部分を Base64 デコードしたもの）で HMAC-SHA256 する。
3. Base64 にして `v1,<値>` と比べる（`webhook-signature` は空白区切りで複数入ることがあります）。

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody は **パースする前の文字列（バイト列）**。JSON.parse → stringify し直した値では一致しない。
export function verifyWebhook(rawBody, headers, secret) {
  const id = headers["webhook-id"];
  const ts = headers["webhook-timestamp"];
  const signatures = (headers["webhook-signature"] ?? "").split(" ");
  if (!id || !ts) return false;

  // 5 分より古い / 新しいものは再送攻撃として捨てる
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest();

  return signatures.some((s) => {
    const [version, b64] = s.split(",");
    if (version !== "v1" || !b64) return false;
    const got = Buffer.from(b64, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
```

## 配送の約束

- **少なくとも 1 回**届きます（重複あり）。順序は**保証しません**。`webhook-id` で重複を捨て、順序に依存しない処理にしてください。
- **2xx を返せば成功**です。それ以外・タイムアウト（10 秒）・リダイレクトは失敗として**再送**します。間隔は 30 秒 → 2 分 → 10 分 → 1 時間 → 6 時間 → 24 時間（初回を含めて計 7 回）。
- 応答は**先に返してください**（重い処理は後ろで）。
- 7 回とも失敗した配送は「失敗」で止まり、画面の「**配送履歴**」から**再送**できます。
- **失敗した配送が 5 回続いた送信先は自動で無効**になります。直したら画面から有効化します（承認が要ります）。
- 変更の直後ではなく、**数秒遅れて**届きます（コミットの順序が入れ替わる窓を避けるため）。
- 配送記録は 30 日で消えます。

## 権限と秘密

- 送るのは、送信先に紐づけた API クライアントが `…:READ` を持つ資源のイベントだけです。**送る時点で毎回確かめる**ので、権限を外せば止まります。
- 本文は「どの書類か」までで**値を含みません**。ただし、行ごとの権限（自分が作った書類だけ、など）で本来見えない書類の**番号と種別**は、イベントに載りえます。行ごとの見える範囲を厳密に守りたい資源は、Webhook を購読せず、**API の差分取得だけ**で読んでください（API は行スコープで絞った行しか返しません）。
- 署名鍵は暗号化して保管し（`SETTINGS_ENCRYPTION_KEY`）、画面には下 4 桁だけ出します。鍵が無い環境では送信先を作れません。
- 疑わしいときは「署名鍵を再発行」します。旧い鍵は**その場で**使えなくなります。

## 取りこぼしを拾う

Webhook は近道です。**1 日に 1 回などで API の差分取得**（`updatedSince`）を回して、受け取れなかったものを拾うと確実です（[API](/manual/ja/integration/api)）。
