# 翻訳ルールと用語集（ja / en / zh）

多言語化の**作業規則（§2）**と**対訳表（§3）**。利用者に見える文字列を書く・足す・
直すときは、必ずこの 1 本に従う。

- **この文書が i18n の正。** `nextjs-web/messages/*.json` と
  `nextjs-kiosk/src/lib/i18n/messages/*` の両方を支配する。共通語（状態・工程・数量）は
  2 アプリで同じ訳にする。
- **表にある ja に、表と違う訳を当てない。** 無い語は §3 に 1 行足してから使う。
- **決めきれない語は §5 に置く。** 決まるまで使わない。決めた語は §4 に記録する。
- ja が原文。対応言語は `ja` / `en` / `zh`（`src/lib/i18n/index.ts` の `LOCALES`）。zh は簡体字（zh-CN）。

---

## 1. 適用範囲

| | 対象 | 例 |
|---|---|---|
| ○ | アプリにハードコードされた UI 文言 | `.tsx` の文字列、`messages/*.json`、`StatusBadge.tsx`、`enum-labels.ts`、`app-list.ts`、`audit.ts`、PDF/メールのテンプレート文言 |
| ✕ | **DB に入るデータ** | マスタ名称（製品・素材・材種・拠点・工程・検査項目）、取引先名、ロール名、権限の表示名、工具種、不良種類、製品項目の値 |
| ✕ | 識別子 | 書類番号・接頭辞（`QOT-` `ORD-` `PO-` `DRN-` `INV-` `WOR-` `EST-` `PRC-`）、操作コード、DB の enum 値、製品コード・素材コード |
| ✕ | 固有名詞 | 社名・人名・製品名（弥生会計 / Gotenberg など）、`LD`（社内語） |

DB データは**訳す対象ではないが、入れ物の作り方は決めてある**（§2.10）。

**現状（2026-08-30）**

| 項目 | 状態 |
|---|---|
| 言語定義・next-intl の配線 | 済（`messages/{ja,en,zh}.json`、中身は common / shell / preferences の約 60 語のみ） |
| 共有端末アプリ（nextjs-kiosk） | **ja/en/zh 完備**（自前辞書、約 250 行 × 3） |
| Web 画面の文言 | ほぼ全部が日本語の直書き（ユニークな日本語リテラル 約 5,650 件） |
| DB の多言語列 | `{ ja, en }` 固定 — §2.10 の可変キー化は**未実装** |

---

## 2. 翻訳ルール

### 2.1 原則

1. **ja が原文。** en/zh は ja から訳す。en を経由して zh を作らない。
2. **語は §3 から取る。** 新しい言い方を発明しない。
3. **ja が不適切なら ja を先に直す。** 訳してから直すと 3 言語ぶん直すことになる。
4. **短くするために意味を削らない。** 幅は §2.8 で合わせる。

### 2.2 英語 (en)

- **Sentence case**（`Work order`）。Title Case にしない。固有名詞と略語だけ大文字（PDF / QR / AI / CSV / BP）。
- ラベルは名詞、ボタンは動詞の原形（`Save` / `Approve` / `Send back`）。
- 帳票名は単数（`Quote`）、一覧のタイトルは複数（`Quotes`）。
- 冠詞はラベルでは省き（`Customer`）、文では付ける（`Select a customer`）。
- 数量の単位は `pcs`。完了通知は 1 語（`Saved`）で、主語を足さない。
- 否定は `Not started` の形。`No` + 名詞は件数ゼロのときだけ（`No results`）。

### 2.3 中国語 (zh)

- **簡体字・大陸の製造業慣用。** 共有端末アプリの既訳（工单 / 工序 / 良品 / 报废 / 支）が正。
- 状態は「已＋動詞」（已批准）、待ちは「待＋動詞」（待审批）で統一。
- ボタンは 2 文字の動詞（保存 / 编辑 / 删除 / 新建）。「请」はボタンに付けない（検証エラーだけ）。
- 「〜書」を字面で持ち込まない（請求書 ≠ 请求书）。
- 句読点は中国語のもの（，。：（））。中国語と半角英数字の間に**半角スペース 1 つ**（`AI 服务商`）。

### 2.4 語調（3 言語共通）

| 場面 | ja | en | zh |
|---|---|---|---|
| ラベル・プレースホルダ | 顧客を選択 | `Select a customer` | 选择客户 |
| 検証エラー | 顧客を選択してください | `Select a customer` | 请选择客户 |
| 完了通知 | 保存しました | `Saved` | 已保存 |
| 破壊操作の確認 | この操作は取り消せません。 | `This cannot be undone.` | 此操作无法撤销。 |

句点は文にだけ付ける（ラベル・ボタンには付けない）。感嘆符は使わない。利用者を責めない
（「入力が不正です」ではなく「数値を入力してください」）。

### 2.5 キーの付け方（`messages/{ja,en,zh}.json`）

- 名前空間は画面ではなく**意味**で切る（`common` / `shell` / `status` / `enum` / `apps` / ドメイン）。同じ語を画面ごとに複製しない。
- キーは英語の lowerCamelCase（`sendBack`）。**意味**を表す名にする（訳文を写した `thisCannotBeUndone` にしない）。
- **3 言語でキー集合を完全に一致させ、空文字を置かない。** どちらも `lib/user-preferences-core.test.ts` が落として教える。
- 型は `src/global.d.ts` が `typeof ja` から作る。**ja に無いキーはビルドで落ちる** — ja → en/zh の順で足す。
- 訳が決まらない画面は、カタログに入れず **ja の直書きのまま**置く。それが正しい途中状態。

### 2.6 変数・複数形・文の組み立て

- **文を連結しない。** `t("saved") + name` は語順が言語で変わるので必ず壊れる。1 文 = 1 キー + 変数（`"{name} を追加しました"`）。
- 変数名は意味を表す英語（`{count}` `{name}` `{date}`）。順番に依存しない。
- 複数形は ICU の `plural`（en は `one/other` が要る。ja/zh は `other` だけ）。
- 数値・日付・金額を訳文に埋め込まない（§2.9）。HTML タグを訳文に入れない（強調は `t.rich`）。

### 2.7 書類の言語（PDF・メール）

- **取引先に出す書類（見積書・納品書・請求書など）は「受取先の言語」で出す。** 取引先に言語設定が無ければ**既定言語（ja）**。
- **閲覧者の表示設定では変わらない。** 同じ書類が開く人によって別言語になってはいけない。
- 日付・タイムゾーン・通貨の書式は従来どおり固定（`documentFormatters` = JST）。**言語だけが受取先で決まる。**

### 2.8 レイアウトと長さ

- en は ja の 1.3〜2 倍に伸びる。ボタン・タブ・列見出しに固定幅（`w={120}`）を置かない。
- 略語で縮めない（`Qty.`）。入らないときは言葉を選び直す。
- 幅が読めない語（アプリ名・状態バッジ）は実画面で 3 言語を切り替えて確認する。

### 2.9 日付・数値・通貨は翻訳しない

`lib/format.ts` が持つ（利用者ごとの日付形式・12/24 時間・タイムゾーン）。訳文に
`2026/06/04` のような具体値を書かない。

### 2.10 DB の多言語データ（マスタ名称など）

訳す対象ではない（§1）が、**入れ物は言語を後から足せる形にする**:

- 言語ごとの入力欄を並べない。「名称」1 欄 + **「多言語」ボタン → モーダルで全言語を編集**。言語が増えてもフォームの形は変わらない。
- 保存は**言語コードをキーにした可変キー JSON**（`{ ja, en, zh, … }`）。列も画面も足さずに言語を追加できる。
- 必須は**既定言語（ja）だけ**。他は任意で、無ければ既定言語へフォールバックして表示する。
- 現行は `{ ja, en }` 固定・欄が 2 つ並ぶ形なので、**この形へ移す作業が要る**（§6）。

### 2.11 用語を足す・変える手順

1. §3 の該当表に 1 行足す（判断が要るなら §5 に上げ、決まるまで使わない）。
2. `messages/*.json` を 3 言語同時に直す。既存語の変更は全画面に効くので、表とカタログを**同じコミット**で直す。
3. 共有端末アプリと重なる語は `nextjs-kiosk/src/lib/i18n/messages/` も一緒に直す。食い違いは本表に寄せる。

### 2.12 チェックリスト

- [ ] §3 の表と同じ語を使っている
- [ ] 3 言語でキー集合が一致し、空文字が無い
- [ ] 文を連結せず、変数を使っている
- [ ] ボタン＝動詞、ラベル＝名詞。ラベル・ボタンに句点が無い
- [ ] 数値・日付を訳文に埋めていない
- [ ] en が sentence case。zh が簡体字で、英数字との間に空白がある
- [ ] 一番長い言語で画面が崩れない

---

## 3. 用語表

### 3.1 カテゴリ

| ja | en | zh |
|---|---|---|
| 一般 | General | 通用 |
| 販売 | Sales | 销售 |
| 購買 | Purchasing | 采购 |
| 生産 | Production | 生产 |
| 出荷 | Shipping | 出货 |
| 請求 | Billing | 请款 |
| マスタ | Master data | 主数据 |
| ドキュメント | Documents | 文档 |
| システム | System | 系统 |

### 3.2 アプリ名（操作コード順）

| code | ja | en | zh |
|---|---|---|---|
| — | ダッシュボード / ホーム | Dashboard / Home | 仪表板 / 首页 |
| CM01 | 承認・予定 | Approvals & schedule | 审批与计划 |
| CM02 | フォーム | Forms | 表单 |
| CM03 | 社内文書 | Internal documents | 内部文档 |
| SA01 | 価格試算 | Price estimate | 价格试算 |
| SA02 | 価格表 | Price list | 价格表 |
| SA03 | 見積書 | Quote | 报价单 |
| SA04 | 注文請書 | Order acceptance | 订单确认书 |
| SA05 | 注文明細 | Order line | 订单明细 |
| SA06 | 設計依頼書 | Design request | 设计委托单 |
| PU01 | 購買依頼 | Purchase request | 采购申请 |
| PU02 | 素材発注書 | Material purchase order | 材料采购单 |
| PU03 | 素材入荷 | Material receipt | 材料到货 |
| PU04 | 外注依頼 | Outsource order | 外协委托单 |
| PD02 | 指示書 | Work order | 工单 |
| PD04 | 在庫管理 | Inventory | 库存管理 |
| PD05 | 未処理指示書 | Pending work orders | 未处理工单 |
| SH01 | 出荷書 | Delivery order | 出货单 |
| SH02 | 納品書 | Delivery note | 送货单 |
| SH03 | 未処理出荷書 | Pending shipments | 未处理出货 |
| BL01 | 請求書 | Invoice | 请款单 |
| BL02 | 締日処理 | Billing closing | 结算处理 |
| MS01 | 取引先 | Business partners | 业务伙伴 |
| MS04 | 製品 | Products | 产品 |
| MS05 | 材種 | Material types | 材料类别 |
| MS06 | 素材 | Materials | 材料 |
| MS07 | 採番構成 | Code numbering | 编号构成 |
| MS08 | 工程マスタ | Process steps | 工序主数据 |
| MS09 | 検査表テンプレート | Inspection templates | 检查表模板 |
| MS0A | 不良種類 | Defect types | 不良类别 |
| MS0B | 承認設定 | Approval settings | 审批设置 |
| MS0C | 拠点 | Sites | 据点 |
| MS0D | 作業場所 | Work locations | 作业场所 |
| MS0E | 保管場所 | Storage locations | 存放位置 |
| DC01 | マニュアル | Manual | 操作手册 |
| DC02 | 管理マニュアル | Admin manual | 管理手册 |
| SY01 | ユーザー管理 | Users | 用户管理 |
| SY02 | 価格試算計算 | Price estimate engine | 价格试算计算 |
| SY03 | 製品項目 | Product items | 产品项目 |
| SY04 | 製品種別 | Product types | 产品类别 |
| SY05 | アプリ管理 | Apps | 应用管理 |
| SY06 | ファイル管理 | Files | 文件管理 |
| SY07 | 操作履歴 | Activity log | 操作历史 |
| SY08 | QRカード管理 | QR cards | 二维码卡管理 |
| SY09 | 端末管理 | Devices | 终端管理 |
| SY0A | 共有端末設定 | Shared device settings | 共用终端设置 |
| SY0B | リンク管理 | Links | 链接管理 |
| SY0C | 注文書取込 | Order intake | 订单导入 |
| SY0D | ログイン履歴 | Login history | 登录历史 |
| SY0E | AI プロバイダ | AI provider | AI 服务商 |
| SY0F | 通知メール | Notification email | 通知邮件 |

### 3.3 書類・番号

| ja | en | zh | 備考 |
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
| 採番 / 未採番 | Numbering / Not numbered | 编号 / 未编号 | |
| 帳票・書類 | Document | 单据 | |
| 明細 / 明細数 | Line items / Line count | 明细 / 明细数 | |
| 添付ファイル | Attachment | 附件 | |
| 証憑 | Supporting document | 凭证 | |
| メモ | Memo | 备忘 | 社内限定。備考とは別物 |
| コメント | Comment | 评论 | |
| 備考 | Notes | 备注 | PDF に載る自由記入 |
| 履歴 / 変更履歴 | History / Change history | 历史 / 变更历史 | |
| 版・バージョン | Version | 版本 | |
| 差分 | Diff | 差异 | |

### 3.4 取引先・組織

| ja | en | zh |
|---|---|---|
| 取引先 | Business partner | 业务伙伴 |
| BPコード | BP code | 业务伙伴编号 |
| 顧客 | Customer | 客户 |
| 受注元 | Ordering customer | 订货方 |
| 最終需要家 | End user | 最终用户 |
| 仕入先 | Supplier | 供应商 |
| 外注先 | Subcontractor | 外协厂商 |
| 支店 | Branch | 分公司 |
| 請求先 | Bill-to | 请款对象 |
| 納品先・出荷先 | Ship-to | 送货对象 |
| 担当者（取引先側） | Contact | 联系人 |
| 営業担当（自社） | Sales rep | 销售负责人 |
| 部門 | Department | 部门 |
| 拠点 | Site | 据点 |
| 地域 / 国 | Region / Country | 地区 / 国家 |
| ロール | Role | 角色 |
| 締日 / 支払日 | Closing day / Payment day | 结算日 / 付款日 |
| 支払サイト | Payment terms | 账期 |
| 与信限度額 | Credit limit | 信用额度 |
| 課税 / 非課税 / 軽減税率 | Taxable / Tax exempt / Reduced tax rate | 应税 / 免税 / 减免税率 |
| 振込先 | Bank account | 银行账户 |
| 普通 / 当座 | Savings / Checking | 活期 / 支票 |
| 日本 / 中国 / アメリカ / 韓国 | Japan / China / United States / Korea | 日本 / 中国 / 美国 / 韩国 |

### 3.5 製品・素材（項目名）

値そのもの（材種名・素材名・製品名）は DB データなので対象外（§1）。

| ja | en | zh |
|---|---|---|
| 製品 / 製品コード | Product / Product code | 产品 / 产品编号 |
| 素材 | Material | 材料 |
| 材種 | Material type | 材料类别 |
| メーカー | Manufacturer | 制造商 |
| メーカー材種 | Manufacturer grade | 制造商牌号 |
| 形状 / 種類 | Shape / Kind | 形状 / 种类 |
| 黒皮・研磨 | Surface finish | 表面处理 |
| 直径 / 呼び径 | Diameter / Nominal diameter | 直径 / 公称直径 |
| 全長 / 最大径 | Overall length / Max diameter | 全长 / 最大直径 |
| 単位 | Unit | 单位 |
| 本 / 個 / セット | pcs / pcs / set | 支 / 个 / 套 |
| 仕様 | Specification | 规格 |
| 図面 / 設計書 | Drawing / Design document | 图纸 / 设计文件 |
| キーワード | Keywords | 关键词 |

### 3.6 販売・価格

| ja | en | zh |
|---|---|---|
| 価格試算 | Price estimate | 价格试算 |
| 見積単価 | Estimated unit price | 试算单价 |
| 基準単価 / 単価 | Base unit price / Unit price | 基准单价 / 单价 |
| 金額 / 合計金額 | Amount / Total amount | 金额 / 合计金额 |
| 小計 / 消費税 | Subtotal / Tax | 小计 / 税额 |
| 数量 | Quantity | 数量 |
| 数量段階 / 倍率 | Quantity tier / Multiplier | 数量档 / 系数 |
| 値引き / 値引き設定 | Discount / Discount rules | 折扣 / 折扣设置 |
| 価格設定 | Pricing | 价格设置 |
| 注文種別 | Order type | 订单类别 |
| 本番 / テスト / サンプル / その他 | Production / Test / Sample / Other | 量产 / 试制 / 样品 / 其他 |
| 有効期間 | Valid period | 有效期 |
| 有効開始日 / 有効終了日 | Valid from / Valid until | 生效日 / 失效日 |
| 無期限 | No end date | 无期限 |
| 納期 / 希望納期 | Delivery date / Requested date | 交期 / 希望交期 |
| 注文日 | Order date | 订货日 |
| 通貨 / 円 | Currency / JPY | 币种 / 日元 |
| 価格差異 | Price mismatch | 价格差异 |

### 3.7 購買

| ja | en | zh |
|---|---|---|
| 購買依頼 | Purchase request | 采购申请 |
| 発注 / 発注日 | Order / Order date | 下单 / 下单日 |
| 入荷 / 入荷日 | Receipt / Received date | 到货 / 到货日 |
| 入荷予定日 | Expected date | 预计到货日 |
| 入荷先拠点 | Receiving site | 到货据点 |
| 依頼者 / 依頼日 / 依頼区分 | Requester / Requested date / Request kind | 申请人 / 申请日 / 申请类别 |
| リードタイム | Lead time | 交货周期 |

### 3.8 生産・工程

| ja | en | zh | 備考 |
|---|---|---|---|
| 指示書 | Work order | 工单 | |
| 工程 | Step | 工序 | 「工程ステップ」とは言わない。工程マスタ = Process steps / 工序主数据 |
| 工程順 / 工程フロー | Step order / Workflow | 工序顺序 / 工序流程 | |
| 分岐 / 合流 / 分岐系列 | Branch / Merge / Branch series | 分支 / 汇合 / 分支序列 | |
| 依存関係 | Dependencies | 依赖关系 | |
| 実施場所 | Execution location | 实施场所 | |
| 社内 | In-house | 厂内 | 「社内のみ」「社内・外注」はこの 2 語で組み立てる |
| 外注 | Outsourced | 外协 | |
| 同期可 | Sync capable | 可同步 | |
| 材料準備 / 加工 / コーティング | Material prep / Machining / Coating | 材料准备 / 加工 / 涂层 | 工程カテゴリ |
| 検査 / 検査承認 | Inspection / Inspection approval | 检查 / 检查批准 | 工程カテゴリ |
| 予定数量 | Planned quantity | 计划数量 | |
| 受入数 / 良品数 | Received / Good | 接收数 / 良品数 | |
| 不良 / 不良種類 | Defect / Defect type | 不良 / 不良类别 | |
| 半製品 / 廃棄 | Semi-finished / Scrapped | 半成品 / 报废 | |
| 工程分岐（不良の行き先） | Process branch | 工序分支 | |
| 検査数 / 合格 / 不合格 | Inspected / Pass / Fail | 检查数 / 合格 / 不合格 | |
| 全数 / 抜取 | 100% inspection / Sampling | 全数 / 抽检 | |
| 検査表 / 検査項目 | Inspection sheet / Inspection item | 检查表 / 检查项目 | |
| 許容値 / 実測値 | Tolerance / Measured value | 公差 / 实测值 | |
| 作業時間 | Work hours | 作业时间 | |
| 予定 / 実績 | Planned / Actual | 计划 / 实绩 | |
| 担当者（作業） / 未割当 | Assignee / Unassigned | 负责人 / 未分配 | |
| 一時停止 / 再開 | Paused / Resume | 已暂停 / 继续 | 工程の状態。QRカードの一時停止は Suspended |
| 工具種 | Tool type | 刀具类别 | 種類の値は DB データ（対象外） |

### 3.9 在庫

| ja | en | zh |
|---|---|---|
| 在庫 / 在庫数 | Stock / On hand | 库存 / 库存数 |
| 製品在庫 / 素材在庫 | Product stock / Material stock | 产品库存 / 材料库存 |
| 仕掛品 | WIP | 在制品 |
| 予約 / 引当 / 予約解除 | Reserved / Allocated / Released | 预留 / 已分配 / 解除预留 |
| 棚卸調整 | Adjustment | 盘点调整 |
| 入庫 / 出庫 | In / Out | 入库 / 出库 |
| 在庫移動 | Stock transfer | 库存调拨 |
| 保管場所 / 棚 | Storage location / Shelf | 存放位置 / 货架 |
| 未手配 / 手配済 | Not planned / Planned | 未安排 / 已安排 |
| 割当 | Allocation | 分配 |

### 3.10 出荷・請求

| ja | en | zh |
|---|---|---|
| 出荷 / 出荷日 | Shipment / Shipped date | 出货 / 出货日 |
| 出荷元拠点 | From site | 出货据点 |
| 在庫保管（出荷書種別） | Stock storage | 库存保管 |
| 発送 | Dispatch | 发货 |
| 配送方法 | Delivery method | 配送方式 |
| 通常配送・通常納品 | Standard delivery | 常规配送 |
| ユーザー直送 | Direct to end user | 直送最终用户 |
| 納品日 | Delivered date | 交货日 |
| 請求期間 | Billing period | 请款期间 |
| 締日処理 | Billing closing | 结算处理 |
| 会計連携 | Accounting export | 会计对接 |

### 3.11 承認

| ja | en | zh | 備考 |
|---|---|---|---|
| 承認 | Approval | 审批 | 名詞 |
| 承認する | Approve | 批准 | 動詞 |
| 差し戻す・差し戻し | Send back | 退回 | 却下（Reject）と区別する |
| 却下 | Reject | 拒绝 | 見積書のみ |
| 承認依頼 | Approval request | 审批申请 | |
| 承認フロー / 承認グループ | Approval flow / Approval group | 审批流程 / 审批组 | |
| 承認設定 | Approval settings | 审批设置 | |
| 段 / 第一承認 / 第二承認 | Step / First approval / Second approval | 级 / 一级审批 / 二级审批 | |
| いずれか1名 / 全員 | Any one member / All members | 任一人 / 全员 | |
| 代理設定 / 代理 | Delegation / Delegate | 代理设置 / 代理人 | |
| 承認者 / 承認記録 | Approver / Approval record | 审批人 / 审批记录 | |
| 理由 | Reason | 理由 | |
| 手続き状況 | Progress | 办理状态 | ProcedurePanel の見出し |
| 前の書類から / 次の書類へ | From / To | 来源单据 / 后续单据 | |

### 3.12 状態（ステータス）

ラベル単位で固定する（どの書類がどの状態を持つかは `components/ui/StatusBadge.tsx` の
`STATUS_MAPS` が正）。

| ja | en | zh | 使う書類 |
|---|---|---|---|
| 下書き | Draft | 草稿 | ほぼ全書類（素材発注書の「作成中」もこれに統一） |
| 確定 | Confirmed | 已确定 | 価格試算 / 注文請書 / 注文明細 / 出荷書 |
| 発行済 | Issued | 已发行 | 見積書 / 納品書 / 請求書 |
| 受諾済 | Accepted | 已接受 | 見積書 |
| 却下 | Rejected | 已拒绝 | 見積書 |
| 期限切れ | Expired | 已过期 | 見積書 |
| 照合中 | Matching | 核对中 | 注文請書 |
| 価格差異 | Price mismatch | 价格差异 | 注文請書 |
| 取込中 | Importing | 导入中 | 注文請書（取込） |
| 承認依頼中 | Pending approval | 审批中 | 全書類（指示書の「承認待ち」もこれに統一） |
| 承認済 | Approved | 已批准 | 多数 |
| 差し戻し | Sent back | 已退回 | 多数 |
| 発注済 | Ordered | 已下单 | 素材発注書 / 購買依頼 |
| 入荷完了 | Received | 已入库 | 素材発注書 |
| 製造中 | In production | 生产中 | 注文明細 |
| 進行中 | In progress | 进行中 | 指示書 / 工程 / 設計依頼 |
| 未着手 | Not started | 未开始 | 工程 / 設計依頼 |
| 完了 | Completed | 已完成 | 指示書 / 工程 / 設計依頼 |
| 一部出荷 / 出荷済 | Partially shipped / Shipped | 部分出货 / 已出货 | 注文明細 / 出荷書 |
| 納品済 | Delivered | 已交货 | 納品書 |
| 送付済 / 支払済 | Sent / Paid | 已寄送 / 已付款 | 請求書 |
| 未実施 / 合格 / 不合格 | Not performed / Pass / Fail | 未实施 / 合格 / 不合格 | 検査記録 |
| 未処理 / 処理済 / エクスポート済 | Unprocessed / Processed / Exported | 未处理 / 已处理 / 已导出 | 締日処理 |
| キャンセル | Cancelled | 已取消 | 多数 |
| アーカイブ | Archived | 已归档 | フォーム / 社内文書 / 注文請書 |
| 公開中 | Published | 已发布 | フォーム / 社内文書 |
| 公開承認待ち | Pending publish approval | 待发布审批 | 社内文書 |
| 提出済 | Submitted | 已提交 | フォーム回答 |
| 受付前 / 受付中 / 受付終了 | Scheduled / Open / Closed | 未开始 / 受理中 / 已结束 | フォーム |
| 価格表登録済 | Registered | 已登记价格表 | 価格試算 |
| 未割当 / 割当済 | Unassigned / Assigned | 未分配 / 已分配 | QRカード |
| 一時停止（カード） | Suspended | 已停用 | QRカード |
| 取り消し | Revoked | 已撤销 | QRカード / 端末 |
| リンク待ち / 有効化待ち | Awaiting link / Awaiting activation | 待关联 / 待启用 | 端末 |
| 有効 / 無効 | Enabled / Disabled | 启用 / 停用 | マスタ全般（端末は Active / Disabled） |

### 3.13 選択肢（enum ラベル）

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
| サブテーブル（行を追加できる表） | Sub-table (repeatable rows) | 子表（可增行） | フォーム項目型 |
| 関連レコード一覧 | Related records | 关联记录 | フォーム項目型 |
| 承認依頼 / 承認結果 / 取込 / 購買 / 共有 / 設計 / システム | Approval request / Approval result / Intake / Purchasing / Sharing / Design / System | 审批申请 / 审批结果 / 导入 / 采购 / 共享 / 设计 / 系统 | 通知種別 |

### 3.14 権限・共有

ロール名・権限の表示名は DB データなので対象外（§1）。

| ja | en | zh |
|---|---|---|
| 権限 / 実効権限 | Permission / Effective permissions | 权限 / 有效权限 |
| 閲覧 / 作成 / 更新 / 削除 | View / Create / Update / Delete | 查看 / 新建 / 更新 / 删除 |
| 書き出し / 管理 | Export / Admin | 导出 / 管理 |
| 全社 | All | 全公司 |
| 地域 / 国 / 拠点 / 部門 / チーム / 配下 | Region / Country / Site / Department / Team / Subordinates | 地区 / 国家 / 据点 / 部门 / 团队 / 下属 |
| 自分の担当 | Own | 本人负责 |
| 所属拠点 | Assigned sites | 所属据点 |
| 共有 / 共有先 | Sharing / Shared with | 共享 / 共享对象 |
| 回答のみ | Respond only | 仅回答 |
| 個人 | User | 个人 |
| ユーザー / ゲスト | User / Guest | 用户 / 访客 |

### 3.15 共有端末・認証

共有端末アプリ内の文言は既訳（`nextjs-kiosk/src/lib/i18n/messages/`）が正。

| ja | en | zh |
|---|---|---|
| 共有端末 | Shared device | 共用终端 |
| 端末 / 端末区分 | Device / Device type | 终端 / 终端类别 |
| QRカード | QR card | 二维码卡 |
| PIN | PIN | PIN |
| フロアマップ | Floor map | 平面图 |
| 有効化 / 無効化 | Enable / Disable | 启用 / 停用 |
| リンク / リンク解除 | Link / Unlink | 关联 / 解除关联 |
| 端末アテステーション | Device attestation | 终端认证 |
| 端末シグネチャ | Device signature | 终端指纹 |
| 所有区分 | Ownership | 归属 |
| 社用 / 私用 | Company / Personal | 公司 / 个人 |
| ログイン / ログアウト | Log in / Log out | 登录 / 退出登录 |
| シングルサインオン | Single sign-on | 单点登录 |
| 成功 / 失敗 | Success / Failure | 成功 / 失败 |
| ロック中 / レート制限 | Locked / Rate limited | 已锁定 / 频率限制 |

### 3.16 共通アクション

| ja | en | zh |
|---|---|---|
| 保存 | Save | 保存 |
| キャンセル（操作をやめる） | Cancel | 取消 |
| キャンセル（書類を取り消す） | Cancel document | 作废单据 |
| 編集 | Edit | 编辑 |
| 新規作成・新規 | New | 新建 |
| 追加 / 複製 / 削除 | Add / Duplicate / Delete | 添加 / 复制 / 删除 |
| 一括削除 / 一括有効化 / 一括無効化 | Bulk delete / Bulk enable / Bulk disable | 批量删除 / 批量启用 / 批量停用 |
| 閉じる / 戻る / 一覧へ | Close / Back / Back to list | 关闭 / 返回 / 返回列表 |
| リセット / 検索 / 選択 | Reset / Search / Select | 重置 / 搜索 / 选择 |
| 実行 / 発行 / 登録 / 更新 | Run / Issue / Register / Update | 执行 / 发行 / 登记 / 更新 |
| 解除 / 復元 | Release / Restore | 解除 / 恢复 |
| 印刷 / ダウンロード / アップロード | Print / Download / Upload | 打印 / 下载 / 上传 |
| エクスポート / 取込 | Export / Import | 导出 / 导入 |
| 上へ / 下へ | Move up / Move down | 上移 / 下移 |
| 行を削除 / 明細を追加 | Remove row / Add line | 删除行 / 添加明细 |
| 公開する / 提出 | Publish / Submit | 发布 / 提交 |
| 再取込 / 今すぐスキャン / 接続テスト | Re-import / Scan now / Test connection | 重新导入 / 立即扫描 / 连接测试 |

### 3.17 画面の部品・項目名

| ja | en | zh | 備考 |
|---|---|---|---|
| ダッシュボード / ホーム | Dashboard / Home | 仪表板 / 首页 | |
| アプリ / 操作コード | Apps / Operation code | 应用 / 操作代码 | |
| お気に入り | Favorites | 收藏 | |
| 通知 / すべて既読 | Notifications / Mark all read | 通知 / 全部标记为已读 | |
| プロフィール | Profile | 个人资料 | |
| 通知設定 / ホーム画面設定 / 表示設定 | Notification settings / Home layout / Display settings | 通知设置 / 首页设置 / 显示设置 | |
| 言語 | Language | 语言 | |
| 概要 / 関連 / 詳細 / 一覧 | Overview / Related / Details / List | 概要 / 关联 / 详情 / 列表 | タブ・見出し |
| 基本情報 | Basic information | 基本信息 | フォーム節 |
| 名称 | Name | 名称 | |
| 多言語 | Translations | 多语言 | §2.10 のモーダルを開くボタン |
| フリガナ・よみがな | Kana | 假名读音 | |
| コード / 説明 / 表示名 / 表示順 | Code / Description / Display name / Sort order | 编号 / 说明 / 显示名称 / 显示顺序 | |
| 種別・区分 / 状態 | Type / Status | 类别 / 状态 | |
| 作成者 / 作成日時 / 更新日 | Created by / Created / Updated | 创建人 / 创建时间 / 更新日 | |
| 対象 / 条件 / 既定値 | Target / Condition / Default | 对象 / 条件 / 默认值 | |
| 必須 / 任意 / 未設定 / なし | Required / Optional / Not set / None | 必填 / 可选 / 未设置 / 无 | |
| 該当なし | No results | 无匹配结果 | |
| 読み込み中 / 検索中… | Loading / Searching… | 加载中 / 搜索中… | |
| 日付を選択 / すべて | Pick a date / All | 选择日期 / 全部 | |
| まとめて送る | Digest | 合并发送 | 通知メール（SY0F） |
| 送る間隔 / 猶予（分） | Send interval / Grace period (min) | 发送间隔 / 宽限（分钟） | 通知メール（SY0F） |
| 1通の件数 / 最大件数 | Items per email / Max items | 每封件数 / 最多件数 | 通知メール（SY0F） |
| 元に戻す | Reset to default | 恢复默认 | |

### 3.18 定型メッセージ

| ja | en | zh |
|---|---|---|
| 保存しました | Saved | 已保存 |
| 作成しました / 更新しました | Created / Updated | 已创建 / 已更新 |
| 削除しました / 追加しました | Deleted / Added | 已删除 / 已添加 |
| 有効化しました / 無効化しました | Enabled / Disabled | 已启用 / 已停用 |
| 保存に失敗しました / 削除に失敗しました | Could not save / Could not delete | 保存失败 / 删除失败 |
| エラー | Error | 错误 |
| この操作は取り消せません。 | This cannot be undone. | 此操作无法撤销。 |
| 〜を入力してください / 〜を選択してください | Enter 〜 / Select 〜 | 请输入〜 / 请选择〜 |
| 権限がありません | You do not have permission | 没有权限 |
| 見つかりませんでした | Not found | 未找到 |

### 3.19 数量・日付の見せ方

| 種別 | ja | en | zh |
|---|---|---|---|
| 日付 | 2026/06/04 | 2026/06/04 | 2026/06/04 |
| 日時 | 2026/06/04 14:30 | 2026/06/04 14:30 | 2026/06/04 14:30 |
| 金額 | ¥250,000 | ¥250,000 | ¥250,000 |
| 数量 | 50 本 | 50 pcs | 50 支 |
| 相対時刻 | 5分前 | 5 min ago | 5 分钟前 |

書式そのものは `INTL_LOCALES` と表示設定が決める（§2.9）。ここは語だけ。

### 3.20 価格試算・加工の専門語（SA01 / SY02）

| ja | en | zh |
|---|---|---|
| 材料原価 | Material cost | 材料成本 |
| 段加工費 / 段加工長 | Step machining cost / Step length | 阶梯加工费 / 阶梯加工长度 |
| 首下 | Neck length | 颈下长度 |
| 加工単価 | Machining rate | 加工单价 |
| 円筒加工費 / センタレス | Cylindrical grinding cost / Centerless | 圆筒加工费 / 无心磨 |
| コート代 / ラップ処理 | Coating cost / Lapping | 涂层费 / 研磨抛光 |
| LD加工 / LDチャージ | LD machining / LD charge | LD 加工 / LD 费用 |
| LD外径 / LD刃長 | LD outer dia. / LD flute length | LD 外径 / LD 刃长 |
| 先端のみ / 先端+外周 | Tip only / Tip + periphery | 仅前端 / 前端+外周 |
| 補正値 / 掛け率 | Correction factor / Rate | 修正系数 / 系数 |
| 基準数量 / ロット数 | Base quantity / Lots | 基准数量 / 批次数 |
| 参照価格 | Reference price | 参考价格 |
| 最新単価 / 最高単価 / 平均 | Latest / Highest / Average | 最新 / 最高 / 平均 |
| 総型形状 | Form shape | 成型形状 |
| ストレート / テーパー | Straight / Taper | 直身 / 锥度 |
| 仕上げ / 粗 | Finish / Rough | 精加工 / 粗加工 |
| 検査成績書 | Inspection certificate | 检查成绩书 |

---

## 4. 決定事項（2026-08-30）

| # | 決定 | 効く先 |
|---|---|---|
| 1 | 「注文請書」「注文明細」は**この語のまま**使う（改称しない） | UI・マニュアル・仕様。`_specs/design.md` §17.1 の「未確認」注記は削除済み |
| 2 | 「試算」→ **「価格試算」**（SY02 は「価格試算計算」） | `app-list.ts` / 画面ラベル / マニュアル。`estimates` テーブル・`EST-` は変えない |
| 3 | 拠点の en は **Site**（zh は据点）。Plant / 工厂 は使わない | 全画面。`plants` テーブル名は変えない |
| 4 | 請求書の zh は **请款单**（发票 は税務証憑なので使わない） | 帳票・画面 |
| 5 | 材種の zh は **材料类别** | 画面 |
| 6 | 「承認待ち」は廃し **「承認依頼中」に統一** | `StatusBadge.tsx` の WorkOrder / ApprovalRequest |
| 7 | 「作成中」は廃し **「下書き」に統一** | `enum-labels.ts` の `PURCHASE_STATUS_LABEL` |
| 8 | 工程と工程ステップは 1 語（**工程 / Step / 工序**） | 全画面 |
| 9 | 実施場所は **社内 / 外注** の 2 語だけ。「社内のみ」「社内・外注」はその組み立て | `PROCESS_EXECUTION_LABEL` |
| 10 | **見積書・納品書・請求書は受取先の言語で出す**（未設定なら既定言語 ja）。閲覧者の設定では変わらない | PDF テンプレート / 取引先マスタに言語設定が要る |
| 11 | **DB の多言語データは可変キー JSON + モーダル編集**（§2.10）。言語ごとの入力欄を並べない。**実装済み**（2026-08-30）— `components/ui/shells.tsx` の `LocalizedTextInput`（ja 欄 + 「多言語」ボタン → `LOCALES` を見て組み立てるモーダル）。適用済み: 製品 / 素材 / 材種 / 工程マスタ / 検査表テンプレート / 不良種類 / 承認グループ / 拠点（住所も） / 取引先（住所も）。未適用（従来どおり言語ごとの入力欄）: 作業場所・保管場所・承認フロー（ステップ名・条件ルール名）・地域・キオスク端末名 — 各々 `@mantine/form` を使わない独自の簡易編集 UI のため後日対応 | 全マスタ画面 / `_specs/tables.md` の `{ ja, en }` 規約 |
| 12 | マスタ名称など**ハードコードでない語は本書の対象外** | §1 |
| 13 | 「キオスク」は **共有端末 / Shared device / 共用终端**（en は §2.2 の sentence case により `device` は小文字） | SY0A・画面文言（`nextjs-kiosk` のパス名は変えない） |

## 5. 未決

**「キャンセル」が動詞と状態で同語。** ボタンの「キャンセル」（操作をやめる）と、
書類の状態「キャンセル」（取り消し済み）。en は `Cancel` / `Cancelled` で割れるが、
zh は `取消` / `已取消` で字面が近い。§3.16 は暫定で**書類の取り消し操作を「作废单据」**
にしてある。これで良いか確認したい。

## 6. 次の作業（確定後）

1. **ja の統一を先に入れる**（決定 2・6・7・8・9・13）— 多言語化と混ぜると差分が読めない。`StatusBadge.tsx` / `enum-labels.ts` / `app-list.ts` の 3 ファイルでほぼ済む。
2. 1 箇所で効くものからカタログ化 — `StatusBadge.tsx` / `enum-labels.ts` / `app-list.ts` / `audit.ts`。
3. 画面はカテゴリ単位で移す（販売 → 購買 → 生産 …）。未移行の画面は日本語直書きのまま動く。
4. ~~決定 11 の実装~~ — 済（`LocalizedTextInput` + 9 マスタ）。残りは作業場所・保管場所・承認フロー・地域・キオスク端末名の独自簡易 UI を同じ部品に載せ替えること。`_specs/tables.md` の `{ ja, en }` 規約説明も可変キーに触れるよう更新すること。
5. 決定 10 の実装 — 取引先の言語設定、PDF テンプレートの多言語化、`documentFormatters` に「言語は受取先で決まる」を足す。
