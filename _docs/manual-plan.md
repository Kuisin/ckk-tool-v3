# マニュアル整備プラン — 業務フロー編・管理設定編（2026-08）

> **このプランの業務フロー編は実装済み・改稿済み**（`flow/` ではなく
> `content/manual/process/` に標準フロー + 分野別 5 ページとして着地。
> 文体・図・スクリーンショットの現行規約は `_docs/manual-style-beginner.md`
> の「プロセス編の例外」を参照）。残る未実装は管理・設定編（`admin/`）のみ。

対象: `/manual`（fumadocs, `coolify/apps/nextjs-web/content/manual/`）。
前提: アプリ別マニュアル（apps/・masters/・system/ 全ページ × ja/en/zh × 実
スクリーンショット）は整備済み（PR #326–#328）。操作コードは 2026-08 に業務
フロー順へ再編済み（`_specs/operation-code.md` が正）。

このプランは残る 2 章の新設と、それに伴う既存ページの接続を定める。
実行はセクション単位（1 バッチ = 1 ブランチ = 1 PR → dev）。撮影・検証の
作法は `tools/docs-screenshots/README.md` に従う。

---

## 1. 業務フロー編（`content/manual/flow/`）— 新設

アプリ別ページは「1 画面の操作」を教えるが、「仕事がどう流れるか」を教える
章が無い。フロー編は **伝票の連鎖・状態遷移・承認ポイント・在庫への影響** を
アプリ横断で説明する。各ページの構成テンプレート:

1. **フロー図** — 全体像（fumadocs-core 同梱の mermaid remark プラグイン
   `remark-mdx-mermaid` を有効化して mermaid で描く。有効化が難しければ
   スクリーンショットと同じ assets 管理で SVG/PNG を置く）
2. **ステップ表** — 順に: 操作コード / アプリ / 誰が（権限・ロール）/
   何が起きる（DB 上の状態遷移・在庫変動）
3. **ステータス遷移** — `_specs/design.md` §9 のバッジと同じ用語・色名で
4. **承認・制御ポイント** — 誰の承認で先へ進むか、何がロックされるか
5. **つまずきどころ** — 差し戻し・キャンセル・巻き戻しの動き

### ページ一覧

| slug | 内容 | 主な題材 |
|---|---|---|
| `flow/sales` | 販売フロー: 試算 SA01 → 価格表 SA02 → 見積書 SA03 → 注文請書 SA04 → 注文請書 PD01 | 見積単価の自動解決（価格表 tiers）、試算スナップショット（確定後は再計算されない）、AI 取込（PDF→自動入力）、価格差異 (PRICE_DIFF) の再調整、伝票展開 |
| `flow/production` | 生産フロー: 注文請書 PD01 → 指示書 PD02 → 承認 PD03 → 工程実行（キオスク）→ 検査 → 完成在庫 | 第一/第二承認（承認グループ・代理）、工程 DAG と数量伝播（良品/半製品/廃棄/手直し）、セッションロック、一時停止の扱い、検査の型別自動合否、完成時の在庫計上 |
| `flow/purchasing` | 購買フロー: 購買依頼 PU01 → 承認 → 素材発注書 PU02 → 素材入荷 PU03 → 素材在庫。付録: 外注依頼 PU04 | 承認フロー（REQUESTED→APPROVED→ORDERED→COMPLETED）、入荷予定と在庫予約、直接調達入荷、仕入実績が試算の参照単価になる連環 |
| `flow/shipping-billing` | 出荷・請求フロー: 出荷書 SH01 → 納品書 SH02 → 請求書 BL01 → 締日処理 BL02 → 会計エクスポート | 在庫引落し、直送/通常納品の違い（価格記載の有無）、締日と請求期間、弥生会計 CSV |

- `flow/meta.json`: 上記 4 ページ順。セクションタイトル ja「業務フロー」/
  en "Business Flows" / zh「业务流程」。
- ルート `meta.json` の `pages` は `["start", "user-settings", "using-docs",
  "flow", "apps", "masters", "system"]` に更新。
- `start.md` の「4. 販売の流れ」は flow/sales への導入に書き換え（重複させない）。
- 各アプリページの冒頭に「このアプリが属するフロー」への 1 行リンクを追加。

### 情報ソース（執筆時に必ず突き合わせる）

- `_docs/business_flow.md` / `_docs/manufacturing_details.md`（業務仕様の原典）
- `_specs/feature/01-sales.md` 〜 `05-cross-cutting-and-appendix.md`
- ステータス: `_specs/design.md` §9（色・和名はここに厳密一致）
- 実装の正: `lib/workflow.ts`（DAG/数量）、`lib/purchasing.ts`（発注承認）、
  `lib/inventory.ts`（引当・予約）、`lib/journal.ts`（仕訳）
- 画面は必ず実物確認（`docs:seed` → `--reuse` で開く）。デモシード
  （sales/masters/purchase/production/shipping-billing-demo-seed.sql）が
  フロー全段の実データを持っているので、フロー図の番号は実在の伝票番号
  （PRC-202607-… / PO-202607-… / 指示書 9001…）で例示できる

## 2. 管理・設定編（`content/manual/admin/`）— 新設

「ソフトウェアの制御と構成」— 権限・承認・採番・アプリ設定という
「管理者が決めること」を 1 章に集約する。system/（システムアプリの操作）とは
役割分担: system/ は画面の使い方、admin/ は**何をどう決めるとシステム全体が
どう変わるか**。

| slug | 内容 |
|---|---|
| `admin/permissions` | 権限と表示制御: ロール → 権限コード × アクション（READ/CREATE/…/ADMIN）→ user_permissions 集約、アプリ表示との関係（requiredPermission）、環境別アプリ公開（feature flags, dev/main）。ロール一覧と代表的な割当例（admin/staff/部門ロール） |
| `admin/approval-flows` | 承認の全体像: 承認グループ 3 種（第一/第二/ワークフロー変更）、メンバーと期間限定代理、どの伝票がどの承認を通るか（指示書 2 段階・素材発注・ワークフロー変更）、差し戻しの動き。APPROVE 権限とグループ所属の二重ゲート |
| `admin/numbering` | 文書番号の体系: EST/PRC/QOT/ORD/PO/DRN/INV（月次リセット）と指示書/ロットの通し番号、素材コードの採番構成（MS07 との関係）、番号は変更不可であることの説明 |
| `admin/app-settings` | アプリ設定の全体像: SY02 試算計算（計算基準・工具種・カスタム入力・後処理フック — 変更しても確定済み試算は再計算されない）、SY03 製品項目 / SY04 製品種別、system_settings ストアの考え方（設定は即時反映・履歴は操作履歴 SY07 で追える） |

- `admin/meta.json`: 上記 4 ページ順。タイトル ja「管理・設定ガイド」/
  en "Administration Guide" / zh「管理与设置指南」。
- ルート `meta.json` の `pages` 末尾（system の前）に `admin` を挿入。
- キオスク運用（カード・端末・設定）は既存の `system/kiosk-*` 3 ページが
  カバー済み — admin/ からリンクだけ張る。端末セットアップ（APK 配布等）は
  引き続き `/internal-docs`（社内のみ）。

## 3. 既存ページへの接続（小修正）

- `start.md` §3 操作コード例とアプリ紹介順を再編後のコード（SA01 試算…）の
  まま維持（再編同期済み）。§4 は flow/sales へ誘導。
- `using-docs`: 章構成の説明に flow / admin を追記。
- `index.md`（3 ロケール）: 「内容」リストに業務フロー編・管理設定編を追加。
- apps/product-inventory・material-inventory の 2 ページは統合アプリの
  2 ビューとして現状維持（PD04 で正）。

## 4. 撮影・図版

- フロー編は図が主役: mermaid（`remark-mdx-mermaid` 有効化を先に検証）または
  静的 SVG。スクリーンショットは各フロー 2–3 枚（承認パネル・価格差異バナー・
  工程 DAG など「状態が見える」画面に限る）。manifest の id は `flow-<name>-NN`。
- admin/ は SY02 の設定画面・承認グループ編集・アプリ管理の環境トグルを撮影
  （admin 権限撮影は `user: "admin"` を使用 — demo1）。
- 撮影後は毎回 `docs:verify`（diff < 0.1%）と `docs:lint` を通す。

## 5. 実行バッチ（1 バッチ = 1 PR）

1. **B1 flow/sales + flow/purchasing** — 販売・購買の 2 フロー + mermaid 検証
   + ルート meta / start.md / index の接続
2. **B2 flow/production** — 最も重い 1 ページ（DAG・承認・キオスク・検査）
3. **B3 flow/shipping-billing** — 出荷請求フロー + 会計連携
4. **B4 admin/ 4 ページ** — 権限・承認・採番・アプリ設定
5. **B5 総仕上げ** — 相互リンク総点検、en/zh 翻訳の最終化、`docs:verify`、
   dev で実機確認 → 昇格候補

各バッチの完了条件: ja/en/zh 揃い・lint/verify/build 通過・実画面と記述の
一致確認済み・PR に Before/After のページ一覧を記載。

## 5.5 初心者向け全面書き直しで判明した宿題（2026-08-15）

アプリ別マニュアル 45 ページを初心者向けに書き直した際
（`_docs/manual-style-beginner.md` に準拠）、次が未解決として残った。

### 撮影できていない画面（インフラ待ち）

| 画面 | 必要なもの |
|---|---|
| ファイル管理の一覧・プレビュー・カラム・検索（4 枚） | 撮影スタックに SeaweedFS が無く「ストレージに接続できません」の状態になる。撮影用 compose に seaweedfs を足し、`app.files` に固定キーのデモ行を数件シードする |
| 端末管理のフロアマップ配置 | `system-demo-seed.sql` はフロアマップを作らない方針。`kiosk_floor_maps` + 図面画像 + ピン配置のシードが要る |
| QRカードの印刷シート | Gotenberg 生成 PDF のため Playwright で撮れない。`src/pdf-templates/kiosk-cards.html` を直接 HTML として開いて撮る案がある |
| QRカードの「ユーザーに割当」モーダル | 管理者コンテキストで `/settings/kiosk-cards` を開くと別画面（製品項目）が写る事象があり原因未特定。他の 3 枚があるためページは成立している |

該当ページは現状その画像なしで完結するよう書いてある（本文は残していない）。

### 付随して見つかった不具合 → **全 4 件修正済み（2026-08-15）**

1. ~~**納品書の検証メッセージが製品名でなく内部 ID を出す**~~ → 製品名 + 製品コードを
   引いて表示するよう修正（`validateItemsAgainstShipment`）。
2. ~~**請求書の税ラベルが 10% 固定**~~ → 顧客の課税区分から
   「消費税（10%）/（8%）/（非課税）」を出し分け（画面 + PDF テンプレート）。
   `taxLabel()` を `components/billing/invoices/model.ts` に追加。
3. ~~**製品フォームの「製品コード」が内部 ID を表示**~~ → `initial.code`（PRD- コード）に修正。
   複製モーダルの「複製元」も製品名 + コード表示へ。
4. ~~**アクション/スコープが英字のまま**~~ → `PERMISSION_ACTION_LABEL` /
   `PERMISSION_SCOPE_LABEL` を `lib/enum-labels.ts` に追加し、SY01 実効権限テーブルを日本語化
   （閲覧・作成・更新・削除・書き出し・承認・管理 / 全社・地域・拠点・自分の担当…）。
   マニュアル側の「英字の読みかた」解説も日本語ラベル前提に書き換え済み。

### 仕様書との用語ずれ

`_specs/design.md` は 工場 と書くが、出荷済みの UI は 拠点 で統一されている。
マニュアルは UI に合わせて 拠点 とした。仕様書側の追随が必要。

## 6. やらないこと（スコープ外）

- PDF 版マニュアル・バージョン別マニュアル
- キオスク端末上のヘルプ表示（別途検討）
- 動画・GIF（静止画 + 図で足りない箇所が出たら再検討）
