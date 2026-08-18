/**
 * field-help.ts — 入力欄の「?」に出す要約と、マニュアルの該当箇所。
 *
 * 画面の入力欄からマニュアルへ迷わず辿れるように、**要約とリンク先をここ 1 箇所**に
 * まとめる。呼び出し側は展開するだけ:
 *
 *   <DatePickerInput label={<HelpLabel {...fieldHelp("quote", "deliveryDate")} />} … />
 *
 * リンク先はアプリ key（= マニュアルのフォルダ名）とフィールド名から組み立てる:
 *   operations/<カテゴリ>/<アプリ>/user#field-<ケバブ化したフィールド名>
 * マニュアル側は `### 納期 [#field-delivery-date]` のように **明示 ID** を書くこと
 * （自動生成 ID は見出し文言に依存して壊れやすい）。
 *
 * ラベルと要約は **マニュアルの `## 入力項目` から生成**している（同じ文を二重に
 * 書かないため）。文言を直すときはマニュアル側を直し、
 * `tools/docs-screenshots` の scratch スクリプトで再生成する。
 *
 * ID が実在するかは field-help.test.ts が実ファイルを読んで検証する — 見出しを
 * 消す・改名すると落ちるので、リンク切れが放置されない。
 */

/** マニュアル上のアプリ位置（operations/<カテゴリ>/<アプリ>）。 */
const APP_MANUAL_PATH = {
  quote: "operations/sales/quote/user",
  priceList: "operations/sales/price-list/user",
  orderAcceptance: "operations/sales/order-acceptance/user",
  designRequest: "operations/sales/design-request/user",
  trialEstimate: "operations/sales/trial-estimate/user",
  purchaseRequest: "operations/purchasing/purchase-request/user",
  purchaseOrder: "operations/purchasing/purchase-order/user",
  materialReceipt: "operations/purchasing/material-receipt/user",
  workOrder: "operations/production/work-order/user",
  productInventory: "operations/production/product-inventory/user",
  materialInventory: "operations/production/material-inventory/user",
  approval: "operations/production/approval/user",
  shippingOrder: "operations/shipping/shipping-order/user",
  deliveryNote: "operations/shipping/delivery-note/user",
  businessPartner: "operations/masters/business-partner/user",
  product: "operations/masters/product/user",
  materialType: "operations/masters/material-type/user",
  material: "operations/masters/material/user",
  processStep: "operations/masters/process-step/user",
  inspectionTemplate: "operations/masters/inspection-template/user",
  defectType: "operations/masters/defect-type/user",
  approvalGroup: "operations/masters/approval-group/user",
  plant: "operations/masters/plant/user",
  materialNumbering: "operations/masters/material-numbering/user",
  workLocation: "operations/masters/work-location/user",
  storageLocation: "operations/masters/storage-location/user",
  userManagement: "operations/system/user-management/user",
  fileManagement: "operations/system/file-management/user",
  kioskCard: "operations/system/kiosk-card/user",
  kioskDevice: "operations/system/kiosk-device/user",
  productType: "operations/system/product-type/settings",
} as const satisfies Record<string, string>;

export type HelpApp = keyof typeof APP_MANUAL_PATH;

interface FieldHelpEntry {
  /** 入力欄に出すラベル。 */
  label: string;
  /** 「?」のポップアップに出す 1〜2 行の要約。 */
  summary: string;
  /** 既定（field-<kebab>）と違う ID を使う場合のみ指定。 */
  anchor?: string;
}

/**
 * アプリ → フィールド → 説明。マニュアルの `## 入力項目` と 1 対 1 で対応する。
 */
export const FIELD_HELP = {
  quote: {
    customer: {
      label: "顧客",
      summary:
        "見積書を出すお客様を選びます。ここで選んだ顧客の価格表から単価が決まるため、最初に選んでください。",
    },
    customerBranch: {
      label: "支店",
      summary:
        "宛先の支店を選びます。その顧客に支店が登録されていないときは選べません（空のままで問題ありません）。",
    },
    validUntil: {
      label: "有効期限",
      summary:
        "この見積が有効な最終日です。日付を過ぎた見積書は、一覧で「期限切れ」として扱えます。",
    },
    status: {
      label: "状態",
      summary: "見積書のいまの扱いです。新しく作ると「下書き」から始まります。",
    },
    product: {
      label: "製品",
      summary:
        "見積もる製品を選びます。選ぶと、顧客・注文種別・数量の組み合わせに合う単価が価格表から自動で入ります。",
    },
    orderType: {
      label: "注文種別",
      summary:
        "本番・テスト・サンプル・その他の区分です。同じ製品でも種別ごとに価格が違うため、実際の注文に合わせて選んでください（サンプルは金額 0 で扱います）。",
    },
    quantity: {
      label: "数量",
      summary:
        "本数を入れます。価格表で数量の範囲ごとに単価が決まっている場合は、入れた数量に応じて単価が変わります。",
    },
    deliveryDate: {
      label: "納期",
      summary: "その明細をお客様へ納入する予定日です。明細ごとに指定できます。",
    },
    notes: {
      label: "備考",
      summary: "社内向けの補足です。見積書の PDF には出ません。",
    },
  },
  priceList: {
    customer: {
      label: "顧客",
      summary:
        "価格を決める相手です。顧客と製品の組み合わせで 1 つの価格表になり、作った後は変えられません。",
    },
    product: {
      label: "製品",
      summary: "価格を決める製品です。顧客と同じく、作った後は変えられません。",
    },
    orderType: {
      label: "注文種別",
      summary:
        "本番・テスト・サンプル・その他の区分です。同じ顧客・製品でも、種別ごとに違う価格を持てます。",
    },
    basePrice: {
      label: "基準単価",
      summary:
        "数量段階のもとになる単価です。段階ごとの単価は、この単価に倍率を掛けて決まります。",
    },
    validFrom: {
      label: "有効開始日",
      summary:
        "この価格を使い始める日です。見積書を作るとき、その時点で有効な価格が使われます。",
    },
    validUntil: {
      label: "有効終了日",
      summary: "この価格を使い終わる日です。空にすると期限なしになります。",
    },
    multiplier: {
      label: "倍率",
      summary:
        "数量の範囲ごとの掛け率です。たくさん買うほど単価を下げたいときに、1 より小さい値を入れます。",
    },
    customPrice: {
      label: "カスタム単価",
      summary:
        "その段階だけ単価を手で決めたいときに使います。入れると倍率での計算より優先されます。",
    },
  },
  orderAcceptance: {
    customer: {
      label: "顧客",
      summary:
        "注文をくれたお客様です。取り込んだ注文書から自動で判定されますが、判定できないことがあるので、その場合はここで選びます。",
    },
    customerOrderRef: {
      label: "顧客注文書番号",
      summary:
        "お客様側の注文書に書かれている番号です。後から問い合わせを受けたときに、この番号で探せます。",
    },
    quoteNumber: {
      label: "見積書番号",
      summary:
        "もとになった見積書です。指定すると、受諾したときにその見積書が自動で「受諾済」になります。",
    },
    orderDate: {
      label: "注文日",
      summary: "お客様が注文した日です。注文書に書かれている日付を入れます。",
    },
    notes: {
      label: "備考",
      summary:
        "注文請書全体への補足です。明細ごとの補足は、各行の備考に書きます。",
    },
    product: {
      label: "製品",
      summary:
        "注文された製品です。注文書の品名から自動で当てはめますが、当たらないことがあります — その場合は手で選びます。",
    },
    orderType: {
      label: "種別",
      summary:
        "本番・テスト・サンプル・その他の区分です。価格はこの区分ごとに違います。",
    },
    quantity: {
      label: "数量",
      summary: "注文された本数です。読み取り結果が違っていれば直してください。",
    },
    unitPrice: {
      label: "単価",
      summary:
        "1 本あたりの価格です。価格表の単価と違うときは、その場で差異として示されます。",
    },
    deliveryDate: {
      label: "納期",
      summary:
        "その明細の納期です。明細に指定が無い場合は、ヘッダの希望納期が使われます。",
    },
    itemNotes: {
      label: "明細の備考",
      summary: "その明細だけへの補足です（版数やカスタム内容など）。",
    },
  },
  designRequest: {
    trigger: {
      label: "トリガー",
      summary:
        "その依頼が 見積のためのものか、受注が決まってからのものかを選びます。選んだ方によって、次の「見積書」か「注文明細」のどちらを紐づけるかが変わります。",
    },
    quote: {
      label: "見積書",
      summary:
        "トリガーが見積時のときに選びます。どの見積のための設計かを残しておくと、後から経緯をたどれます。",
    },
    orderLine: {
      label: "注文明細",
      summary:
        "トリガーが受注時のときに選びます。どの受注のための設計かを残します。",
    },
    product: {
      label: "製品",
      summary:
        "図面をつくる対象の製品です。新規の製品でまだ登録が無い場合は空のままにできます — 製品が登録された後で紐づけても構いません。",
    },
    description: {
      label: "依頼内容",
      summary:
        "何を設計してほしいかを書きます。製造の担当者はここだけを見て図面を作るので、寸法・形状・参考にする既存品・注意点などを具体的に書いてください。",
    },
  },
  trialEstimate: {
    customer: {
      label: "見積り先",
      summary:
        "誰向けの試算かです。空のままでも計算できます — 相手が決まっていない段階の概算にも使えます。",
    },
    product: {
      label: "製品",
      summary:
        "どの製品の試算かです。製品にリンクしておくと、確定後に価格表の基準単価ソースとして選べるようになります。",
    },
    maxDiameter: {
      label: "最大径 (mm)",
      summary: "製品の最大の直径です。素材の直径を選ぶときの目安になります。",
    },
    length: {
      label: "全長 (mm)",
      summary:
        "製品の長さです。材料費は長さで決まるので、ここが変わると材料原価が変わります。",
    },
    materialType: {
      label: "材種",
      summary:
        "使う材料の種類です。メーカーと材質の組み合わせで決まっているものから選びます。",
    },
    diameter: {
      label: "直径",
      summary: "素材の直径です。製品の最大径より太いものを選びます。",
    },
    surfaceFinish: {
      label: "黒皮/研磨",
      summary:
        "素材の表面の状態です。黒皮のほうが安いかわりに、センタレス研磨の加算が必要になることがあります。",
    },
    cylinderType: {
      label: "円筒種類",
      summary: "工具種が円筒のときに選びます。種類によって加工費が変わります。",
    },
    stepMachining: {
      label: "段加工長 (mm) / 段加工種類",
      summary:
        "段加工をする長さと、その種類です。長さと種類の組み合わせで費用が決まります。",
    },
    neckMachining: {
      label: "首下加工長 (mm) / 首下加工種類",
      summary:
        "首下加工をする長さと、その種類です。こちらも、しない場合は空のままにします。",
    },
    machiningTime: {
      label: "加工時間 (分)",
      summary:
        "1 本あたりの加工時間です。加工費はこの時間から計算されるので、実際の段取りに近い値を入れてください。",
    },
    coating: {
      label: "コート",
      summary: "コーティングの種類です。選ぶとその分の費用が加算されます。",
    },
    lapping: {
      label: "ラップ処理",
      summary: "ラップ処理をするかどうかです。",
    },
    inspectionReport: {
      label: "検査成績書",
      summary:
        "検査成績書を付けるかどうかです。付けると検査の費用が加算されます。",
    },
    ld: {
      label: "LD加工あり / LD部位 / LD外径 (mm) / LD刃長 (mm)",
      summary:
        "LD 加工をする場合の条件です。「LD加工あり」を入れると、部位・外径・刃長を指定できるようになります。",
    },
  },
  purchaseRequest: {
    reason: {
      label: "依頼理由",
      summary:
        "なぜその素材が必要なのかを書きます。承認する人はここを見て判断しますので、「どの製品のどの工程で使うのか」まで書いておくと、やり取りが減ります。",
    },
    notes: {
      label: "備考",
      summary:
        "依頼全体への補足です。特定の素材だけの話は、明細側の備考に書いてください。",
    },
    material: {
      label: "素材",
      summary:
        "ほしい素材を選びます。一覧に無いときは、先に素材マスタへ登録してください。",
    },
    plant: {
      label: "入荷先拠点",
      summary:
        "その素材を受け取る拠点です。ここで指定した拠点の在庫として入りますので、実際に使う場所を選んでください。",
    },
    quantity: {
      label: "数量",
      summary: "ほしい数を入れます。あとの発注書でも同じ数が引き継がれます。",
    },
    unit: {
      label: "単位",
      summary:
        "本・kg・m など、数え方の単位です。素材を選ぶと既定の単位が入ります。",
    },
    desiredDate: {
      label: "希望納期",
      summary:
        "いつまでに欲しいかの希望日です。確定した予定ではありません — 実際の入荷予定日は、発注書を作るときに仕入先と決めます。",
    },
    itemNotes: {
      label: "明細の備考",
      summary: "その素材だけへの補足です（「前回と同じロットで」など）。",
    },
  },
  purchaseOrder: {
    supplier: {
      label: "仕入先",
      summary:
        "素材を買う相手です。一覧に無いときは外注企業マスタへ登録してください。",
    },
    orderDate: {
      label: "発注日",
      summary: "発注する日です。既定で今日が入ります。",
    },
    notes: {
      label: "備考",
      summary:
        "発注書全体への補足です。特定の素材だけの話は、明細側の備考に書いてください。",
    },
    material: {
      label: "素材",
      summary:
        "発注する素材を選びます。購買依頼から発注書を作った場合は、依頼の内容が引き継がれています。",
    },
    plant: {
      label: "入荷先拠点",
      summary:
        "その素材を受け取る拠点です。入荷を記録するとこの拠点の在庫が増えます。",
    },
    quantity: {
      label: "数量",
      summary:
        "発注する数です。入荷のときに分割して受け取ることもできます（複数回に分けて届く場合）。",
    },
    unit: {
      label: "単位",
      summary:
        "本・kg・m など、数え方の単位です。素材を選ぶと既定の単位が入ります。",
    },
    unitPrice: {
      label: "単価",
      summary:
        "1 単位あたりの価格です。ここに入れた金額が、試算の材料費の参考価格として使われますので、実際の取引価格を入れてください。",
    },
    expectedDate: {
      label: "入荷予定日",
      summary: "その素材が届く予定の日です。仕入先と決めた日を入れます。",
    },
    itemNotes: {
      label: "明細の備考",
      summary:
        "その素材だけへの補足です。発注書全体への補足は、上の備考に書きます。",
    },
  },
  materialReceipt: {
    material: {
      label: "素材",
      summary:
        "届いた素材を選びます。発注書から入荷を記録する場合は、発注の内容が引き継がれています。",
    },
    supplier: {
      label: "仕入先",
      summary: "届けてくれた会社です。発注書からの入荷では自動で入ります。",
    },
    plant: {
      label: "入荷先拠点",
      summary:
        "実際に受け取った拠点です。この拠点の在庫が増えますので、荷物が着いた場所を選んでください。",
    },
    receivedDate: {
      label: "入荷日",
      summary: "受け取った日です。この日付で在庫が増えます。",
    },
    quantity: {
      label: "数量",
      summary:
        "実際に届いた数です。発注した数と違っても構いません — 分けて届く場合は、届いた分だけを記録します。",
    },
    unit: {
      label: "単位",
      summary:
        "本・kg・m など、数え方の単位です。素材を選ぶと既定の単位が入ります。",
    },
    notes: {
      label: "備考",
      summary:
        "補足です。キズがあった・員数が違ったなど、後から確認したくなることを書いておきます。",
    },
  },
  workOrder: {
    orderLine: {
      label: "注文明細",
      summary:
        "どの受注に対する指示書かです。在庫を積むためだけの指示書では空のままにできます（独立した在庫用の指示書）。",
    },
    product: {
      label: "対象製品",
      summary:
        "つくる製品です。注文明細を選んだ場合は、その受注の製品が入ります。",
    },
    plannedQuantity: {
      label: "予定数量",
      summary:
        "つくる本数です。工程の受入数の初期値になり、在庫から出す分と製造する分を分けるときの基準にもなります。",
    },
    material: {
      label: "使用素材",
      summary:
        "使う素材です。指示書が承認されると、この素材が在庫から予約されます。",
    },
    route: {
      label: "工程リスト / バージョン",
      summary:
        "どの工程の並びを使うかです。製品ごとに登録された工程リストから選びます。",
    },
    newRouteName: {
      label: "新しい工程リスト名",
      summary:
        "その場で新しい工程リストを作る場合の名前です。次回以降、同じ製品でこの並びを選べるようになります。",
    },
    inspectionTemplates: {
      label: "検査表",
      summary: "この指示書で使う検査表テンプレートです。複数選べます。",
    },
    notes: {
      label: "備考",
      summary: "補足です。現場が指示書を見るときに読まれます。",
    },
  },
  productInventory: {
    plant: {
      label: "移動先の拠点",
      summary:
        "どの拠点へ移すかです。移動元の在庫が減り、移動先の在庫が増えます。",
    },
    location: {
      label: "保管場所 / 棚",
      summary:
        "移動先の拠点の中で、どこに置くかです。決めておくと、あとで現物を探しやすくなります。",
    },
    quantity: {
      label: "数量",
      summary: "移す数です。移動元にある数を超えては移せません。",
    },
    notes: {
      label: "備考",
      summary: "移動の理由などを残しておく欄です。移動の記録は履歴に残ります。",
    },
  },
  materialInventory: {
    plant: {
      label: "移動先の拠点",
      summary:
        "どの拠点へ移すかです。移動元の在庫が減り、移動先の在庫が増えます。",
    },
    location: {
      label: "保管場所 / 棚",
      summary:
        "移動先の拠点の中で、どこに置くかです。決めておくと、あとで現物を探しやすくなります。",
    },
    quantity: {
      label: "数量",
      summary: "移す数です。移動元にある数を超えては移せません。",
    },
    notes: {
      label: "備考",
      summary: "移動の理由などを残しておく欄です。移動の記録は履歴に残ります。",
    },
  },
  approval: {
    rejectReason: {
      label: "差し戻し理由",
      summary: "差し戻すときの理由です。依頼した人に、そのまま見えます。",
    },
  },
  shippingOrder: {
    orderLine: {
      label: "注文明細",
      summary:
        "どの受注に対する出荷かを選びます。選ぶと、その受注の製品と残りの数量が分かります。",
    },
    type: {
      label: "種別",
      summary: "出荷の種類です。発送だけが納品書・請求へ進みます。",
    },
    plant: {
      label: "出荷元拠点",
      summary:
        "どの拠点から出すかです。この拠点の在庫が減りますので、実際に荷物を出す拠点を選んでください。",
    },
    notes: {
      label: "備考",
      summary:
        "出荷書全体への補足です。明細ごとの補足は、各行の備考に書きます。",
    },
    product: {
      label: "製品",
      summary: "出す製品です。注文明細を選ぶと、その受注の製品から選べます。",
    },
    quantity: {
      label: "数量",
      summary: "出す本数です。ロットの在庫数を超えては出せません。",
    },
  },
  deliveryNote: {
    shippingOrder: {
      label: "出荷書",
      summary:
        "もとになる出荷書です。選ぶと、その出荷の製品・数量が引き継がれます。",
    },
    deliveryMethod: {
      label: "納品方法",
      summary:
        "通常 … 受注元へ納品します。納品書を荷物に同梱します / ユーザー直送 … 最終需要家へ直接送ります。納品書は別送し、価格は載せないのが通常です",
    },
    recipient: {
      label: "納品先",
      summary:
        "納品書の宛先です。通常は受注元、直送のときは届け先に合わせて指定します。",
    },
    endUser: {
      label: "最終需要家",
      summary:
        "直送のときの実際の届け先です。大口のお客様のみ登録されています。",
    },
    includePrice: {
      label: "価格記載",
      summary:
        "納品書に単価・金額を載せるかどうかです。ユーザー直送では外すのが通常です（最終需要家に取引価格を知らせないため）。",
    },
    notes: {
      label: "備考",
      summary: "納品書への補足です。納品書の PDF に出ます。",
    },
    product: {
      label: "製品",
      summary: "納品する製品です。出荷書から引き継がれます。",
    },
    quantity: {
      label: "数量",
      summary: "納品する本数です。出荷書の数量が初めから入っています。",
    },
    unitPrice: {
      label: "単価",
      summary:
        "納品書に載せる単価です。「価格記載」を外している場合は印字されません。",
    },
  },
  businessPartner: {
    bpCode: {
      label: "BP コード",
      summary: "取引先の番号です。自動で付きます。",
    },
    name: {
      label: "名称",
      summary:
        "会社名です。書類にそのまま出ますので、正式名称を入れてください。",
    },
    nameKana: {
      label: "フリガナ / 略称",
      summary:
        "フリガナは名前で探すときに使います。略称は、一覧など幅の狭いところに短く出したい場合に入れます。",
    },
    country: {
      label: "国",
      summary: "相手の国です。海外の取引先を見分けるのに使います。",
    },
    taxNumber: {
      label: "法人番号",
      summary: "法人番号などの識別番号です。請求や会計の照合に使います。",
    },
    matchNames: {
      label: "AI 照合名",
      summary:
        "受け取った書類を自動で読み取るときに、同じ会社だと判断させたい別表記です。旧社名や、「株式会社」の付け方が違う書き方などを並べておくと、取り込みで会社を取り違えにくくなります。",
    },
    address: {
      label: "郵便番号 / 住所",
      summary: "所在地です。納品書や請求書に出ます。",
    },
    contact: {
      label: "電話番号 / FAX / メールアドレス / Web サイト",
      summary:
        "会社としての連絡先です。担当者ごとの連絡先は、別に「担当者」として登録します。",
    },
    active: {
      label: "有効",
      summary:
        "外すと、見積書や発注書などで新しく選べなくなります。すでにその会社で作った書類はそのまま残ります。",
    },
    notes: {
      label: "備考",
      summary:
        "補足です。後から見た人が経緯をたどれるように、決めた理由や注意点を書いておくと役に立ちます。",
    },
    billingBp: {
      label: "請求先（別法人の場合）",
      summary:
        "請求書の宛先が別の会社のときに指定します。空なら、その会社自身が宛先です。",
    },
    paymentTerms: {
      label: "締日 / 支払サイト / 支払日",
      summary: "入金の約束です。締日処理は、ここで決めた締日ごとに動きます。",
    },
    creditLimit: {
      label: "与信限度額",
      summary: "掛けで受けられる金額の目安です。",
    },
    taxType: {
      label: "課税区分",
      summary: "消費税の扱いです。請求書の計算に使われます。",
    },
    invoiceMethod: {
      label: "請求書送付方法",
      summary: "請求書をメール・FAX・郵送・ポータルのどれで届けるかです。",
    },
    consignment: {
      label: "委託先",
      summary:
        "委託販売の対象かどうかです。委託販売をしている相手にだけ付けます。",
    },
    vendorType: {
      label: "外注種別",
      summary:
        "仕入先（素材や資材を買う相手）か、外注先（工程の一部を頼む相手）かです。ここで選んだ側の画面にだけ、その会社が出ます。",
    },
    leadTime: {
      label: "標準リードタイム（日数）",
      summary:
        "頼んでから戻ってくるまでの目安の日数です。外注の入荷予定日を決めるときの目安になります。",
    },
    vendorPayment: {
      label: "締日 / 支払サイト / 支払日",
      summary: "こちらから支払うときの約束です。",
    },
    bank: {
      label: "銀行名 / 支店名 / 口座種別 / 口座番号",
      summary: "振込先の口座です。こちらから支払うときに使います。",
    },
    industry: {
      label: "業種",
      summary:
        "どんな業種の会社かです。最終需要家は大口のところだけ登録すれば十分で、すべての需要家を登録する必要はありません。",
    },
  },
  product: {
    code: {
      label: "製品コード",
      summary:
        "製品の管理番号です。見積書・注文明細・指示書など、あらゆる書類でこの番号を使います。",
    },
    name: {
      label: "名称",
      summary: "製品の名前です。書類にはこの名前が印字されます。",
    },
    unit: {
      label: "単位",
      summary: "数え方の単位です。既定は「本」です。",
    },
    productType: {
      label: "製品種別",
      summary:
        "製品の種別です。種別を選ぶと、その種別に決められた項目（仕様）が下に出てきます。",
    },
    materialType: {
      label: "材種",
      summary: "その製品を作るのに使う材料の種類です。",
    },
    dimensions: {
      label: "直径 (mm) / 全長 (mm)",
      summary:
        "必要な素材の寸法です。特定の素材ではなく「材種 + 直径 + 全長」で指定します — 同じ条件の素材ならどれを使っても作れるためです。",
    },
    active: {
      label: "有効",
      summary: "外すと、見積書や価格表の製品の選択肢に出なくなります。",
    },
    notes: {
      label: "備考",
      summary:
        "補足です。後から見た人が経緯をたどれるように、決めた理由や注意点を書いておくと役に立ちます。",
    },
  },
  materialType: {
    manufacturer: {
      label: "メーカー",
      summary: "材料のメーカーです。選択肢は採番構成で登録します。",
    },
    grade: {
      label: "メーカー材種",
      summary:
        "そのメーカーの中での材質です。メーカーを選ぶと、そのメーカーの材質だけが出ます。",
    },
    shape: {
      label: "形状",
      summary: "通常・OH・円筒などの形状です。",
    },
    name: {
      label: "名称",
      summary: "材種の名前です。素材や製品の画面でこの名前が出ます。",
    },
    active: {
      label: "有効",
      summary: "外すと、素材や製品の材種の選択肢に出なくなります。",
    },
  },
  material: {
    materialType: {
      label: "材種",
      summary: "もとになる材種です。先に材種を登録しておきます。",
    },
    surfaceFinish: {
      label: "黒皮・研磨",
      summary: "表面の状態です。黒皮・研磨・研磨済黒皮から選びます。",
    },
    dimensions: {
      label: "直径 (mm) / 全長 (mm)",
      summary: "素材の寸法です。この 2 つが素材コードの一部になります。",
    },
    kind: {
      label: "種類",
      summary: "形状ごとに決まっている種類です（OH の CH・2V30 など）。",
    },
    code: {
      label: "素材コード",
      summary:
        "材種・表面・直径・全長の組み合わせから決まるコードです。自動で組み立てられます。",
    },
    name: {
      label: "名称",
      summary: "素材の名前です。発注や入荷の画面でこの名前が出ます。",
    },
    unit: {
      label: "単位",
      summary: "数え方の単位です。発注や入荷の既定の単位になります。",
    },
    model: {
      label: "メーカ型式 / 呼び径 (mm)",
      summary:
        "メーカーの型式と呼び径です。発注のときに相手へ伝える情報として登録します。",
    },
    active: {
      label: "有効",
      summary: "外すと、発注や入荷の素材の選択肢に出なくなります。",
    },
    notes: {
      label: "備考",
      summary:
        "補足です。後から見た人が経緯をたどれるように、決めた理由や注意点を書いておくと役に立ちます。",
    },
  },
  processStep: {
    code: {
      label: "工程コード / 名称",
      summary: "工程の管理番号と名前です。指示書ではこの名前が並びます。",
    },
    category: {
      label: "カテゴリ",
      summary: "材料準備・加工・コーティング・検査・検査承認・出荷の区分です。",
    },
    execution: {
      label: "実施場所",
      summary:
        "社内のみか、社内・外注のどちらでもよいかです。外注も可にすると、指示書で外注先を選べるようになります。",
    },
    quantityTracking: {
      label: "数量管理",
      summary:
        "その工程で本数をどう扱うかです。通す（数量を引き継ぐ）/ 検査として数える / 数えない のいずれかで、工程実行画面の入力欄が変わります。",
    },
    defaultTime: {
      label: "既定作業時間",
      summary: "1 回あたりの目安時間です。指示書を作るときの初期値になります。",
    },
    sync: {
      label: "同期可",
      summary: "他の工程と並行して進められるかどうかです。",
    },
    inspection: {
      label: "検査工程 / 検査承認工程",
      summary:
        "検査を行う工程か、検査結果を承認する工程かです。検査工程にすると、工程実行画面で検査表を記録できます。",
    },
    approvalRank: {
      label: "承認必要役職",
      summary: "その工程の承認に必要な役職です（係長以上など）。",
    },
    sortOrder: {
      label: "表示順",
      summary: "一覧や選択肢での並び順です。小さいほど先に出ます。",
    },
    active: {
      label: "有効 / 備考",
      summary: "外すと工程の選択肢に出なくなります。備考は補足です。",
    },
  },
  inspectionTemplate: {
    code: {
      label: "コード / 名称",
      summary:
        "テンプレートの管理番号と名前です。指示書に紐づけるときにこの名前で選びます。",
    },
    processStep: {
      label: "関連工程",
      summary:
        "どの工程で使う検査表かです。指定しておくと、その工程の実行画面で選びやすくなります。",
    },
    active: {
      label: "有効",
      summary: "外すと、指示書に紐づける選択肢に出なくなります。",
    },
  },
  defectType: {
    code: {
      label: "コード / 名称",
      summary:
        "不良種類の管理番号と名前です。工程で不良を記録するときにこの名前で選びます。",
    },
    sortOrder: {
      label: "表示順",
      summary:
        "選択肢での並び順です。よく使うものを上にしておくと現場が入力しやすくなります。",
    },
    active: {
      label: "有効",
      summary: "外すと、不良記録の選択肢に出なくなります。",
    },
  },
  approvalGroup: {
    type: {
      label: "種別",
      summary:
        "第一承認（生産判断）・第二承認（部門承認）・ワークフロー変更承認のどれかです。指示書の承認はこの種別の順に進みます。",
    },
    name: {
      label: "名称",
      summary:
        "グループの名前です。承認者を選ぶときの一覧に、この名前で出ます。",
    },
    active: {
      label: "有効",
      summary:
        "外すと、そのグループでの承認が行われなくなります。メンバーと代理の設定は詳細画面で行います。",
    },
  },
  plant: {
    code: {
      label: "拠点コード",
      summary: "拠点の管理番号です。在庫や出荷の画面でこのコードが使われます。",
    },
    name: {
      label: "名称 / よみがな",
      summary: "拠点の名前です。在庫・入荷・出荷の「どこの」を表します。",
    },
    region: {
      label: "国 / 地域",
      summary:
        "国と地域の区分です。利用者の権限を「この地域の拠点だけ」と決めるときの単位になります。",
    },
    address: {
      label: "郵便番号 / 住所",
      summary: "所在地です。書類の宛先に使われます。",
    },
    contact: {
      label: "電話番号 / メールアドレス / 担当者",
      summary: "連絡先です。書類の問い合わせ先として使います。",
    },
    active: {
      label: "有効",
      summary: "外すと、入荷先や出荷元の選択肢に出なくなります。",
    },
    notes: {
      label: "備考",
      summary:
        "補足です。後から見た人が経緯をたどれるように、決めた理由や注意点を書いておくと役に立ちます。",
    },
  },
  materialNumbering: {
    code: {
      label: "コード",
      summary:
        "材種コード・素材コードの一部になる記号です。後から変えると、その部品を使って組み立てた既存のコードと合わなくなるため、登録時に決めてください。",
    },
    name: {
      label: "名称",
      summary: "材種や素材の画面で、選択肢として表示される名前です。",
    },
    active: {
      label: "有効",
      summary:
        "外すと、材種や素材を登録するときの選択肢に出なくなります。使わなくなったメーカーや形状を、過去の登録は残したまま隠すときに使います。",
    },
  },
  workLocation: {
    plant: {
      label: "拠点",
      summary:
        "どの拠点の作業場所かです。工程の実施場所を選ぶときは、その拠点の作業場所だけが候補に出ます。",
    },
    code: {
      label: "コード / 名称（日本語・English）",
      summary: "作業場所の管理番号と名前です。工程の実施場所として選べます。",
    },
    type: {
      label: "種別",
      summary: "作業場所の区分です。一覧の絞り込みに使います。",
    },
    capacity: {
      label: "キャパシティ",
      summary:
        "同時に扱える量の目安です。1 台の機械なら 1、区画なら同時に置ける数を入れます。",
    },
    sortOrder: {
      label: "表示順 / 有効 / 備考",
      summary: "並び順・選択肢に出すか・補足です。",
    },
  },
  storageLocation: {
    plant: {
      label: "拠点 / フロア",
      summary:
        "どの拠点のどのフロアの場所かです。在庫はこの場所の単位で置き場所が分かります。",
    },
    code: {
      label: "コード / 名称（日本語・英語）",
      summary:
        "場所の管理番号と名前です。登録すると、在庫の置き場所として選べるようになります。",
    },
    sortOrder: {
      label: "表示順",
      summary: "選択肢での並び順です。小さいほど先に出ます。",
    },
    active: {
      label: "有効 / 備考",
      summary: "外すと保管場所の選択肢に出なくなります。備考は補足です。",
    },
  },
  userManagement: {
    plants: {
      label: "所属拠点",
      summary: "そのユーザーが担当する拠点です。複数選べます。",
    },
  },
  fileManagement: {
    folderName: {
      label: "フォルダ名",
      summary:
        "新しく作るフォルダの名前です。ファイルは実際にはフォルダではなく名前の付け方で仕分けられているため、フォルダ名はそのまま保存先の目印になります。",
    },
    showSystemFiles: {
      label: "システムファイルを表示",
      summary:
        "「.DS_Store」「\\*.tmp」のような、OS やツールが勝手に作った残骸ファイルを表示するかどうかです。ふだんは隠しておき、掃除したいときだけオンにします。",
    },
    grantFolder: {
      label: "フォルダ（パス前方一致）",
      summary:
        "アクセス権を与えるフォルダです。前方一致なので、指定したフォルダの下にあるものすべてが対象になります。",
    },
    grantUser: {
      label: "ユーザー",
      summary: "そのフォルダを見られるようにする相手です。",
    },
    grantWrite: {
      label: "書き込みも許可",
      summary:
        "オンにすると、見るだけでなくファイルを置いたり消したりできるようになります。必要な人だけに付けてください。",
    },
  },
  kioskCard: {
    count: {
      label: "発行枚数",
      summary:
        "一度に作るカードの枚数です。作った直後のカードはまだ誰のものでもありません。",
    },
    user: {
      label: "割当先ユーザー",
      summary:
        "そのカードを使う人です。割り当てると、その人はカードを現場タブレットにかざしてログインできるようになります。",
    },
  },
  kioskDevice: {
    name: {
      label: "端末名（日本語 / English）",
      summary:
        "一覧・フロアマップ・操作履歴のバッジに出る名前です。「第一工場 入口」のように、現物を探せる名前にしてください。",
    },
    plant: {
      label: "拠点",
      summary: "その端末を置く拠点です。端末は拠点ごとに並びます。",
    },
    location: {
      label: "場所",
      summary:
        "拠点の中での置き場所です。フロアマップにピンを置くと、画面上でも位置がわかります。",
    },
    linkCode: {
      label: "リンクコード",
      summary:
        "タブレット側の画面に出ている確認用のコードです。この画面でまず端末の枠を作り、次にタブレットに出たコードを読み取る（または打ち込む）ことで、その枠と実機が結び付きます。",
    },
  },
  productType: {
    itemName: {
      label: "項目名（日本語 / 英語）",
      summary: "製品の画面に出る欄の名前です。日本語と英語の両方を入れます。",
    },
    key: {
      label: "キー（識別子）",
      summary:
        "その欄を保存するときに使う英数字の名前です。後から変えると、それまでに入力された値が結び付かなくなりますので、登録時に決めてください。",
    },
    type: {
      label: "型",
      summary:
        "文字・数値などの種類です。型によって、この下のどの項目が効くかが変わります — 数値なら最小値・最大値、文字ならパターンです。",
    },
    default: {
      label: "既定値（基本）",
      summary:
        "何も入れなかったときに入る値です。よく使う値を入れておくと入力が減ります。",
    },
    placeholder: {
      label: "プレースホルダ",
      summary: "入力欄に薄く出る例です。値としては保存されません。",
    },
    required: {
      label: "必須項目にする",
      summary: "オンにすると、その欄が空のままでは製品を保存できなくなります。",
    },
    pattern: {
      label: "パターン（正規表現）",
      summary:
        "文字の形の決まりです。決まった書き方をさせたいときだけ使います。",
    },
    range: {
      label: "最小値 / 最大値",
      summary: "数値の項目で、入れられる範囲です。",
    },
    typeName: {
      label: "種別名（日本語 / 英語）",
      summary: "製品を作るときに選ぶ名前です。",
    },
    typeDescription: {
      label: "説明",
      summary: "どんな製品に使う種別かの補足です。",
    },
    typeActive: {
      label: "有効",
      summary:
        "外すと、製品を作るときの選択肢に出なくなります。すでにこの種別で作られた製品はそのまま残ります。",
    },
    typeItems: {
      label: "項目",
      summary:
        "その種別を選んだときに、製品の画面に出る欄です。上で作った製品項目から選びます。",
    },
    typeDefault: {
      label: "既定値（上書き）",
      summary:
        "その項目の既定値を、この種別のときだけ別の値にしたい場合に入れます。空なら製品項目側の既定値が使われます。",
    },
  },
} as const satisfies Record<HelpApp, Record<string, FieldHelpEntry>>;

/** キャメルケース → ケバブケース（deliveryDate → delivery-date）。 */
export function toAnchorId(field: string): string {
  return `field-${field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

/** マニュアルの該当箇所（HelpLabel の `manual` に渡す形）。 */
export function fieldManualTarget<A extends HelpApp>(
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
): string {
  const entry = FIELD_HELP[app][field] as FieldHelpEntry;
  return `${APP_MANUAL_PATH[app]}#${entry.anchor ?? toAnchorId(field)}`;
}

/**
 * HelpLabel にそのまま展開できる props。
 *   <HelpLabel {...fieldHelp("quote", "deliveryDate")} />
 *
 * マニュアルが複数の欄を 1 見出しにまとめている場合（例 `名称 / よみがな`）は、
 * `label` で画面側の文言に上書きする — 説明とリンク先は同じ見出しを指したまま、
 * ラベルだけ画面の言葉に合わせる:
 *   fieldHelp("plant", "name", { label: "よみがな" })
 */
export function fieldHelp<A extends HelpApp>(
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
  options?: { required?: boolean; label?: string },
): { label: string; help: string; manual: string; required?: boolean } {
  const entry = FIELD_HELP[app][field] as FieldHelpEntry;
  return {
    label: options?.label ?? entry.label,
    help: entry.summary,
    manual: fieldManualTarget(app, field),
    ...(options?.required ? { required: true } : {}),
  };
}

/**
 * ラベルを自前で組み立てるコンポーネント（LocalizedTextInput の
 * 「〜（日本語）」など）へ渡す、説明とリンク先だけの組。
 *   <LocalizedTextInput label="名称" help={fieldHelpTip("plant", "name")} … />
 */
export function fieldHelpTip<A extends HelpApp>(
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
): { help: string; manual: string } {
  const entry = FIELD_HELP[app][field] as FieldHelpEntry;
  return { help: entry.summary, manual: fieldManualTarget(app, field) };
}

/** テスト用: 登録済みの (アプリ, フィールド, アンカー, マニュアルパス) を列挙する。 */
export function listFieldHelp(): {
  app: string;
  field: string;
  anchor: string;
  manualPage: string;
}[] {
  return Object.entries(FIELD_HELP).flatMap(([app, fields]) =>
    Object.entries(fields).map(([field, entry]) => ({
      app,
      field,
      anchor: (entry as FieldHelpEntry).anchor ?? toAnchorId(field),
      manualPage: APP_MANUAL_PATH[app as HelpApp],
    })),
  );
}
