---
title: "n8n と組む"
description: "n8n の Webhook ノードで合図を受け、署名を検証し、API で値を引く。取りこぼしを拾う定期実行まで。"
---
[連携の全体像](/manual/ja/integration)の構成を、n8n で実際に組む手順です。

## 用意するもの

| 用意 | どこで |
| --- | --- |
| API クライアント（ロール付き・有効化済み・トークン発行済み） | [API クライアント](/manual/ja/operations/system/external-api/user)（`SY0I`）と ユーザー管理（`SY01`） |
| n8n の **Header Auth 認証情報**（`Authorization: Bearer <トークン>`） | n8n の Credentials |
| 署名鍵（`whsec_…`） | Webhook を登録したときに 1 度だけ表示される |

**ロールは、読みたい資源の分だけ**付けます（例: 注文請書の合図が欲しいなら `order_acceptance:READ`）。付けていない資源のイベントは送られません。

## レシピ 1 — 合図を受けて、値を引く

```
[Webhook] → [Code: 署名を検証] → [IF: 欲しいイベントか] → [HTTP Request: API で引く] → [以降の処理]
```

1. **Webhook ノード**: メソッド `POST`、パスは推測されにくいものに。Options の **Raw Body** を ON、**Respond** は「Immediately」（すぐ 200 を返す）。この **Production URL** を CKK の「外向き Webhook」に登録します（n8n と同じ Docker ネットワークなら `http://n8n:5678/webhook/…` が使えます）。
2. **Code ノード**（署名の検証）:

```js
// n8n の Code ノード（「全アイテムに対して 1 回実行」）。
// 要件: Webhook ノードの Options → 「Raw Body」を ON、環境変数 NODE_FUNCTION_ALLOW_BUILTIN=crypto
const crypto = require("crypto");

const item = $input.first();
const raw = (await this.helpers.getBinaryDataBuffer(0, "data")).toString("utf8");
const h = item.json.headers;
const secret = $env.CKK_WEBHOOK_SECRET; // n8n 側の環境変数に whsec_… を入れておく

const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
const expected = crypto
  .createHmac("sha256", key)
  .update(`${h["webhook-id"]}.${h["webhook-timestamp"]}.${raw}`)
  .digest("base64");

const ok = (h["webhook-signature"] ?? "")
  .split(" ")
  .some((s) => s === `v1,${expected}`);
const fresh = Math.abs(Date.now() / 1000 - Number(h["webhook-timestamp"])) < 300;

if (!ok || !fresh) throw new Error("invalid webhook signature");
return [{ json: JSON.parse(raw) }];
```

   > n8n のバージョンによって生の本文の取り方が違います。動かないときは Webhook ノードの出力で「バイナリ」が出ているかを確かめてください。**検証を省くなら、URL を推測不能にし、n8n を社内ネットワークに閉じてください**（おすすめしません）。
3. **IF ノード**: `{{ $json.type }}` が欲しいイベントか（例: `order_acceptance.status_changed` かつ `status.to == CONFIRMED`）。
4. **HTTP Request ノード**: 認証は Header Auth。URL は `https://app-dev.ckk-tool.co.jp{{ $json.links.list }}`。応答の `data` から `number` が `{{ $json.resource.id }}` の行を選びます。値はここで初めて受け取ります。

重複排除が要るなら、`{{ $json.id }}` を n8n の Data Store（または DB）に覚えておき、既出なら止めます。

## レシピ 2 — 取りこぼしを拾う（定期）

Webhook が届かなかった・n8n が止まっていた間の分を、API の差分取得で埋めます。

```
[Schedule: 毎日 / 毎時] → [Code: 前回の syncedAt を読む] → [HTTP Request: ?updatedSince=…] → [Code: nextCursor があれば繰り返す] → [処理] → [Code: syncedAt を保存]
```

- `syncedAt` は **Workflow の Static Data**（`$getWorkflowStaticData('global')`）に保存します。
- 処理は**冪等**に。レシピ 1 と同じ行が重ねて届きます。
- 削除は `GET /api/v1/deletions?sinceEventId=` を別に回します。

## 書き込みについて

n8n から業務データを**作る・変える**口は、まだありません。注文書の PDF を渡して取り込ませるだけなら、[注文書取込](/manual/ja/operations/system/order-intake/user)（`SY0C`）の外部投入口が使えます。

## うまくいかないとき

| 症状 | 確かめること |
| --- | --- |
| 「テスト送信」が失敗する | 画面の通知にある理由。`resolved to a blocked address` なら URL が使えない宛先（ループバックなど）に解決されている |
| 何も届かない | 「配送履歴」に行があるか。無ければ**購読したイベント**と、API クライアントに付けたロール（`GET /api/v1/me` の権限コード）を見る |
| 署名が合わない | 生の本文を使っているか（パース後の JSON は不可）。署名鍵を**再発行**していないか。時計が 5 分以上ずれていないか |
| 送信先が無効になった | 5 回連続で打ち切られると自動停止します。直して有効化（承認が要ります） |
| 届くのが少し遅い | 仕様です（数秒〜十数秒）。急ぎでなければ問題ありません |
