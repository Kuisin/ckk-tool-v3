---
title: "ロールと権限"
description: "システムのロール（職務セット）と権限コードの一覧。誰が何をできるかの一覧表と、ユーザーへの割り当て方をまとめています。"
---
このシステムの権限は **ロール**（職務のまとまり）で管理します。ユーザーには直接
権限を付けず、ロールを割り当てます。1 人に複数のロールを割り当てられ、その場合は
**すべてのロールの権限を合わせたもの** がそのユーザーの権限になります。

> このページは **いま dev データベースに入っている実データ** を元にしています。
> 最新の一覧が必要なときは `_docs/rbac-role-matrix.xlsx`（Excel 版）を参照してください。
> 個別ユーザーの実効権限は **SY01 ユーザー管理** の詳細画面で確認できます。

## 3 つの言葉

権限は「**誰が**（ロール）**何に**（権限コード）**どうする**（アクション）」を、
必要なら「**どこまで**（スコープ）」付きで表します。

- **権限コード** … 業務のまとまり 1 つ。アプリ 1 個とは限りません（例: `master`
  はマスタ管理 12 アプリ全部、`order_acceptance` は注文請書と注文明細の 2 つ）。
- **アクション** … R=閲覧 / C=作成 / U=更新 / D=削除 / E=エクスポート /
  ◎=ADMIN（そのコードの全アクション）。承認はアクションではありません —
  誰が承認できるかは **MS0B 承認設定** の承認グループ所属で決まります。
- **スコープ** … その操作が及ぶ範囲。無印は **ALL（全件）**。
  - **OWN** … 自分が作成した行だけ
  - **PLANT** … 自分の所属拠点の行だけ（所属は SY01 ユーザー管理で設定）
  - **REGION** … 自分の所属拠点が属する地域の行だけ

同じコードに複数のロールから権限が来る場合は、**いちばん広いスコープ** が勝ちます
（PLANT と ALL を両方持っていれば ALL）。

## ロール一覧

| ロール | rolename | 用途 |
|---|---|---|
| 管理者 | `admin` | 全権限。システム管理（SY01〜）とキオスク管理（SY08〜）を触れる唯一のロール |
| 管理職（承認者） | `manager` | 全業務の閲覧・エクスポート。部門をまたぐ承認者向け（承認可否は MS0B のグループ所属で決まる） |
| 営業部長 | `sales_manager` | 営業データを全件フル操作 + 全業務閲覧 |
| 営業 | `sales` | 営業データを **自分の分だけ** 作成・編集（OWN） |
| 営業補佐 | `sales_assistant` | 営業データを全件閲覧のみ。作成・編集・承認は不可 |
| 購買部長 | `purchasing_manager` | 購買データを全件フル操作 + 全業務閲覧 |
| 購買 | `purchasing` | 購買依頼・素材発注・入荷・外注の実務 |
| 製造部長 | `production_manager` | 製造データを全件フル操作 + 全業務閲覧 |
| 製造・生産管理 | `production` | 指示書・工程実行・在庫（**所属拠点のみ**） |
| 品質部長 | `quality_manager` | 指示書を全件フル操作 + 全業務閲覧 |
| 品質・検査 | `quality` | 検査記録・検査承認（**所属拠点のみ**） |
| 出荷部長 | `shipping_manager` | 出荷データを全件フル操作 + 全業務閲覧 |
| 出荷 | `shipping` | 出荷書・納品書の実務（出荷書と在庫は **所属拠点のみ**） |
| 経理部長 | `accounting_manager` | 請求・締日を全件フル操作 + 全業務閲覧 |
| 経理 | `accounting` | 請求書・締日処理・弥生 CSV |
| 閲覧 | `viewer` | 全業務の閲覧のみ（役員・監査向け） |
| 一般 | `staff` | 移行期の暫定ロール。システム・キオスク以外を全部できるので、**本番では部門ロールへの置き換えを推奨** |

## 権限コードと対象アプリ

| 権限コード | 名称 | 対象アプリ |
|---|---|---|
| `price_list` | 価格表 | SA01 価格試算 / SA02 価格表 |
| `quote` | 見積書 | SA03 見積書 |
| `order_acceptance` | 注文請書・注文明細 | SA04 注文請書 / SA05 注文明細 |
| `design_request` | 設計依頼 | SA06 設計依頼書 |
| `purchase_order` | 素材発注・購買依頼 | PU01 購買依頼 / PU02 素材発注書 |
| `material_receipt` | 素材入荷 | PU03 素材入荷 |
| `outsource_order` | 外注依頼 | PU04 外注依頼 |
| `work_order` | 指示書 | PD02 指示書 / PD05 未処理指示書（キオスクの工程実行・指示書スキャンも同じコード） |
| `approve` | 承認管理 | PD03 承認管理 |
| `inventory` | 在庫 | PD04 在庫管理 |
| `delivery_order` | 出荷書 | SH01 出荷書 / SH03 未処理出荷書 |
| `delivery_note` | 納品書 | SH02 納品書 |
| `invoice` | 請求書 | BL01 請求書 |
| `billing_closing` | 締日処理 | BL02 締日処理（弥生 CSV の書き出しは E） |
| `master` | マスタ管理 | MS01〜MS0E のマスタ 12 アプリすべて |
| `admin_manual` | 管理マニュアル | DC02 管理マニュアル（このページ） |
| `kiosk` | キオスク管理 | SY08 QRカード管理 / SY09 端末管理 / SY0A 共有端末設定 |
| `system` | システム管理 | SY01〜SY0C のシステムアプリすべて |

## 権限マトリクス（販売・購買）

| ロール | 価格表 | 見積書 | 注文請書 | 設計依頼 | 購買 | 入荷 | 外注 |
|---|---|---|---|---|---|---|---|
| **管理者**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **管理職（承認者）**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE |
| **営業部長**<br/>`sales_manager` | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |
| **営業**<br/>`sales` | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | — | — | — |
| **営業補佐**<br/>`sales_assistant` | R | R | R | R | — | — | — |
| **購買部長**<br/>`purchasing_manager` | R | R | R | R | RCUDE | RCUDE | RCUDE |
| **購買**<br/>`purchasing` | — | — | — | — | RCUDE | RCUDE | RCUD |
| **製造部長**<br/>`production_manager` | R | R | R | R | R | R | RCUDE |
| **製造・生産管理**<br/>`production` | — | — | RU | — | R | R | RU |
| **品質部長**<br/>`quality_manager` | R | R | R | R | R | R | R |
| **品質・検査**<br/>`quality` | — | — | R | — | — | — | — |
| **出荷部長**<br/>`shipping_manager` | R | R | R | R | R | R | R |
| **出荷**<br/>`shipping` | — | — | R | — | — | — | — |
| **経理部長**<br/>`accounting_manager` | R | R | R | R | R | R | R |
| **経理**<br/>`accounting` | R | R | R | — | — | — | — |
| **閲覧**<br/>`viewer` | R | R | R | R | R | R | R |
| **一般**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE |

## 権限マトリクス（生産・出荷・請求・管理）

| ロール | 指示書 | 承認管理 | 在庫 | 出荷書 | 納品書 | 請求書 | 締日 | マスタ | 社内文書 | キオスク | システム |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **管理者**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **管理職（承認者）**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE | RE | RE | — | — |
| **営業部長**<br/>`sales_manager` | — | R | — | — | — | — | — | R | — | — | — |
| **営業**<br/>`sales` | — | — | — | — | — | — | — | R | — | — | — |
| **営業補佐**<br/>`sales_assistant` | — | — | — | — | — | — | — | R | — | — | — |
| **購買部長**<br/>`purchasing_manager` | R | R | R | R | R | R | R | R | R | — | — |
| **購買**<br/>`purchasing` | R | R | R | — | — | — | — | R | — | — | — |
| **製造部長**<br/>`production_manager` | RCUDE | R | RCUDE | R | R | R | R | R | R | — | — |
| **製造・生産管理**<br/>`production` | RCUDE<br/>PLANT | R | RCUE<br/>PLANT | R | — | — | — | R | — | — | — |
| **品質部長**<br/>`quality_manager` | RCUDE | R | R | R | R | R | R | R | R | — | — |
| **品質・検査**<br/>`quality` | RU<br/>PLANT | R | R | — | — | — | — | R | — | — | — |
| **出荷部長**<br/>`shipping_manager` | R | R | RCUDE | RCUDE | RCUDE | R | R | R | R | — | — |
| **出荷**<br/>`shipping` | R | — | RU<br/>PLANT | RCUDE<br/>PLANT | RCUDE | — | — | R | — | — | — |
| **経理部長**<br/>`accounting_manager` | R | R | R | R | R | RCUDE | RCUDE | R | R | — | — |
| **経理**<br/>`accounting` | — | — | — | R | R | RCUDE | RCUE | R | — | — | — |
| **閲覧**<br/>`viewer` | R | R | R | R | R | R | R | R | R | — | — |
| **一般**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |

## 読むときの注意

### 承認は権限アクションではなく承認グループで決まる

承認できる人の管理は **承認設定（MS0B）だけ**で行います。承認・差し戻しを
押すのに必要な権限は、その書類の **閲覧（R）または更新（U）** だけで、
「承認」というアクションのグラントはありません（旧 A=承認 は全廃済み）。
つまり「その書類を開ける + その段の承認グループのメンバー（または期間内の
代理）」が揃えば承認できます。部長ロールを付けただけでは承認できない、
というのはこのためです。

### 「できる」と「見える」は別

この表は **何ができるか** であって、**ホーム画面に何が並ぶか** ではありません。
本番（main）のランチャー表示は別の仕組み（アプリ管理 SY05 / feature flags）が
決めていて、権限があっても未公開のアプリは本番に出ません。dev では既定で全部
出ます。

### システム管理とキオスク管理は管理者だけ

`system` と `kiosk` は業務ロールには配っていません。ユーザー管理・アプリ管理・
操作履歴・QRカード・端末管理は **管理者ロールのみ** が触れます。
なおファイル管理（SY06）は例外で、**権限不要で誰でも開けます** — 見える範囲は
フォルダ権限（個別付与）と業務アプリの閲覧権限（そのアプリが作った PDF）で
決まり、権限が無ければ空表示になるだけです。

## ユーザーへの割り当て

1. 対象者に一度 SSO でログインしてもらう（初回ログインで `app.users` に行ができます）。
2. **SY01 ユーザー管理** でロールを割り当てます。所属拠点（PLANT / REGION スコープの
   基準）も同じ画面で設定します。
3. 承認する人は **MS0B 承認設定** で、その書類のフローが使うグループの
   メンバーにも追加します。

## 権限そのものを変えるとき

ロールの中身（どのコードにどのアクションを与えるか）は SQL のシードが正です。

- `shared-db/sql/rbac-seed.sql` … 権限コード 18 個 + `admin` / `staff`
- `shared-db/sql/roles-seed.sql` … 運用ロール 15 個の権限マトリクス

編集したら DB へ適用し（どちらも冪等）、Excel 版を作り直します。

```bash
cd shared-db
./scripts/remote-db.sh sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles-seed.sql'
./scripts/remote-db.sh python3 ../tools/rbac-matrix/build_rbac_xlsx.py
```
