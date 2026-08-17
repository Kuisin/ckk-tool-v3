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
 * ID が実在するかは field-help.test.ts が実ファイルを読んで検証する — 見出しを
 * 消す・改名すると落ちるので、リンク切れが放置されない。
 */

/** マニュアル上のアプリ位置（operations/<カテゴリ>/<アプリ>）。 */
const APP_MANUAL_PATH = {
  quote: "operations/sales/quote",
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
 * アプリ → フィールド → 説明。マニュアルの `## 入力項目` と 1 対 1 で対応させる。
 */
export const FIELD_HELP = {
  quote: {
    customer: {
      label: "顧客",
      summary:
        "見積書を出すお客様です。ここで選んだ顧客の価格表から単価が決まるため、最初に選んでください。",
    },
    customerBranch: {
      label: "支店",
      summary:
        "宛先の支店です。その顧客に支店が登録されていないときは選べません（空のままで問題ありません）。",
    },
    validUntil: {
      label: "有効期限",
      summary:
        "この見積が有効な最終日です。日付を過ぎた見積書は一覧で「期限切れ」として扱えます。",
    },
    product: {
      label: "製品",
      summary:
        "見積もる製品です。選ぶと価格表から単価が自動で入ります。価格表に無い製品は単価が入らず警告が出ます。",
    },
    orderType: {
      label: "注文種別",
      summary:
        "本番・テスト・サンプル・その他の区分です。同じ製品でも種別ごとに価格が違います。",
    },
    quantity: {
      label: "数量",
      summary:
        "本数です。価格表で数量の範囲ごとに単価が決まっている場合、入れた数量に応じて単価が変わります。",
    },
    deliveryDate: {
      label: "納期",
      summary:
        "その明細をお客様へ納入する予定日です。明細ごとに指定でき、未定なら空のままにできます。",
    },
    notes: {
      label: "備考",
      summary: "社内向けの補足です。見積書の PDF には出ません。",
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
  return `${APP_MANUAL_PATH[app]}/user#${entry.anchor ?? toAnchorId(field)}`;
}

/**
 * HelpLabel にそのまま展開できる props。
 *   <HelpLabel {...fieldHelp("quote", "deliveryDate")} />
 */
export function fieldHelp<A extends HelpApp>(
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
  options?: { required?: boolean },
): { label: string; help: string; manual: string; required?: boolean } {
  const entry = FIELD_HELP[app][field] as FieldHelpEntry;
  return {
    label: entry.label,
    help: entry.summary,
    manual: fieldManualTarget(app, field),
    ...(options?.required ? { required: true } : {}),
  };
}

/** テスト用: 登録済みの (アプリ, フィールド, アンカー, マニュアルパス) を列挙する。 */
export function listFieldHelp(): {
  app: string;
  field: string;
  anchor: string;
  manualDir: string;
}[] {
  return Object.entries(FIELD_HELP).flatMap(([app, fields]) =>
    Object.entries(fields).map(([field, entry]) => ({
      app,
      field,
      anchor: (entry as FieldHelpEntry).anchor ?? toAnchorId(field),
      manualDir: APP_MANUAL_PATH[app as HelpApp],
    })),
  );
}
