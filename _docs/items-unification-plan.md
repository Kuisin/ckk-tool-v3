# 品目統合と在庫まわりの計画（2026-09）

製品と素材を 1 つの品目マスタにまとめ、その上に在庫の画面を載せるまでの段取り。
**この文書は順番と理由の置き場**で、各段の実装の正はその PR と migration にある。

## いまどこにいるか

| | 状態 |
|---|---|
| 入出庫伝票（ST04）+ 棚卸（ST05） | 済（#888） |
| 在庫を独立カテゴリ ST へ / `/inventory/*` へ移設 | #891 |
| `app.items`（第 1 段 = 鏡を作る） | #892 |
| 在庫の統合（第 2 段 A）+ 在庫アプリ 4 本 | #893 |
| 購買の付け替え（第 2 段 B）+ 生産・設計（D） | `feat/items-stage2b`（PR 未作成） |
| 販売・出荷の付け替え（第 2 段 C） | `feat/items-stage2c`（PR 未作成。2b から分岐） |
| 旧いものを落とす（第 3 段） | これから（**C の merge 後に順番で**） |

**PR を 2 本に割ってある。** B + D と C を 1 本にまとめないのは、C が価格の
解決・請求・帳票・会計連携 CSV に届くため — そこだけ独立で読めるようにして
おきたい。C のブランチは B から分岐しているので、**B → C の順に merge する**。

## 目指す形

```
app.items            品目（item_type = PRODUCT | MATERIAL）
app.item_inventory   在庫（品目 × 拠点 × 保管場所 × 棚 × ロット × 半製品）
app.inventory_movements / _transactions   入出庫伝票とその明細
app.movement_types   移動タイプ（番号つき・利用者が増やせる）
```

製品と素材で 2 本立てになっている画面・ロジックが 1 本になる。

---

## 方針の変更（2026-09-19・利用者判断）

**まだ本番で動いていないので、切り替えは「写して、切り替える」で行う。**
expand / contract の丁寧な段取り（両側書き・逆トリガー・無停止）は取らない。
多少のデータ欠けは許容する、という判断。

これで消える心配ごと:

- デプロイの窓（旧アプリが旧表へ、新アプリが新表へ同時に書く問題）
- 逆向きトリガーと、その再帰を止める仕掛け
- 「読み手を移す」と「書き手を移す」を別デプロイに割る必要

代わりの段取り:

1. 新しい表へ**写す**（鏡を作る migration は済 — items / item_inventory）
2. アプリを**切り替える**（読み書きとも新しい表へ）
3. **旧いものを落とすのは別 PR**。順番に実行する（切り替えが行き渡ってから）

継ぎ目として置いた `ensureItemBucket`（品目 id → 旧 2 表のバケット）は、
2 の時点で役目を終えて消える。

## なぜこの順番か

**在庫の統合（第 2 段 A）を先にやる。** 新しい画面 3 本はどれも在庫を読むので、
品目種別で分かれたままだと 2 本立てで書くことになり、統合後に書き直しになる。
逆に販売書類（見積・受注・請求）の付け替えは新画面と無関係なので後ろでよい。

**販売書類をいちばん後ろに置く。** 金額に直結し、PDF・弥生 CSV・価格表解決まで
連なる。壊したときの影響がいちばん大きいところを、手順が枯れてから触る。

---

## 第 2 段 A — 在庫を `item_inventory` に統合

### uuid のおかげで、ここは masters よりずっと安い

`product_inventory` と `material_inventory` の主キーは **uuid**。衝突しないので、
**両方の id をそのまま持ち込める**。すると

- `inventory_transactions.inventory_id`
- `inventory_reservations.inventory_id`
- `stock_take_lines.inventory_id`

の 3 か所が**1 行も書き換えずに有効なまま**になる。masters 側が serial で
衝突したのとは事情が違う（#892 の id 節）。

さらに、これらは多態だったので**今まで FK が無かった**。統合すると参照先が
1 表に定まるので、**本物の FK を張れる**ようになる（整合性の純増）。

### 列の擦り合わせ

| | product_inventory | material_inventory | item_inventory |
|---|---|---|---|
| quantity | `Int` | `Decimal(12,3)` | **`Decimal(12,3)`**（int は損なく入る） |
| unit | 無し（マスタから） | 行に持つ | **行に持つ**（単位違いの合流を拒む既存の守りを残す） |
| lot_number / is_semi_finished / source_step_id | あり | 無し | あり（素材は null / false） |

`quantity` を Decimal に寄せると、製品数量を読んでいる箇所で `Number()` が要る。
`lib/inventory.ts` が唯一の書き手なので書き込み側は 1 ファイルで済むが、
**読み出し側は `data.ts` 群を洗う**（`inventory-availability-core` は数値のみで無傷）。

### 段取り（3 PR）

1. **A-1 鏡を作る** … `item_inventory` を作り、両表から id を保って流し込み、
   トリガーで同期。アプリは従来どおり。`items` と同じやり方。
2. **A-2 書き手を移す** … `lib/inventory.ts`（+ kiosk twin）と在庫の `data.ts` を
   `item_inventory` へ。**単一書き手であることが効く** —
   `inventory-writer-guard.test.ts` で「数量を動かすのは applyTransaction だけ」を
   既に門にしてあるので、書き込みの移設は実質 1 ファイル。移した時点でトリガーを
   止め、旧表は読み取り専用にする。
3. **A-3 FK を張る** … 3 表の `inventory_id` に `item_inventory` への FK を追加。

> ⚠️ `lib/inventory.ts` は kiosk との twin。`pnpm twin:sync` と
> `twin-files.test.ts` を必ず通す。共有端末は工程完了で在庫を動かす。

---

## 新画面 3 本（第 2 段 A のあと）

### B. 移動タイプ + 手動入出庫

**移動タイプ**（`app.movement_types`）は SAP の移動タイプ相当。番号つきで、
利用者が設定アプリから増やせる。

```
code            varchar unique   -- 番号（101 / 201 / 311 …）。人が決める
name            json
direction       IN | OUT | TRANSFER
requires_from   boolean          -- 出庫元の保管場所が要るか
requires_to     boolean          -- 入庫先が要るか
is_active / sort_order / notes
```

`inventory_movements` に `movement_type_id` を足す。**既存の `cause`（enum）は
残す** — あれは「どの処理が起こしたか」という**システム側の分類**で、移動タイプは
**業務側の分類**。片方でもう片方を兼ねさせると、自動生成の伝票に人が決めた
番号を無理に割り当てることになる。自動生成は `cause` のみ、手動は両方を持つ。

**手動入出庫アプリ** … 移動タイプを選ぶ → from/to を入れる → 品目と数量 → 伝票を
1 枚起こす。**from/to は必ず記録する**（移動タイプが `requires_from/to` で
どちらが要るかを決める）。入庫だけの型でも「どこへ」は必ず残る。

**設定アプリ**で移動タイプを追加・編集。既定の数本（入庫 / 出庫 / 保管場所間移動 /
廃棄）を seed で入れる。**使用済みの型は削除させない**（伝票が指しているため）—
`is_active=false` に倒す。

### C. 拠点／保管場所別 在庫一覧

全品目 × 拠点 × 保管場所の現在庫。`item_inventory` があれば素直な一覧 1 本。
列: 品目（種別バッジ）/ コード / 拠点 / 保管場所・棚 / ロット / 手持ち / 予約 /
利用可能 / 単位 / 更新日。絞り込み: 拠点・保管場所・品目種別・コード検索。

> **在庫管理（ST01）の 製品/素材 タブと中身が重なる。** 利用者の指示で別アプリに
> する。重複を残す判断なので、どちらかを直すときは両方を見ること。

### D. 品目別 在庫推移・所要量（MD04 相当）

品目 × 拠点で、**過去（履歴）と未来（所要量）を 1 本の時系列**に並べる。

- 過去 … `inventory_transactions`（伝票番号つき）
- 現在 … 手持ち − 予約
- 未来 … 入庫予定と出庫予定を日付順に累積した残高

`lib/atp-core.ts` は**いま供給しか見ていない**（手持ち − 予約 + 発注入荷）。
需要を足して、3 種別すべてに広げる:

| | 供給 | 需要 |
|---|---|---|
| 素材 | 発注済（ORDERED）の明細 `expected_at` | 指示書の素材予約 |
| 製品 | 進行中の指示書 `planned_quantity` | 確定済み注文明細の未出荷分 `delivery_date` |
| 半製品 | 工程が産む分 | **モデルが無い**（下記） |

**製品の入庫予定日**は指示書に納期列が無いので、割当明細の最早 `delivery_date`
から導く（`WorkOrderStepsPanel` の予定納期と同じ出どころ）。在庫向け指示書
（割当ゼロ）は日付未定として末尾に置く — `atp-core` の既存の扱いと同じ。

---

## 列の名づけ — 品目を 2 つ指す表がある

**指示書は品目を 2 つ指す**: 作るもの（製品）と使うもの（素材）。最初どちらも
裸の `item_id` にしようとしたが、それだと第 2 段 D で製品を足したときに
どちらがどちらか分からなくなる。

  work_orders.material_item_id   使う素材（第 2 段 B）
  work_orders.product_item_id    作る製品（第 2 段 D）

指す品目が 1 つの表（発注明細・入荷・購買依頼明細・注文明細 …）は `item_id` のまま。
**「その表が品目を 1 つしか指さない」ことを確かめてから裸の名前を使う。**

## 第 2 段 B / D / C — 参照側 18 表の付け替え

`items` の鏡は既にあるので、各表は `item_id` 列を足して
`products.item_id` / `materials.item_id` をたどって埋める → アプリを移す →
旧列を落とす（落とすのは第 3 段）。

| 群 | 表 | 触るファイルの目安 |
|---|---|---|
| **B 購買**（`material_id`） | `material_purchase_order_items` / `material_receipts` / `purchase_request_items` / `work_orders.material_id` | 20 前後 |
| **D 生産・設計**（`product_id`） | `work_orders` / `product_process_routes` / `inspection_templates` / `design_requests` / `design_files` | 100 前後（`work_order` が広い） |
| **C 販売**（`product_id`） | `quote_items` / `order_lines` / `delivery_order_items` / `delivery_note_items` / `estimates` / `price_list_entries` / `customer_product_codes` | 150 前後 |

B から始めるのは小さいから。C を最後にするのは金額に直結するから。

### 各群で必ず巻き込まれるもの

- **AI 突合** … `lib/product-match.ts` / `lib/material-match.ts` は
  `match_names` と `productMatchKey` を見る。`items.match_names` に統合済みなので
  **2 本を 1 本に畳める**（C と B のときに）。`match_aliases.target_type` の値
  （`products` / `materials`）も `items` へ寄せる移行が要る。
- **価格試算** … `estimates` は材種・直径・黒皮研磨で材料を指す（`materials` 行では
  ない）ので、**この統合の影響を受けない**。`product_id` の付け替えだけ。
- **`/api/v1`** … `/products` `/materials` `/inventory/*` の 4 本。**外部契約なので
  URL は変えない** — 中で `items` を読んで従来の形で返す。第 3 段でも残す。
- **権限** … 製品・素材のマスタ画面はどちらも `master` コードで、**分かれていない**。
  権限まわりの移行は不要（当初 2 コードあると誤って見積もっていた）。

---

## 第 2 段で **わざと残したもの**（第 3 段の入口はここ）

切り替えの途中で「片側だけ移すと壊れる」ものが 3 つあり、いずれも**揃えて移す**
と決めて据え置いた。第 3 段はここから始める。

| 残したもの | なぜ | 移すときの条件 |
|---|---|---|
| ~~`resolveWorkOrderTarget` / `work-order-alloc-core` / `WorkflowBuilder` の製品ピッカー~~ | **済**（下記「指示書の製品ピッカー 3 点」） | — |
| 価格表の自然キー `(customer_bp_id, product_id)` | 「価格表の識別は作成後不変」という約束がある | 鍵の差し替えとして独立に判断する。第 3 段のついでにやらない |
| ~~突合（`lib/intake.ts` / `product-match.ts` / `material-match.ts`）~~ | **済**（下記「突合と CM02 の移行」） | — |
| ~~帳票の `code` 欄（見積書・納品書）~~ | **済**（下記「帳票の `code` 欄」） | — |
| ~~`/api/v1` の id~~ | **済**（下記「`/api/v1` の id」） | — |

### 指示書の製品ピッカー 3 点（済）

`routesInfo.productId` を共有していた 3 か所を**同時に**品目へ移し、共有する
state の名前を **`itemId`** に改めた（列名が同じままだと、次に半端な直し方を
しても型で止まらない）。実際に動いたのは 3 つより広く、**同じ state を食べて
いたものは全部**同じコミットで移している:

- `resolveWorkOrderTarget`（`{ productId }` → `{ itemId }`。在庫向けは
  `items` を `itemType: "PRODUCT"` 付きで確かめる — 品目 id は 1 本の連番
  なので、素材の id でも「存在はする」）
- `work-order-alloc-core` の `LineAllocInfo.itemId`（「全行同一製品」の不変条件）
- `WorkflowBuilder` の製品ピッカー（`searchProductOptions` →
  `searchProductItemOptions`）とフォームの `itemId`
- `getProductRoutesForOrderLine` / `getProductRoutesForProduct` /
  `getDesignVersionsForProduct` / `getWorkOrderMaterialAssumption` /
  `OrderLineRef` / `InspectionTemplateOption`

★ **途中で live なバグが 1 件見つかった。** `listProductRoutes(productId)` は
中で `itemIdForLegacyProduct` を通していたのに、製品マスタ (MS04) が第 3 段で
URL を items.id へ移したあと**品目 id をそのまま渡していた**。連番同士なので
エラーにはならず、**別の製品の工程リストを引いていた**。引数を `itemId` に
変えて変換を落とした（呼び出し側は全部 items.id を持っている）。

`searchProductOptions` は使い手が無くなったので削除した — これで
**旧 id（products.id / materials.id）を返すピッカーは 1 本も無い**。

書き込みの橋だけが残る: `work_orders.product_id` はまだ NOT NULL なので、
create / update / copy の 3 か所で `legacyProductIdForItem` を 1 回だけ通す。
読み・判定は通らない。

### 帳票の `code` 欄（済）

見積書・納品書の PDF が刷っていた `code` は**内部の連番 id**（`42`）だった。
利用者判断で **`items.code`（`PRD-YYYYMM-NNNN`）を刷る**ことにした — あの欄が
最初から意味していたもの。採番前のレガシー品目（`code` が null）は**空欄**で
刷る（`"null"` のような文字列を客先の紙に出さない）。ビューモデルの
`productLegacyId` は `productCode: string | null` に置き換え、旧 id の配管は
消した。

### `/api/v1` の id（済 — clean break）

`/products` `/materials` `/inventory/*` `/work-orders` `/order-lines`
`/delivery-orders` `/delivery-notes` の 7 本。**URL も項目名も応答の形も
変えず、id の値だけ**を `items.id` に切り替えた（利用者判断。橋を架けると
旧マスタを落とせなくなる橋が外部契約の側にできる）。

連番同士なので**旧 id は「見つからない」ではなく別の行に当たる**。切り替え前の
カーソルも `(updated_at, id)` なので同じ理由でずれる。連携先は全件同期から
やり直し、保存済みの id ではなく `code` / `number` で引き直す — この注意は
**`_specs/api.md` §6.1** と **`/api/v1/openapi.json` の説明**（`lib/api-openapi.ts`
の `DESCRIPTION`）の両方に置いた。連携先が読むのは後者なので、片方だけに
書かない。

### 突合と CM02 の移行（済 — migration `20261101090000_items_stage3_matching_forms`）

列ではなく**値として旧 id を貯めていた** 2 か所。どちらも FK が無いので、旧表を
落としても DB は何も言わず、連番同士なので**黙って別のレコードを指す**。

- `app.match_aliases` … `target_type` の `products` / `materials` を **`items` 1 つ**に
  畳み、`target_id` を `products.item_id` / `materials.item_id` 経由で書き換えた。
  - **曖昧なら捨てる** … 参照先が消えている行と、旧 id とも items.id とも読める
    素材の行は削除して件数を NOTICE に出す。学習を捨てても推測に落ちるだけだが、
    行き先を推測で残すと**別の品目で自動確定する**。
  - **衝突は 1 本だけ残す** … 製品と素材が同じ `alias_key` を覚えていたら
    `hit_count → updated_at → id` の降順で 1 本。落ちた側は次の訂正で覚え直す。
    型が違えば実害も無い（突合側が `itemType` を確かめて素通りする）。
  - ★ **素材の学習は今まで 1 件も保存されていなかった** — baseline の CHECK が
    `business_partners | products` のままで `materials` を弾き、
    `saveAliasLearnings` の try/catch が握り潰していた。CHECK もここで張り替え、
    `match-alias-target-guard.test.ts` が型と SQL の食い違いを見張る。
- `app.form_responses.answers`（CM02 の `lookup` = product / material）…
  `(form_id, version)` → `form_versions.schema` を辿って lookup 項目を特定し、
  トップレベルとサブテーブルの列の両方を書き換えた。**引けない値は `id` を空に
  する**（`label` は選んだ時点のスナップショットなので残す）。旧 id を置いたままに
  すると旧表を落とした後に別の品目として解決されるが、空なら
  `asLookupValue` が解決を試みず `isBlankAnswer` が空と見なすので、必須項目は
  次の編集で目に見えて止まる。

**`product-match.ts` と `material-match.ts` は 1 本に畳まなかった。** マスタは
1 つになったが**当て方の規則が違う** — 製品は probe の梯子で DB に候補を出させ
（数万件）、素材は全件を JS へ渡す（数千件）。そして素材はコードの完全一致が
別格（仕入先がこちらの品番を刷り返してくる）。共有すべきもの（正規化キー・
最小長・段階判定）は既に共有している。

書き込みの橋（`lib/item-legacy-material.ts` / `item-legacy-product.ts`）は旧列が
残っている間だけのもの。**読み・突合・業務判定は通さない**（そこを通し始めると
旧列を落とせなくなる）。第 3 段で列と一緒に消す。

## 第 3 段 — 旧いものを落とす

1. アプリ側に `products` / `materials` / 旧在庫表への参照が 1 つも無いことを
   grep の門で確認（`items-readonly-guard.test.ts` を反転させた形）。
   **残っている読み手は「書き込みの橋」だけ**のはず —
   `lib/item-legacy-product.ts` / `item-legacy-material.ts` と、それを呼ぶ
   マスタ 2 画面・書類の保存処理・`work_orders.product_id`（NOT NULL）。
   旧 id で来る URL の転送（`/master/{products,materials}/legacy/[id]`）は
   監査ログの旧 id を開くためのものなので、落とすときに別途判断する
2. トリガーと同期関数を落とす
3. 旧列（`*.product_id` / `*.material_id` / `*.item_id` の対応列）を落とす
4. `products` / `materials` / `product_inventory` / `material_inventory` を落とす
5. `inventory_transactions.inventory_type` は**残す**か畳むかを別途判断
   （品目から引けるので冗長だが、既存の索引と `/api/v1` が使っている）

**落とすのは別 PR で、切り替えの PR を入れたあとに順番に実行する**（利用者判断）。
本番稼働前なので無停止の段取りは取らないが、**順序だけは守る** — 切り替えより先に
落とすと、まだ旧表を読んでいるコードが即死する。

---

## 横断して効く注意

- **デプロイ順は決められない。** アプリと migrator は同じ merge から別々に走る。
  列の追加は安全、削除と `NOT NULL` の後付けは**必ず次の PR**へ。
  （#888 で `movement_id NOT NULL` を分けたのと同じ理由。）
- **kiosk の twin** … `inventory.ts` / `workflow-core.ts` / `numbering.ts` ほか。
  在庫に触る段では必ず `pnpm twin:sync`。
- **`items` は第 2 段が終わるまで鏡**。アプリから書かない（門あり）。
- **マイグレーションは merge が唯一の引き金**。手で当てない。
- 各段の受け入れは「まっさらな DB へ migrate deploy → grants → cron → analytics →
  `migrate diff` 差分なし」＋実データでの往復確認まで。#888 / #892 と同じ。

## 段ごとの受け入れ条件

| 段 | これが満たせたら次へ |
|---|---|
| 2A-1 | `item_inventory` の行数・数量合計が旧 2 表と一致 |
| 2A-2 | 在庫が動く全経路（完了・出荷・入荷・移動・引当・棚卸）を通し、伝票と数量が一致。孤児 0 |
| 2A-3 | 3 表の `inventory_id` に FK が張れる = 参照先の取りこぼしが無い |
| B/D/C 各群 | その群の `item_id` が全行埋まり、旧列と指す先が一致 |
| 3 | 旧参照が grep で 0、`migrate diff` 差分なし |

## 見積もり感

PR 数でおよそ **10 本**（2A で 3、新画面で 3、2B/2D/2C で 3、第 3 段で 1）。
新画面 3 本は 2A-2 が終われば並行して進められる。
