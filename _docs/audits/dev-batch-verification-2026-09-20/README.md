# dev バッチ検証（2026-09-20）— PR #879〜#897

対象: `origin/dev` @ `40ed2c1e`（#897 merge、main から 18 PR 先）。
方法: 使い捨て Postgres に全 migration + 全デモシードを流し、本番ビルドを
`:3100` で起動 → 静的検査（lint / tsc / vitest 2471 / kiosk 586 / CI ガード）→
全画面巡回（audit-crawl + 新設の page-load.spec.ts）→ **Sonnet エージェント 5 名が
領域ごとに UI を実操作し DB で裏取り**（各報告は同じディレクトリの `*.md`）。

## 結果

| 検査 | 結果 |
|---|---|
| migrate deploy（まっさら DB）| OK — ただし `shipping-billing-demo-seed.sql` が落ちた（下記 1） |
| web lint / tsc / vitest | OK（最終 2520 件） |
| kiosk lint / tsc / vitest | OK（586 件、双子ファイル無変更） |
| 全画面の読み込み（page-load.spec.ts） | **219 passed / 0 failed / 53 skipped**（行の無い一覧） |
| audit-crawl（280 画面 × 2 幅） | pageerror 0・本文の欠陥 0。横スクロール 2 は既知（2026-09-09 監査で受容済み） |
| エージェント実操作 | billing 10/10・inventory 25/25・production・sales・system — 各報告参照 |

## 見つけて直したもの（このブランチ）

1. **シード**: `billing_closings` の部分 unique 化（#895）で `shipping-billing-demo-seed.sql` の ON CONFLICT が落ちる
2. **シード**: `dev-role-users-seed.sql` の 23 名全員の password_hash が「dev2026」を検証しなかった（最初から）
3. **シード**: 承認フローがメンバー無しのグループ 1/2 を指し、4 書類とも誰も承認できない
4. **シード**: デモシードの行に品目 id が無く、素材名が空・工程リストが「未登録」に見える（`demo-items-backfill.sql`）
5. **在庫**: ST01/ST04/ST05 の 8 部品のパンくずが「生産」のまま（#891 の取り残し）
6. **在庫**: 伝票事由 `MANUAL` のラベル欠け → 生の "MANUAL" が 3 言語で出る。同種の抜けを止める `enum-labels-complete.test.ts` を追加し、`INSPECTION_STATUS.APPROVED` の欠けも発見・修正
7. **マニュアル**: 本文 54 ファイルの内部リンクが旧パス（在庫 2 ページ・承認管理）のまま。在庫 2 ページは互いを旧パスで参照し Link 先読みが**止まらない輪**になっていた。`manual-links.test.ts` を追加
8. **会計**: 科目コードの形が SY0J（自由）と MS0F/MS01（半角数字 8 桁）で食い違い、`T10` が片方で弾かれる → 1 規則に統一
9. **請求**: 追加費用ありの下書きで詳細画面から「発行」が消える（承認フロー未設定でも）→ 依頼中だけ隠す
10. **請求**: 手動請求の締日が UTC の暦日（JST 0〜9 時は前日）→ JST
11. **品目**: 指示書が旧 `material_id` を書かない（#896 の方針違反）
12. **販売**: 顧客品番の表記ゆれ重複が製品をまたぐと通る（#881 が塞いだと書いた事例）
13. **販売**: 注文明細の配送節が、開いて最初の値を入れた瞬間に閉じる

## 足した恒久的な試験

- `src/lib/route-inventory.test.ts` — app-list の href / next.config の redirect の行き先が実ページに届く
- `src/lib/enum-labels-complete.test.ts` — Prisma enum の全値に 3 言語のラベルがある
- `src/lib/manual-links.test.ts` — マニュアルの内部リンクがリダイレクト頼みでない
- `src/components/billing/invoices/model.canIssue.test.ts`
- `tools/docs-screenshots/page-load.spec.ts` + `scripts/e2e-pages.ts` + CI `pages` ジョブ — 全画面の読み込み確認

## 直していないもの（報告のみ）

- 出荷書フォームの 在庫保管 モードが注文請書/顧客を要求して先へ進めない（production 報告 — 既存、#883 とは無関係）
- 会計 CSV の「科目が一意に決まらない束は 409」は適当なシードが無く未実行
- PDF / AI 取込 / 設計図アップロードは外部サービス（Gotenberg / SeaweedFS / po-extract）が無いローカルでは検証不能

## 環境で踏んだこと

- 使い捨て DB `ckk-shots-db`（既定名）が別ワークツリーの撮影パイプラインに消された → セッション固有名（`ckk-shots-db-dbv`）で立て直し。`e2e-pages.ts` の既定名は撮影と違えてある
