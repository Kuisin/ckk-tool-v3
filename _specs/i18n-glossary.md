# 翻訳ルールと用語集（ja / en / zh）

**多言語化の作業規則（§2）と、語の対訳表（§3）。** 画面の文言を訳すとき・足すとき・
直すときは、必ずこの 1 本を引く。訳語が画面ごとに揺れると、同じ「差し戻し」が
Sent back と Rejected と Returned に割れ、利用者から見て別の操作に見える。

- **この文書が i18n の正。** `messages/{ja,en,zh}.json` と
  `nextjs-kiosk/src/lib/i18n/messages/` は、どちらもここに従う。
- **ルール（§2）は作業手順**。キーの付け方・変数の使い方・言語別の書き方・
  確認項目まで含む。訳文を書く前に読む。
- **用語表（§3）の 3 列（ja / en / zh）は 1 対 1** で固定する。同じ ja に 2 つの訳を
  当てない（文脈で割れる語は §5「要確認」に上げ、割る根拠と一緒に決める）。
- **確認のしかた** — 各表の「要確認」欄が空でない行と §5 だけ見れば足りる。空欄は
  既存の実装・キオスクの既訳・業界慣用に沿った素直な訳。

対応言語は `ja` / `en` / `zh`（`src/lib/i18n/index.ts` の `LOCALES`）。zh は
**簡体字（zh-CN）**。

---

## 1. 現状（2026-08-30 時点）

| 項目 | 状態 |
|---|---|
| 言語の定義（ja/en/zh） | 済 — `nextjs-web/src/lib/i18n/index.ts`、`app.users.locale` に保存 |
| next-intl の配線 | 済 — `messages/{ja,en,zh}.json`。ただし中身は **common / shell / preferences のみ**（約 60 語） |
| キオスク（nextjs-kiosk） | **ja/en/zh 完備** — `src/lib/i18n/messages/{ja,en,zh}.ts`（約 250 行 × 3） |
| Web 画面の文言 | **ほぼ全部が日本語の直書き** |
| マニュアル（DC01/DC02） | `lib/docs-i18n.ts` で言語別。プロセス編は ja のみの約束 |

Web アプリ内の日本語文字列リテラル（`.ts` / `.tsx`）は **ユニークで約 5,650 件**。
このうち短い語（14 文字以下）で 3 回以上出るものが約 260 件 — それがこの用語集の
母集団で、残りは文（説明文・エラーメッセージ）なので語ではなく文として訳す。

**DB の多言語列は別問題。** `products.name` などの `{ ja, en }` JSON は
**zh を持っていない**（`_specs/tables.md` の規約）。マスタ名称を中国語で出すなら
列の形を `{ ja, en, zh }` に広げる判断が要る — §5 に上げてある。

---

## 2. 翻訳ルール

翻訳作業をするとき（新しい画面を多言語化する / 文言を足す / 既訳を直す）は、
**この節と §3 の用語表に従う**。迷ったら「既にあるものに合わせる」が優先で、
新しい言い方を発明しない。

### 2.0 大原則

1. **ja が原文**（`messages/ja.json` が正）。en/zh は ja から訳す。en を経由して zh を作らない（二重の意訳になる）。
2. **語は §3 の表から取る。** 表にある ja に対して表と違う訳を書かない。表に無い語が要るなら、まず表に足してから使う（§2.9）。
3. **ja を直すのが先。** 日本語自体が不適切なら（揺れ・現場と違う語）、多言語化の前に ja を直す。3 言語ぶん直し直すことになる。
4. **意味が変わるくらいなら長くてよい。** 短くするために意味を削らない。レイアウトは §2.7 の方法で合わせる。
5. **UI 文言だけが対象。** データ（マスタ名称・取引先名・enum の値）は翻訳対象ではない（§4）。

### 2.1 英語 (en)

- **Sentence case**（`Work order`）。Title Case にしない。固有名詞と略語だけ大文字（PDF / QR / AI / CSV / BP）。
- 画面ラベルは**名詞**、ボタンは**動詞の原形**（`Save` / `Approve` / `Send back`）。
- 帳票名は単数（`Quote`）。一覧のタイトルは複数（`Quotes`）— 一覧は集合だから。
- 冠詞は**ラベルでは省く**（`Customer`）。文では付ける（`Select a customer`）。
- 数量は `pcs`（本・個）。キオスクの既訳に合わせる。
- 「〜しました」は完了の 1 語（`Saved` / `Deleted`）。主語（`The quote has been…`）を足さない。
- 否定は `not`（`Not started`）。`No`+名詞は「件数ゼロ」のときだけ（`No results`）。

### 2.2 中国語 (zh)

- **簡体字・大陸の製造業慣用**。キオスクの既訳（工单 / 工序 / 良品 / 报废 / 半成品 / 支）を正とし、Web もそれに揃える。
- 状態は「已＋動詞」（已批准 / 已出货）、待ち状態は「待＋動詞」（待审批 / 待启用）で統一する。
- ボタンは 2 文字の動詞を基本にする（保存 / 编辑 / 删除 / 新建）。「请」はボタンに付けない（依頼文は検証エラーだけ）。
- 「〜書」を字面で持ち込まない。文書の種類で訳し分ける（单 / 书 / 表）。例: 請求書 ≠ 请求书。
- 句読点は中国語のもの（，。：（））。日本語の「・」は列挙では `、`、対概念の並記では `・` を残さず `/` にする。
- 空白: 中国語と半角英数字の間に**半角スペース 1 つ**（`AI 服务商` / `PDF 下载`）。

### 2.3 敬体・語調（3 言語共通）

`_specs/design.md` §17.2 のまま:

| 場面 | ja | en | zh |
|---|---|---|---|
| ラベル・プレースホルダ | 名詞止め「顧客を選択」 | `Select a customer` | 选择客户 |
| 検証エラー | 「顧客を選択してください」 | `Select a customer` | 请选择客户 |
| 完了通知 | 「保存しました」 | `Saved` | 已保存 |
| 破壊操作の確認 | 「この操作は取り消せません。」 | `This cannot be undone.` | 此操作无法撤销。 |

- **句点**: ja は文にだけ「。」を付ける（ラベル・ボタンには付けない）。en は文にだけ `.`。zh も文にだけ「。」。
- 感嘆符は使わない（3 言語とも）。
- 利用者を責めない。「入力が不正です」ではなく「数値を入力してください」。

### 2.4 訳さないもの

操作コード（`SA04`）／書類番号の接頭辞（`QOT-` `ORD-` `PO-` `DRN-` `INV-` `WOR-` `EST-` `PRC-`）／
DB の enum 値／`PDF` `CSV` `QR` `PIN` `SSO` `AI` `LDAP` `API`／製品コード・素材コード／
社名・人名／`DEV` バッジ／単位記号（mm / kg / h / %）／`LD`（社内語）。

### 2.5 キーの付け方（`messages/{ja,en,zh}.json`）

- **名前空間は画面ではなく意味で切る。** `common` / `shell` / `status` / `enum` / `apps` / ドメイン（`sales` `production` …）。同じ語を画面ごとに複製しない。
- キーは **英語の lowerCamelCase**（`sendBack`, `totalAmount`）。日本語やローマ字にしない。
- キー名は**意味を表す**（`deleteConfirm`）。訳文の中身を写した名（`thisCannotBeUndone`）にしない — 文言を直すたびにキーが嘘になる。
- **3 言語でキー集合を完全に一致させる**、かつ**空文字の訳を置かない**。どちらも `lib/user-preferences-core.test.ts` が落として教える（空文字はフォールバックが効かず画面が空欄になるため）。訳が決まっていない画面は、カタログに入れず **ja の直書きのまま**置いておくのが正しい途中状態。
- 型は `src/global.d.ts` が `typeof ja` から作るので、**ja に無いキーはビルドで落ちる**。ja に足してから en/zh を足す。

### 2.6 変数・複数形・文の組み立て

- **文を連結しない。** `t("saved") + name` のような結合は語順が言語で変わるので必ず壊れる。1 文 = 1 キーにして変数を埋める: `"lineAdded": "{name} を追加しました"`。
- 変数名は英語で意味を表す（`{count}` `{name}` `{date}`）。順番に依存しない。
- **複数形は ICU の `plural` を使う**（en は `one/other` が要る。ja/zh は `other` だけでよい）。`1 件` を `{count} 件` で押し通さない。
- 数値・日付・金額を**文言に埋め込まない**。書式は `lib/format.ts` が持つ（§2.8）。
- HTML タグを訳文に入れない。強調が要るなら next-intl のリッチテキスト（`t.rich`）で外から与える。

### 2.7 レイアウトと長さ

- **en は ja の 1.3〜2 倍の幅**になる。ボタン・タブ・列見出しは伸びる前提で作る（固定 `w={120}` を置かない）。
- 略語で縮めない（`Qty.` `Mgr.`）— 3 言語で不揃いになる。どうしても入らないときは**言葉を選び直す**（`Delete` を `Remove` にする等）。
- zh は ja より短くなることが多いので、逆に間延びしないか確認する。
- 幅が読めない語（アプリ名・状態バッジ）は、実画面で ja/en/zh を切り替えて見る。

### 2.8 日付・数値・通貨は翻訳の対象外

`lib/format.ts` が持つ（利用者ごとの日付形式・12/24 時間・タイムゾーン）。
**PDF とメールは `documentFormatters`（JST + 日本語）で固定** — 出来上がった書類は
誰が開いても同じでなければならない。訳文に `2026/06/04` のような具体値を書かない。

### 2.9 用語を足す・変える手順

1. §3 の該当する表に 1 行足す（ja / en / zh / 要確認）。判断が要るなら §5 に上げて、決まるまで使わない。
2. `messages/*.json` を 3 言語同時に直す。
3. **既存語の変更は全画面に効く**ので、変えるときは表とカタログを同じコミットで直す。片方だけ直さない。
4. キオスクと重なる語（状態・工程・数量）は `nextjs-kiosk/src/lib/i18n/messages/` も一緒に直す。**食い違いは本表に寄せる。**

### 2.10 確認する項目（訳文を書いたら見る）

- [ ] §3 の表と同じ語を使っているか（別の言い方をしていないか）
- [ ] 3 言語でキー集合が一致しているか（空文字を入れていないか）
- [ ] 文を連結していないか。変数を使っているか
- [ ] ボタン＝動詞、ラベル＝名詞になっているか
- [ ] ラベル・ボタンに句点を付けていないか
- [ ] 数値・日付を訳文に埋めていないか
- [ ] en が sentence case か。zh が簡体字で、英数字との間に空白があるか
- [ ] 一番長い言語で画面が崩れないか

---

## 3. 用語表

### 3.1 カテゴリ（アプリの分類）

| ja | en | zh | 要確認 |
|---|---|---|---|
| 一般 | General | 通用 | |
| 販売 | Sales | 销售 | |
| 購買 | Purchasing | 采购 | |
| 生産 | Production | 生产 | |
| 出荷 | Shipping | 出货 | |
| 請求 | Billing | 请款 | 発票(fapiao)と混ざるため zh は「请款」。→ §5 |
| マスタ | Master data | 主数据 | |
| ドキュメント | Documents | 文档 | |
| システム | System | 系统 | |

### 3.2 アプリ名（操作コード順）

| code | ja | en | zh | 要確認 |
|---|---|---|---|---|
| CM01 | 承認・予定 | Approvals & schedule | 审批与计划 | |
| CM02 | フォーム | Forms | 表单 | |
| CM03 | 社内文書 | Internal documents | 内部文档 | |
| SA01 | 試算 | Trial estimate | 成本试算 | 「見積書」と紛らわしい。→ §5 |
| SA02 | 価格表 | Price list | 价格表 | |
| SA03 | 見積書 | Quote | 报价单 | |
| SA04 | 注文請書 | Order acceptance | 订单确认书 | 現場は「注文受諾書」と呼ぶ疑いあり。→ §5 |
| SA05 | 注文明細 | Order line | 订单明细 | 現場は「受注書」。→ §5 |
| SA06 | 設計依頼書 | Design request | 设计委托单 | |
| PU01 | 購買依頼 | Purchase request | 采购申请 | |
| PU02 | 素材発注書 | Material purchase order | 材料采购单 | |
| PU03 | 素材入荷 | Material receipt | 材料到货 | |
| PU04 | 外注依頼 | Outsource order | 外协委托单 | |
| PD02 | 指示書 | Work order | 工单 | zh はキオスクの既訳（工单）に統一 |
| PD04 | 在庫管理 | Inventory | 库存管理 | |
| PD05 | 未処理指示書 | Pending work orders | 未处理工单 | |
| SH01 | 出荷書 | Delivery order | 出货单 | |
| SH02 | 納品書 | Delivery note | 送货单 | |
| SH03 | 未処理出荷書 | Pending shipments | 未处理出货 | |
| BL01 | 請求書 | Invoice | 请款单 | zh: 发票は税務書類。→ §5 |
| BL02 | 締日処理 | Billing closing | 结算处理 | |
| MS01 | 取引先 | Business partners | 业务伙伴 | |
| MS04 | 製品 | Products | 产品 | |
| MS05 | 材種 | Material types | 材料类别 | 「材种」は中国語にない。→ §5 |
| MS06 | 素材 | Materials | 材料 | |
| MS07 | 採番構成 | Code numbering | 编号构成 | |
| MS08 | 工程マスタ | Process steps | 工序主数据 | |
| MS09 | 検査表テンプレート | Inspection templates | 检查表模板 | |
| MS0A | 不良種類 | Defect types | 不良类别 | |
| MS0B | 承認設定 | Approval settings | 审批设置 | |
| MS0C | 拠点 | Plants | 工厂 | 「拠点」は工場に限らない。→ §5 |
| MS0D | 作業場所 | Work locations | 作业场所 | |
| MS0E | 保管場所 | Storage locations | 存放位置 | |
| DC01 | マニュアル | Manual | 操作手册 | |
| DC02 | 管理マニュアル | Admin manual | 管理手册 | |
| SY01 | ユーザー管理 | Users | 用户管理 | |
| SY02 | 試算計算 | Trial pricing engine | 试算计算 | |
| SY03 | 製品項目 | Product items | 产品项目 | |
| SY04 | 製品種別 | Product types | 产品类别 | |
| SY05 | アプリ管理 | Apps | 应用管理 | |
| SY06 | ファイル管理 | Files | 文件管理 | |
| SY07 | 操作履歴 | Activity log | 操作历史 | |
| SY08 | QRカード管理 | QR cards | 二维码卡管理 | |
| SY09 | 端末管理 | Devices | 终端管理 | |
| SY0A | キオスク設定 | Kiosk settings | 终端设置 | zh に「Kiosk」を残すか。→ §5 |
| SY0B | リンク管理 | Links | 链接管理 | |
| SY0C | 注文書取込 | Order intake | 订单导入 | |
| SY0D | ログイン履歴 | Login history | 登录历史 | |
| SY0E | AI プロバイダ | AI provider | AI 服务商 | |
| — | ダッシュボード（ホーム） | Dashboard | 仪表板 | |

### 3.3 書類・番号

| ja | en | zh | 要確認 |
|---|---|---|---|
| 書類番号 | Document number | 单据编号 | |
| 見積番号 | Quote number | 报价单号 | |
| 注文番号 | Order number | 订单编号 | |
| 注文明細番号 | Order line number | 订单明细编号 | |
| 顧客注文書番号 | Customer order ref. | 客户订单号 | |
| 依頼番号 | Request number | 申请编号 | |
| 発注番号 | PO number | 采购单号 | |
| 納品番号 | Delivery note number | 送货单号 | |
| 請求番号 | Invoice number | 请款单号 | |
| 指示書番号 | Work order number | 工单编号 | |
| ロット番号 | Lot number | 批次号 | |
| 枝番 | Line branch no. | 分项号 | |
| 採番 | Numbering | 编号 | |
| 未採番 | Not numbered | 未编号 | |
| 帳票 / 書類 | Document | 单据 | |
| 明細 | Line items | 明细 | |
| 明細数 | Line count | 明细数 | |
| 添付 / 添付ファイル | Attachment | 附件 | |
| 証憑 | Supporting document | 凭证 | |
| メモ | Memo | 备忘 | 社内限定メモ。備考(notes)とは別物 |
| コメント | Comment | 评论 | |
| 備考 | Notes | 备注 | PDF に載る自由記入。→ メモと訳し分ける |
| 履歴 | History | 历史 | |
| 変更履歴 | Change history | 变更历史 | |
| 版 / バージョン | Version | 版本 | |
| 差分 | Diff | 差异 | |
| 複製 / コピー | Duplicate | 复制 | |

### 3.4 取引先・組織

| ja | en | zh | 要確認 |
|---|---|---|---|
| 取引先 | Business partner | 业务伙伴 | |
| BPコード | BP code | 业务伙伴编号 | |
| 顧客 | Customer | 客户 | |
| 受注元 | Ordering customer | 订货方 | |
| 最終需要家 | End user | 最终用户 | |
| 仕入先 | Supplier | 供应商 | |
| 外注先 | Subcontractor | 外协厂商 | |
| 仕入先・外注先 | Supplier / subcontractor | 供应商・外协厂商 | |
| 支店 | Branch | 分公司 | |
| 請求先 | Bill-to | 请款对象 | |
| 納品先 | Ship-to | 送货地址 | |
| 出荷先 | Ship-to | 出货对象 | 納品先と同語になる。→ §5 |
| 担当者（取引先側） | Contact | 联系人 | |
| 営業担当（自社） | Sales rep | 销售负责人 | |
| 部門 | Department | 部门 | |
| 拠点 | Plant | 工厂 | |
| 地域 | Region | 地区 | |
| 国 | Country | 国家 | |
| ロール | Role | 角色 | |
| 締日 | Closing day | 结算日 | |
| 支払日 | Payment day | 付款日 | |
| 支払サイト | Payment terms | 账期 | |
| 与信限度額 | Credit limit | 信用额度 | |
| 課税 | Taxable | 应税 | |
| 非課税 | Tax exempt | 免税 | |
| 軽減税率 | Reduced tax rate | 减免税率 | |
| 振込先 | Bank account | 银行账户 | |
| 普通 / 当座 | Savings / Checking | 活期 / 支票 | |

### 3.5 製品・素材

| ja | en | zh | 要確認 |
|---|---|---|---|
| 製品 | Product | 产品 | |
| 製品コード | Product code | 产品编号 | |
| 素材 | Material | 材料 | |
| 材種 | Material type | 材料类别 | |
| メーカー | Manufacturer | 制造商 | |
| メーカー材種 | Manufacturer grade | 制造商牌号 | |
| 形状 | Shape | 形状 | |
| 種類 | Kind | 种类 | |
| 黒皮 | As-rolled (black) | 黑皮 | |
| 研磨 | Ground | 研磨 | |
| 研磨済黒皮 | Ground black | 已研磨黑皮 | |
| 直径 | Diameter | 直径 | |
| 呼び径 | Nominal diameter | 公称直径 | |
| 全長 | Overall length | 全长 | |
| 最大径 | Max diameter | 最大直径 | |
| 単位 | Unit | 单位 | |
| 本 | pcs | 支 | キオスク既訳が「支」 |
| 個 | pcs | 个 | |
| セット | set | 套 | |
| 仕様 | Specification | 规格 | |
| 図面 | Drawing | 图纸 | |
| 設計書 | Design document | 设计文件 | |
| キーワード | Keywords | 关键词 | 突合用の別名 |
| 採番構成 | Code composition | 编号构成 | |

### 3.6 販売・価格

| ja | en | zh | 要確認 |
|---|---|---|---|
| 試算 | Trial estimate | 成本试算 | |
| 見積単価 | Estimated unit price | 试算单价 | |
| 基準単価 | Base unit price | 基准单价 | |
| 単価 | Unit price | 单价 | |
| 金額 | Amount | 金额 | |
| 合計金額 | Total amount | 合计金额 | |
| 小計 | Subtotal | 小计 | |
| 消費税 | Tax | 税额 | |
| 数量 | Quantity | 数量 | |
| 数量段階 | Quantity tier | 数量档 | |
| 倍率 | Multiplier | 系数 | |
| 値引き | Discount | 折扣 | |
| 値引き設定 | Discount rules | 折扣设置 | |
| 価格設定 | Pricing | 价格设置 | |
| 注文種別 | Order type | 订单类别 | |
| 本番 | Production | 量产 | |
| テスト | Test | 试制 | |
| サンプル | Sample | 样品 | |
| その他 | Other | 其他 | |
| 有効期間 | Valid period | 有效期 | |
| 有効開始日 / 有効終了日 | Valid from / Valid until | 生效日 / 失效日 | |
| 無期限 | No end date | 无期限 | |
| 納期 | Delivery date | 交期 | |
| 希望納期 | Requested date | 希望交期 | |
| 注文日 | Order date | 订货日 | |
| 通貨 | Currency | 币种 | |
| 円 | JPY | 日元 | |
| 価格差異 | Price mismatch | 价格差异 | |
| 商談メモ | Deal notes | 商谈备忘 | |

### 3.7 購買

| ja | en | zh | 要確認 |
|---|---|---|---|
| 購買依頼 | Purchase request | 采购申请 | |
| 発注 | Order (placing) | 下单 | |
| 発注日 | Order date | 下单日 | |
| 入荷 | Receipt | 到货 | |
| 入荷日 | Received date | 到货日 | |
| 入荷予定日 | Expected date | 预计到货日 | |
| 入荷先拠点 | Receiving plant | 到货工厂 | |
| 依頼者 | Requester | 申请人 | |
| 依頼日 | Requested date | 申请日 | |
| 依頼区分 | Request kind | 申请类别 | |
| 外注 | Outsourcing | 外协 | |
| リードタイム | Lead time | 交货周期 | |

### 3.8 生産・工程

| ja | en | zh | 要確認 |
|---|---|---|---|
| 指示書 | Work order | 工单 | |
| 工程 | Step | 工序 | 工程マスタは Process step / 工序主数据 |
| 工程ステップ | Process step | 工序 | |
| 工程順 | Step order | 工序顺序 | |
| 工程フロー | Workflow | 工序流程 | |
| 分岐 | Branch | 分支 | |
| 合流 | Merge | 汇合 | |
| 分岐系列 | Branch series | 分支序列 | |
| 依存関係 | Dependencies | 依赖关系 | |
| 実施場所 | Execution location | 实施场所 | |
| 社内 | In-house | 厂内 | |
| 社内のみ | In-house only | 仅厂内 | |
| 社内・外注 | In-house or outsourced | 厂内或外协 | |
| 同期可 | Sync capable | 可同步 | |
| 材料準備 | Material prep | 材料准备 | |
| 加工 | Machining | 加工 | |
| コーティング | Coating | 涂层 | |
| 検査 | Inspection | 检查 | |
| 検査承認 | Inspection approval | 检查批准 | |
| 出荷（工程） | Shipping | 出货 | |
| 予定数量 | Planned quantity | 计划数量 | |
| 受入数 | Received | 接收数 | キオスク既訳 |
| 良品数 | Good | 良品数 | |
| 不良 | Defect | 不良 | |
| 不良種類 | Defect type | 不良类别 | |
| 半製品 | Semi-finished | 半成品 | |
| 廃棄 | Scrapped | 报废 | |
| 工程分岐（不良の行き先） | Process branch | 工序分支 | |
| 検査数 | Inspected | 检查数 | |
| 合格 / 不合格 | Pass / Fail | 合格 / 不合格 | |
| 全数 | 100% inspection | 全数 | |
| 抜取 | Sampling | 抽检 | |
| 検査表 | Inspection sheet | 检查表 | |
| 検査項目 | Inspection item | 检查项目 | |
| 許容値 | Tolerance | 公差 | |
| 実測値 | Measured value | 实测值 | |
| 作業時間 | Work hours | 作业时间 | |
| 予定 / 実績 | Planned / Actual | 计划 / 实绩 | |
| 担当者（作業） | Assignee | 负责人 | |
| 未割当 | Unassigned | 未分配 | |
| 一時停止 | Paused | 已暂停 | 工程の状態。QRカードの「一時停止」は Suspended |
| 再開 | Resume | 继续 | |
| 工具種 | Tool type | 刀具类别 | |
| 丸棒 / 円筒 / OH付 | Round bar / Cylinder / With OH | 圆棒 / 圆筒 / 带 OH | |

### 3.9 在庫

| ja | en | zh | 要確認 |
|---|---|---|---|
| 在庫 | Stock | 库存 | |
| 在庫数 | On hand | 库存数 | |
| 製品在庫 | Product stock | 产品库存 | |
| 素材在庫 | Material stock | 材料库存 | |
| 仕掛品 | WIP | 在制品 | |
| 予約 | Reserved | 预留 | |
| 引当 | Allocated | 已分配 | |
| 予約解除 | Released | 解除预留 | |
| 棚卸調整 | Adjustment | 盘点调整 | |
| 入庫 / 出庫 | In / Out | 入库 / 出库 | |
| 在庫移動 | Stock transfer | 库存调拨 | |
| 保管場所 | Storage location | 存放位置 | |
| 棚 | Shelf | 货架 | |
| 未手配 | Not planned | 未安排 | |
| 手配済 | Planned | 已安排 | |
| 割当 | Allocation | 分配 | |

### 3.10 出荷・請求

| ja | en | zh | 要確認 |
|---|---|---|---|
| 出荷 | Shipment | 出货 | |
| 出荷日 | Shipped date | 出货日 | |
| 出荷元拠点 | From plant | 出货工厂 | |
| 在庫保管（出荷書種別） | Stock storage | 库存保管 | |
| 発送 | Dispatch | 发货 | |
| 配送方法 | Delivery method | 配送方式 | |
| 通常配送 / 通常納品 | Standard delivery | 常规配送 | |
| ユーザー直送 | Direct to end user | 直送最终用户 | |
| 納品日 | Delivered date | 交货日 | |
| 請求期間 | Billing period | 请款期间 | |
| 締日処理 | Billing closing | 结算处理 | |
| 会計連携 | Accounting export | 会计对接 | |
| 弥生会計 | Yayoi Accounting | 弥生会计 | 製品名。訳さない選択肢もある |

### 3.11 承認

| ja | en | zh | 要確認 |
|---|---|---|---|
| 承認 | Approve / Approval | 批准 / 审批 | 動詞は Approve、名詞は Approval |
| 承認する | Approve | 批准 | |
| 差し戻す / 差し戻し | Send back | 退回 | 却下(Reject)と区別する |
| 却下 | Reject | 拒绝 | 見積書のみ |
| 承認依頼 | Approval request | 审批申请 | |
| 承認フロー | Approval flow | 审批流程 | |
| 承認グループ | Approval group | 审批组 | |
| 承認設定 | Approval settings | 审批设置 | |
| 段 / 第一承認 / 第二承認 | Step / First approval / Second approval | 级 / 一级审批 / 二级审批 | |
| いずれか1名 | Any one member | 任一人 | |
| 全員 | All members | 全员 | |
| 代理設定 | Delegation | 代理设置 | |
| 代理 | Delegate | 代理人 | |
| 承認者 | Approver | 审批人 | |
| 承認記録 | Approval record | 审批记录 | |
| 理由 | Reason | 理由 | |
| 手続き状況 | Progress | 办理状态 | ProcedurePanel の見出し |
| 前の書類から | From | 来源单据 | |
| 次の書類へ | To | 后续单据 | |

### 3.12 状態（ステータス）

同じラベルが複数の書類で使い回されるので、**ラベル単位**で訳を固定する
（どの書類がどの状態を持つかは `components/ui/StatusBadge.tsx` の `STATUS_MAPS` が正）。

| ja | en | zh | 使う書類 | 要確認 |
|---|---|---|---|---|
| 下書き | Draft | 草稿 | ほぼ全書類 | |
| 作成中 | In preparation | 编制中 | 素材発注書 | 「下書き」と別語なのは既存実装のまま。→ §5 |
| 確定 | Confirmed | 已确定 | 試算 / 注文請書 / 注文明細 / 出荷書 | |
| 発行済 | Issued | 已发行 | 見積書 / 納品書 / 請求書 | |
| 受諾済 | Accepted | 已接受 | 見積書 | |
| 却下 | Rejected | 已拒绝 | 見積書 | |
| 期限切れ | Expired | 已过期 | 見積書 | |
| 照合中 | Matching | 核对中 | 注文請書 | |
| 価格差異 | Price mismatch | 价格差异 | 注文請書 | |
| 取込中 | Importing | 导入中 | 注文請書（取込） | |
| 承認依頼中 | Pending approval | 审批中 | 発注書 / 購買依頼 / 設計依頼 / フォーム回答 | |
| 承認待ち | Awaiting approval | 待审批 | 指示書 / 承認依頼 | 上と英語で紛れる。→ §5 |
| 承認済 | Approved | 已批准 | 多数 | |
| 差し戻し | Sent back | 已退回 | 多数 | |
| 発注済 | Ordered | 已下单 | 発注書 / 購買依頼 | |
| 入荷完了 | Received | 已入库 | 発注書 | |
| 製造中 | In production | 生产中 | 注文明細 | |
| 進行中 | In progress | 进行中 | 指示書 / 工程 / 設計依頼 | |
| 未着手 | Not started | 未开始 | 工程 / 設計依頼 | |
| 完了 | Completed | 已完成 | 指示書 / 工程 / 設計依頼 | |
| 一部出荷 | Partially shipped | 部分出货 | 注文明細 | |
| 出荷済 | Shipped | 已出货 | 注文明細 / 出荷書 | |
| 納品済 | Delivered | 已交货 | 納品書 | |
| 送付済 | Sent | 已寄送 | 請求書 | |
| 支払済 | Paid | 已付款 | 請求書 | |
| 未実施 | Not performed | 未实施 | 検査記録 | |
| 合格 / 不合格 | Pass / Fail | 合格 / 不合格 | 検査記録 | |
| 未処理 | Unprocessed | 未处理 | 締日処理 | |
| 処理済 | Processed | 已处理 | 締日処理 | |
| エクスポート済 | Exported | 已导出 | 締日処理 | |
| キャンセル | Cancelled | 已取消 | 多数 | 動詞の「キャンセル(=中止する)」と同語。→ §5 |
| アーカイブ | Archived | 已归档 | フォーム / 社内文書 / 注文請書 | |
| 公開中 | Published | 已发布 | フォーム / 社内文書 | |
| 公開承認待ち | Pending publish approval | 待发布审批 | 社内文書 | |
| 提出済 | Submitted | 已提交 | フォーム回答 | |
| 受付前 / 受付中 / 受付終了 | Scheduled / Open / Closed | 未开始 / 受理中 / 已结束 | フォーム | |
| 価格表登録済 | Registered | 已登记价格表 | 試算 | |
| 未割当 / 割当済 | Unassigned / Assigned | 未分配 / 已分配 | QRカード | |
| 一時停止（カード） | Suspended | 已停用 | QRカード | |
| 取り消し | Revoked | 已撤销 | QRカード / 端末 | |
| リンク待ち | Awaiting link | 待关联 | 端末 | |
| 有効化待ち | Awaiting activation | 待启用 | 端末 | |
| 有効 / 無効 | Enabled / Disabled | 启用 / 停用 | マスタ全般 | 端末は Active / Disabled |

### 3.13 その他の選択肢（enum）

| ja | en | zh | 出どころ |
|---|---|---|---|
| 在庫分 / 製造分 | From stock / Manufacture | 库存分 / 制造分 | 指示書種別 |
| 見積時 / 受注時 / 単独 | At quote / At order / Standalone | 报价时 / 接单时 / 独立 | 設計依頼トリガ |
| 新規 / 改訂 | New / Revision | 新增 / 修订 | 設計依頼区分 |
| 通常 / 急ぎ | Normal / High | 普通 / 加急 | 優先度 |
| メール / FAX / 郵送 / ポータル | Email / Fax / Post / Portal | 邮件 / 传真 / 邮寄 / 门户 | 請求方法 |
| 必須 / 任意 / なし | Required / Optional / None | 必填 / 可选 / 无 | ロット入力・検査項目 |
| なし（記録しない） | None (not recorded) | 无（不记录） | 数量管理モード |
| 数量管理（受入・良品・不良） | Flow (received / good / defect) | 数量管理（接收・良品・不良） | 数量管理モード |
| 検査（検査数・合格・不合格） | Inspection (inspected / pass / fail) | 检查（检查数・合格・不合格） | 数量管理モード |
| AND（すべて） / OR（いずれか） | AND (all) / OR (any) | AND（全部） / OR（任一） | 工程依存 |
| 真偽（はい/いいえ） | Yes / No | 是否（是/否） | 検査項目型 |
| 数値 / 単一選択 / 複数選択 | Number / Single select / Multi select | 数值 / 单选 / 多选 | 検査項目型 |
| 全数 / 割合(%) / 本数 | All / Percent / Count | 全数 / 比例(%) / 支数 | 抜取検査 |
| 1行テキスト / 複数行テキスト / リッチテキスト | Short text / Long text / Rich text | 单行文本 / 多行文本 / 富文本 | フォーム項目型 |
| 日付 / 時刻 | Date / Time | 日期 / 时间 | フォーム項目型 |
| ドロップダウン（1つ選択） | Dropdown (single) | 下拉（单选） | フォーム項目型 |
| 業務データ検索 | Business data lookup | 业务数据查找 | フォーム項目型 |
| 添付ファイル | Attachment | 附件 | フォーム項目型 |
| サブテーブル（行を追加できる表） | Sub-table (repeatable rows) | 子表（可增行） | フォーム項目型 |
| 関連レコード一覧 | Related records | 关联记录 | フォーム項目型 |
| 日本 / 中国 / アメリカ / 韓国 | Japan / China / United States / Korea | 日本 / 中国 / 美国 / 韩国 | 国 |

### 3.14 権限・ロール・共有

| ja | en | zh | 要確認 |
|---|---|---|---|
| 権限 | Permission | 权限 | |
| 実効権限 | Effective permissions | 有效权限 | |
| 閲覧 / 作成 / 更新 / 削除 | View / Create / Update / Delete | 查看 / 新建 / 更新 / 删除 | |
| 書き出し | Export | 导出 | |
| 管理 | Admin | 管理 | |
| 全社 | All | 全公司 | スコープ |
| 地域 / 国 / 拠点 / 部門 / チーム / 配下 | Region / Country / Plant / Department / Team / Subordinates | 地区 / 国家 / 工厂 / 部门 / 团队 / 下属 | スコープ |
| 自分の担当 | Own | 本人负责 | スコープ |
| 所属拠点 | Assigned plants | 所属工厂 | |
| 共有 / 共有先 | Sharing / Shared with | 共享 / 共享对象 | |
| 回答のみ | Respond only | 仅回答 | 共有レベル |
| 個人 | User | 个人 | 共有対象 |
| ユーザー | User | 用户 | |
| ゲスト | Guest | 访客 | |
| 管理職（承認者） | Manager (approver) | 管理层（审批人） | ロール名 |
| 営業 / 購買 / 製造・生産管理 / 品質・検査 / 出荷 / 経理 / 閲覧 | Sales / Purchasing / Production / Quality / Shipping / Accounting / Viewer | 销售 / 采购 / 制造・生产管理 / 品质・检查 / 出货 / 财务 / 查看 | ロール名 |
| 営業補佐 | Sales assistant | 销售助理 | ロール名 |
| ○○部長 | ○○ manager | ○○部长 | ロール名 |

### 3.15 キオスク・端末・認証

Web 側で使う語。キオスク画面内の文言は既訳（`nextjs-kiosk/src/lib/i18n/messages/`）が正。

| ja | en | zh | 要確認 |
|---|---|---|---|
| キオスク | Kiosk | 终端 | zh に「Kiosk」を出すか。→ §5 |
| 共有端末 | Shared device | 共用终端 | |
| 端末 | Device | 终端 | |
| 端末区分 | Device type | 终端类别 | |
| QRカード | QR card | 二维码卡 | |
| PIN | PIN | PIN | |
| フロアマップ | Floor map | 平面图 | |
| 有効化 / 無効化 | Enable / Disable | 启用 / 停用 | |
| リンク / リンク解除 | Link / Unlink | 关联 / 解除关联 | |
| 端末アテステーション | Device attestation | 终端认证 | |
| 端末シグネチャ | Device signature | 终端指纹 | |
| 所有区分 | Ownership | 归属 | |
| 社用 / 私用 | Company / Personal | 公司 / 个人 | |
| ログイン / ログアウト | Log in / Log out | 登录 / 退出登录 | |
| シングルサインオン | Single sign-on | 单点登录 | |
| 成功 / 失敗 | Success / Failure | 成功 / 失败 | |
| ロック中 | Locked | 已锁定 | |
| レート制限 | Rate limited | 频率限制 | |

### 3.16 共通アクション（ボタン・メニュー）

| ja | en | zh | 要確認 |
|---|---|---|---|
| 保存 | Save | 保存 | |
| キャンセル（操作をやめる） | Cancel | 取消 | |
| キャンセル（書類を取り消す） | Cancel document | 作废单据 | 状態の「キャンセル」と訳し分け。→ §5 |
| 編集 | Edit | 编辑 | |
| 新規作成 / 新規 | New | 新建 | |
| 追加 | Add | 添加 | |
| 複製 | Duplicate | 复制 | |
| 削除 | Delete | 删除 | |
| 削除する | Delete | 删除 | 確認モーダルの実行ボタン |
| 一括削除 / 一括有効化 / 一括無効化 | Bulk delete / Bulk enable / Bulk disable | 批量删除 / 批量启用 / 批量停用 | |
| 閉じる | Close | 关闭 | |
| 戻る | Back | 返回 | |
| 一覧へ | Back to list | 返回列表 | |
| リセット | Reset | 重置 | |
| 検索 | Search | 搜索 | |
| 選択 | Select | 选择 | |
| 実行 | Run | 执行 | |
| 発行 | Issue | 发行 | |
| 登録 | Register | 登记 | |
| 更新 | Update | 更新 | |
| 解除 | Release | 解除 | |
| 復元 | Restore | 恢复 | |
| 印刷 | Print | 打印 | |
| ダウンロード | Download | 下载 | |
| アップロード | Upload | 上传 | |
| エクスポート / 取込 | Export / Import | 导出 / 导入 | |
| 上へ / 下へ | Move up / Move down | 上移 / 下移 | |
| 行を削除 | Remove row | 删除行 | |
| 明細を追加 | Add line | 添加明细 | |
| 公開する | Publish | 发布 | |
| 提出 | Submit | 提交 | |
| 再取込 | Re-import | 重新导入 | |
| 今すぐスキャン | Scan now | 立即扫描 | |
| 接続テスト | Test connection | 连接测试 | |

### 3.17 画面の部品・見出し

| ja | en | zh | 要確認 |
|---|---|---|---|
| ダッシュボード / ホーム | Dashboard / Home | 仪表板 / 首页 | |
| アプリ | Apps | 应用 | |
| 操作コード | Operation code | 操作代码 | |
| お気に入り | Favorites | 收藏 | |
| 通知 | Notifications | 通知 | |
| すべて既読 | Mark all read | 全部标记为已读 | |
| プロフィール | Profile | 个人资料 | |
| 通知設定 | Notification settings | 通知设置 | |
| ホーム画面設定 | Home layout | 首页设置 | |
| 表示設定 | Display settings | 显示设置 | |
| 言語 | Language | 语言 | |
| 概要 | Overview | 概要 | タブ |
| 関連 | Related | 关联 | タブ |
| 基本情報 | Basic information | 基本信息 | フォーム節 |
| 詳細 | Details | 详情 | |
| 一覧 | List | 列表 | |
| 名称 | Name | 名称 | |
| 名称（日本語）/（英語） | Name (Japanese) / (English) | 名称（日语）/（英语） | 中国語列を足すなら要変更。→ §5 |
| フリガナ / よみがな | Kana | 假名读音 | |
| コード | Code | 编号 | |
| 説明 | Description | 说明 | |
| 表示名 | Display name | 显示名称 | |
| 表示順 | Sort order | 显示顺序 | |
| 種別 / 区分 | Type / Category | 类别 / 区分 | |
| 状態 | Status | 状态 | |
| 作成者 | Created by | 创建人 | |
| 作成日時 / 更新日 | Created / Updated | 创建时间 / 更新日 | |
| 対象 | Target | 对象 | |
| 条件 | Condition | 条件 | |
| 既定値 | Default | 默认值 | |
| 必須 | Required | 必填 | |
| 任意 | Optional | 可选 | |
| 未設定 | Not set | 未设置 | |
| なし / 無 | None | 无 | |
| 該当なし | No results | 无匹配结果 | |
| 読み込み中 | Loading | 加载中 | |
| 検索中… | Searching… | 搜索中… | |
| 日付を選択 | Pick a date | 选择日期 | |
| すべて | All | 全部 | |

### 3.18 メッセージの定型

| ja | en | zh |
|---|---|---|
| 保存しました | Saved | 已保存 |
| 作成しました | Created | 已创建 |
| 更新しました | Updated | 已更新 |
| 削除しました | Deleted | 已删除 |
| 追加しました | Added | 已添加 |
| 有効化しました / 無効化しました | Enabled / Disabled | 已启用 / 已停用 |
| 保存に失敗しました | Could not save | 保存失败 |
| 削除に失敗しました | Could not delete | 删除失败 |
| エラー | Error | 错误 |
| この操作は取り消せません。 | This cannot be undone. | 此操作无法撤销。 |
| 〜を入力してください | Enter 〜 | 请输入〜 |
| 〜を選択してください | Select 〜 | 请选择〜 |
| 1以上を入力してください | Enter 1 or more | 请输入 1 以上的值 |
| 権限がありません | You do not have permission | 没有权限 |
| 見つかりませんでした | Not found | 未找到 |

### 3.19 数量・日付・単位

| 種別 | ja | en | zh |
|---|---|---|---|
| 日付 | 2026/06/04 | 2026/06/04 | 2026/06/04 |
| 日時 | 2026/06/04 14:30 | 2026/06/04 14:30 | 2026/06/04 14:30 |
| 金額 | ¥250,000 | ¥250,000 | ¥250,000 |
| 数量 | 50 本 | 50 pcs | 50 支 |
| 相対時刻 | 5分前 | 5 min ago | 5 分钟前 |

形式そのものは `INTL_LOCALES`（ja-JP / en-US / zh-CN）と表示設定（日付形式・
12/24 時間・タイムゾーン）が決める。**この表は語の訳だけ**を固定する。

### 3.20 試算・加工の専門語（SA01 / SY02）

| ja | en | zh | 要確認 |
|---|---|---|---|
| 材料原価 | Material cost | 材料成本 | |
| 段加工費 | Step machining cost | 阶梯加工费 | |
| 段加工長 | Step length | 阶梯加工长度 | |
| 首下 | Neck length | 颈下长度 | |
| 加工単価 | Machining rate | 加工单价 | |
| 円筒加工費 | Cylindrical grinding cost | 圆筒加工费 | |
| センタレス | Centerless | 无心磨 | |
| コート代 | Coating cost | 涂层费 | |
| ラップ処理 | Lapping | 研磨抛光 | |
| LD加工 / LDチャージ | LD machining / LD charge | LD 加工 / LD 费用 | LD は社内語。訳さない |
| LD外径 / LD刃長 | LD outer dia. / LD flute length | LD 外径 / LD 刃长 | |
| 先端のみ / 先端+外周 | Tip only / Tip + periphery | 仅前端 / 前端+外周 | |
| 補正値 | Correction factor | 修正系数 | |
| 掛け率 | Rate | 系数 | |
| 基準数量 | Base quantity | 基准数量 | |
| ロット数 | Lots | 批次数 | |
| 参照価格 | Reference price | 参考价格 | |
| 最新単価 / 最高単価 / 平均 | Latest / Highest / Average | 最新 / 最高 / 平均 | |
| 総型形状 | Form shape | 成型形状 | |
| ストレート / テーパー | Straight / Taper | 直身 / 锥度 | |
| 仕上げ / 粗 | Finish / Rough | 精加工 / 粗加工 | |
| ドリル / リーマ / OHリーマ | Drill / Reamer / OH reamer | 钻头 / 铰刀 / OH 铰刀 | 製品項目の値（DB データ）。→ §5 |
| 検査成績書 | Inspection certificate | 检查成绩书 | |

---

## 4. 何を訳し、何を訳さないか

| 対象 | 訳す | 備考 |
|---|---|---|
| 画面の文言（ラベル・ボタン・見出し・通知・検証エラー） | ○ | 本体。約 5,650 件のユニーク文字列 |
| 状態バッジ・enum ラベル | ○ | `StatusBadge.tsx` / `enum-labels.ts` の 1 箇所を直せば全画面に効く |
| アプリ名・カテゴリ | ○ | `app-list.ts`。`labelKey` 化が要る（キオスクは済） |
| 監査ログのテーブル名ラベル | ○ | `audit.ts` |
| PDF 帳票（見積書・納品書 …） | △ | **取引先に出す紙**。宛先の言語で出すのか、社内表示だけ多言語にするのかは業務判断。→ §5-9 |
| マニュアル（DC01 / DC02） | △ | 既に言語別の仕組みあり。プロセス編は ja のみの約束 |
| メール通知の本文 | △ | 受信者の `users.locale` で出し分けるなら要対応 |
| マスタの名称（製品・材種・拠点 …） | ✕→△ | DB は `{ ja, en }` のみ。zh を出すなら列の形を変える判断が要る。→ §5-10 |
| 書類番号・コード・enum の値 | ✕ | 言語に依らない識別子 |
| 取引先名・人名 | ✕ | データ。`match_names` は突合用で表示語ではない |

---

## 5. 要確認事項（決めてほしいこと）

**1. 「注文請書」「注文明細」という日本語そのもの**
`_specs/design.md` §17.1 に既に記録がある通り、業務側の文書は同じものを
「注文受諾書」「受注書」と呼んでいて、利用者から「注文明細という語は聞いたことが
ない」と指摘が出ている。**多言語化の前に日本語を直すのが順序**（後から直すと
3 言語ぶん直すことになる）。en/zh をどう訳すかより先に決めたい。

**2. 「試算」= Trial estimate / 成本试算**
見積書（Quote）と紛らわしい。「原価試算」の意なら en は `Cost estimate`、
zh は `成本试算` が素直。現行コードのパス（`trial-estimates`）に合わせるなら
`Trial estimate`。**推奨: Cost estimate（意味が伝わる方）**。

**3. 「拠点」= Plant か Site か**
`plants` テーブルだが、実体は製造・在庫・出荷の拠点で、必ずしも工場ではない。
`Plant` / 工厂 は工場の語。`Site` / 据点 なら中立。
**推奨: Plant（テーブル名・既存英訳と一致）**、ただし工場でない拠点が増えるなら Site。

**4. 「請求書」の zh**
`发票` は中国の税務証憑（ファーピャオ）で、この書類とは別物。
**推奨: 请款单**。社内で「发票」と呼び慣れているなら合わせる。

**5. 「材種」の zh**
`材种` は中国語として通らない。候補は `材料类别`（分類の意）/ `材质`（材質）/
`牌号`（グレード）。実体は「メーカー×グレード×形状×種類」なので
**推奨: 材料类别**。

**6. 「承認依頼中」と「承認待ち」を英語で分けるか**
現行 ja は別語（依頼を出した側の視点 / 承認する側の視点）。
**推奨: Pending approval / Awaiting approval で分ける**。1 語にまとめるなら
両方 `Pending approval`。

**7. 「キャンセル」が動詞と状態で同語**
ボタンの「キャンセル」（操作をやめる）と、書類の状態「キャンセル」（取り消し済み）。
en は `Cancel` / `Cancelled` で自然に割れるが、zh は `取消` / `已取消` で
字面が近い。**推奨: 書類の取り消し操作は「作废单据」にして区別する**。

**8. 「作成中」と「下書き」**
素材発注書だけ `DRAFT` のラベルが「作成中」で、他は「下書き」。
**推奨: 全部「下書き」に寄せる**（enum は触らずラベルだけ）。多言語化と同時に
やると差分が読みにくいので、先に ja だけ直すのが安全。

**9. PDF 帳票を多言語化するか**
見積書・納品書・請求書は取引先に出す紙。**受け取る相手の言語**（取引先ごとの
設定）で出すのか、社内画面だけ多言語で紙は日本語固定なのか。
**推奨: 第一段階は紙は日本語固定**（法定様式・押印慣行の影響を受けるため）。

**10. マスタ名称に zh を足すか**
`{ ja, en }` JSON に `zh` を足すと、`_specs/tables.md` の規約変更 + マイグレーション +
全マスタ画面に入力欄 1 つ追加（現行「名称（日本語）」「名称（英語）」の隣）になる。
**推奨: 第一段階は UI 文言だけ多言語化し、マスタ名称は ja/en のまま**（zh 表示時は
ja へフォールバック）。必要になってから列を広げる。

**11. キオスクの zh で「Kiosk」をどう呼ぶか**
キオスクの既訳は `终端`（端末）で、`Kiosk` の語を使っていない。Web の SY0A
「キオスク設定」も `终端设置` に揃えるか、`Kiosk 设置` とするか。
**推奨: 终端设置（既訳に合わせる）**。

**12. 「本」の zh は「支」で良いか**
キオスクの既訳が `支`（丸棒・工具の数え方として自然）。`根` `件` もあり得る。
**推奨: 支（既訳のまま）**。

**13. 製品項目の値（ドリル / リーマ / OHリーマ / キズ / 寸法不良 …）**
これらは UI 文言ではなく **DB のマスタデータ**。§5-10 の判断に従う（zh を持たない
なら訳す対象外）。

---

## 6. 確定後の作業（参考）

1. この表を `messages/{ja,en,zh}.json` の名前空間に落とす（`common` / `status` / `enum` / `apps` / `domain` …）。
2. **1 箇所で効くものから**直す — `StatusBadge.tsx`・`enum-labels.ts`・`app-list.ts`・`audit.ts`。ここだけで画面の語彙のかなりの部分が動く。
3. 画面は**カテゴリ単位**で移す（販売 → 購買 → 生産 …）。未移行の画面は日本語の直書きのまま壊れずに動く。
4. キオスクとの二重管理を避ける — 共通語（状態・工程・数量）はキオスクの既訳を正とし、食い違いは本表に寄せる。
5. 移行済みの画面が増えたら、日本語直書きの残りを機械的に検出する（`.tsx` 内の日本語リテラル数を CI で数える等）。

