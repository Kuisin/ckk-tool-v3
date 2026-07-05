/**
 * enum-labels.ts — DB enum → Japanese UI label maps (_specs/design.md §17.1).
 *
 * Server- and client-safe (pure data). Keep in sync with shared-db enums.
 */

/** master.MATERIAL_FORM */
export const MATERIAL_FORM_LABEL: Record<string, string> = {
  POLISHED: "研磨",
  STANDARD_LENGTH: "定尺",
  SEMI_FINISHED: "半製品",
  OTHER: "その他",
};

export const MATERIAL_FORM_OPTIONS = Object.entries(MATERIAL_FORM_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** 単位 — free-text DB column, but the UI offers a fixed choice set. */
export const UNIT_OPTIONS = ["本", "個", "kg", "m", "セット"].map((u) => ({
  value: u,
  label: u,
}));

/** bp.TAX_TYPE */
export const TAX_TYPE_LABEL: Record<string, string> = {
  TAXABLE: "課税",
  EXEMPT: "非課税",
  REDUCED: "軽減税率",
};

export const TAX_TYPE_OPTIONS = Object.entries(TAX_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** bp.INVOICE_METHOD */
export const INVOICE_METHOD_LABEL: Record<string, string> = {
  EMAIL: "メール",
  FAX: "FAX",
  POST: "郵送",
  PORTAL: "ポータル",
};

export const INVOICE_METHOD_OPTIONS = Object.entries(INVOICE_METHOD_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** bp.VENDOR_TYPE */
export const VENDOR_TYPE_LABEL: Record<string, string> = {
  SUPPLIER: "仕入先",
  OUTSOURCE: "外注先",
};

export const VENDOR_TYPE_OPTIONS = Object.entries(VENDOR_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** ISO 3166-1 alpha-2 — UI で扱う国の固定リスト。 */
export const COUNTRY_LABEL: Record<string, string> = {
  JP: "日本",
  CN: "中国",
  US: "アメリカ",
  KR: "韓国",
};

export const COUNTRY_OPTIONS = Object.entries(COUNTRY_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** 銀行口座種別 — free-text DB column, fixed choice set in the UI. */
export const BANK_ACCOUNT_TYPE_OPTIONS = ["普通", "当座"].map((v) => ({
  value: v,
  label: v,
}));
