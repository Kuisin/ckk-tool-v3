/**
 * stock-requirements-core.ts — 在庫・所要量 (ST03) の純ロジック。
 *
 * ST03 は「この品目はいつ足りなくなるのか」に答える **品目 1 つ × 拠点 1 つ**
 * の画面（SAP MD04 相当）。在庫一覧 (ST02) が場所から見るのに対し、こちらは
 * 品目から見る — 過去の入出庫（実績）と未来の入荷/出庫予定（計画）を 1 本の
 * 時系列に積んで残高を追う。
 *
 * lib/atp-core.ts との関係: atp-core は素材の available-to-promise
 * （現在庫 − 予約 + 入荷予定）だけを扱う片側（供給のみ）の専用ロジック。
 * ここではそれを一般化し、
 *   - 供給（+）と需要（-）の両方を扱う（素材は購買/引当、製品は指示書/受注）
 *   - 過去の実績行（inventory_transactions）も同じ時系列へ混ぜる
 * ようにした。atp-core は既存の呼び出し元（lib/atp.ts, inventory/materials,
 * production/work-orders/actions.ts）がそのまま動く必要があるため**変更しない**
 * — 表面積の小さい専用ロジックを壊すリスクより、隣に汎用版を置く方を選んだ。
 *
 * 過去行の残高（物理在庫の推移）は「いま」の手持ち数を終点として**逆算**する:
 * 取得できた過去取引の delta を合計し、その合計が手持ち数に届くように起点を
 * 決めてから前向きに積む。こうすると一覧の取得上限（LIST_FETCH_CAP）で古い
 * 行が切れていても、表示されている区間の残高は「いま」に矛盾なくつながる
 * （その区間より前の絶対値までは保証しない — 台帳全体の監査はしない）。
 *
 * 「いま」の行から先は available（手持ち − 予約）を起点に、未来の供給/需要を
 * 日付昇順（未定は最後）で積む — atp-core の buildAtpTimeline と同じ考え方だが、
 * **同日でも 1 要素 = 1 行**にする（atp-core は同日をまとめて 1 点にする —
 * この画面は行ごとに参照書類へリンクするため、まとめると参照が失われる）。
 */

export type PastTransactionType =
  | "IN"
  | "OUT"
  | "RESERVE"
  | "RELEASE"
  | "ADJUST";

/** 過去の実績行（inventory_transactions 1 行）の入力。 */
export interface PastMovementInput {
  /** 実行時刻（ISO 8601, ソート可能な文字列であれば足りる）。 */
  occurredAt: string;
  transactionType: PastTransactionType;
  /**
   * DB 上の quantity。IN/OUT/RESERVE/RELEASE は常に正の数（向きは type が
   * 決める）、ADJUST は符号付き（lib/inventory.ts applyTransaction と同じ規約）。
   */
  quantity: number;
  /** 伝票番号など（表示・リンク用）。無ければ null。 */
  ref: string | null;
  refHref: string | null;
  /** 構造化ノート文字列（表示側で inventoryNoteLabel により言語解決する）。 */
  note: string | null;
}

/** 未来の供給・需要 1 件の入力。quantity は常に正の数（符号は kind が決める）。 */
export interface FutureElementInput {
  kind: "supply" | "demand";
  /** ISO yyyy-mm-dd。null = 日付未定（最後に置く）。 */
  date: string | null;
  quantity: number;
  ref: string;
  refHref: string | null;
}

export interface StockRequirementsInput {
  /** 現在の手持ち数量（物理在庫）。 */
  onHand: number;
  /** 現在の予約数量。 */
  reserved: number;
  /** 過去の実績行。順序は問わない（内部でソートする）。 */
  pastMovements: readonly PastMovementInput[];
  /** 未来の供給・需要要素。順序は問わない（内部でソートする）。 */
  futureElements: readonly FutureElementInput[];
}

export type StockRequirementRowKind = "past" | "now" | "supply" | "demand";

export interface StockRequirementRow {
  key: string;
  kind: StockRequirementRowKind;
  /** past/future は日付（past は日時, future は日付 or null=未定）。now は null。 */
  date: string | null;
  ref: string | null;
  refHref: string | null;
  /** past 行のみ持つ（構造化ノート文字列。表示側で言語解決）。 */
  note: string | null;
  /** この行自体の符号付き数量（now 行は null）。 */
  quantity: number | null;
  /** この行までの累積残高。 */
  balance: number;
}

export interface StockRequirementsTimeline {
  rows: StockRequirementRow[];
  onHand: number;
  reserved: number;
  /** 現在の available（手持ち − 予約）。 */
  availableNow: number;
  /** 直近の確定入荷/完成予定日（供給のうち日付が決まっている最初の 1 件）。 */
  nextReceiptDate: string | null;
  /** 残高が初めて負になった行（無ければ null）。 */
  firstNegative: StockRequirementRow | null;
}

/** ADJUST は符号付きでそのまま加算、IN/OUT は type が向きを決める。 */
function pastPhysicalDelta(
  type: PastTransactionType,
  quantity: number,
): number {
  switch (type) {
    case "IN":
      return quantity;
    case "OUT":
      return -quantity;
    case "ADJUST":
      return quantity;
    // RESERVE/RELEASE は予約数量だけを動かし、物理在庫（手持ち数）は動かさない。
    case "RESERVE":
    case "RELEASE":
      return 0;
  }
}

/**
 * 行の「数量」列に出す、その取引自身の符号付き効果。
 * RESERVE は予約が増える（+）、RELEASE は予約が減る（-）— pastPhysicalDelta
 * とは別軸（残高＝物理在庫には効かないが、行の意味としては符号を持つ）。
 */
function pastRowQuantity(type: PastTransactionType, quantity: number): number {
  switch (type) {
    case "IN":
      return quantity;
    case "OUT":
      return -quantity;
    case "ADJUST":
      return quantity;
    case "RESERVE":
      return quantity;
    case "RELEASE":
      return -quantity;
  }
}

/** 日付未定（null）を最後に送るための比較キー。 */
function dateSortKey(date: string | null): string {
  return date ?? "￿";
}

/**
 * 過去 + 現在 + 未来を 1 本の時系列（残高付き）に組み立てる。
 *
 * 過去行の残高は「いま」の手持ち数（onHand）を終点として逆算する（モジュール
 * 冒頭の説明を参照）。未来行の残高は availableNow を起点に供給(+)/需要(-)を
 * 日付昇順（同日は入力順、未定は最後）で積む。
 */
export function buildStockRequirementsTimeline(
  input: StockRequirementsInput,
): StockRequirementsTimeline {
  const pastSorted = [...input.pastMovements].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  const totalPastDelta = pastSorted.reduce(
    (sum, m) => sum + pastPhysicalDelta(m.transactionType, m.quantity),
    0,
  );
  // 逆算した起点。取得漏れ（LIST_FETCH_CAP による truncate）があっても、
  // 表示区間の終端は必ず onHand に一致する。
  let running = input.onHand - totalPastDelta;

  const rows: StockRequirementRow[] = [];

  pastSorted.forEach((m, i) => {
    running += pastPhysicalDelta(m.transactionType, m.quantity);
    rows.push({
      key: `past:${i}:${m.occurredAt}`,
      kind: "past",
      date: m.occurredAt,
      ref: m.ref,
      refHref: m.refHref,
      note: m.note,
      quantity: pastRowQuantity(m.transactionType, m.quantity),
      balance: running,
    });
  });

  const availableNow = input.onHand - input.reserved;
  rows.push({
    key: "now",
    kind: "now",
    date: null,
    ref: null,
    refHref: null,
    note: null,
    quantity: null,
    balance: availableNow,
  });

  // 同日でも 1 要素 = 1 行のまま（atp-core と違い集約しない）。
  // 安定ソート（Array#sort は ECMA2019 以降 stable）で同キーは入力順を保つ。
  const futureSorted = [...input.futureElements].sort((a, b) =>
    dateSortKey(a.date).localeCompare(dateSortKey(b.date)),
  );

  let runningFuture = availableNow;
  let nextReceiptDate: string | null = null;
  futureSorted.forEach((el, i) => {
    const signed = el.kind === "supply" ? el.quantity : -el.quantity;
    runningFuture += signed;
    if (el.kind === "supply" && el.date != null && nextReceiptDate == null) {
      nextReceiptDate = el.date;
    }
    rows.push({
      key: `future:${i}:${el.kind}:${el.ref}`,
      kind: el.kind,
      date: el.date,
      ref: el.ref,
      refHref: el.refHref,
      note: null,
      quantity: signed,
      balance: runningFuture,
    });
  });

  const firstNegative = rows.find((r) => r.balance < 0) ?? null;

  return {
    rows,
    onHand: input.onHand,
    reserved: input.reserved,
    availableNow,
    nextReceiptDate,
    firstNegative,
  };
}
