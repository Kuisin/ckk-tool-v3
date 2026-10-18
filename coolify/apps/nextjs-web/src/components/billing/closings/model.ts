/**
 * model.ts — 締日処理 (BL02) view-model types + pure helpers.
 *
 * Model (app.billing_closings — uuid PK):
 *   顧客 × 締日 = 1 行。**実行区分（kind）が 2 つある**:
 *     SCHEDULED … 「締日処理を実行」(runClosing) が**指定日までに締日が到来し、
 *                 まだ締めていない顧客すべて**の未請求出荷（SHIPPED × DISPATCH）
 *                 を集計して PENDING 行を作り、続けて請求書（DRAFT）まで作る
 *                 （締日ごとに 1 顧客 1 行・冪等 — 部分 unique index）。
 *     MANUAL    … 手動請求（BL11, createManualInvoice）が納品書を選んで作る
 *                 臨時の 1 行。同じ顧客・同じ日に何度でも作れる。
 *   「請求書を生成」(processClosing) は締日前で自動生成できなかった行や
 *   失敗した行を後から拾うために残っている。
 *   締日は BpCustomerAttrs.closingDay（1–31、31・未設定 = 月末）から決まる。
 *
 * Decimal 列（totalAmount）はサーバー境界で Number() 済み。日付は ISO 文字列。
 * ここは pure / client-safe のみ（Prisma import 禁止）。
 */

export type ClosingStatus = "PENDING" | "PROCESSED" | "EXPORTED";
export type ClosingKind = "SCHEDULED" | "MANUAL";

/** 締日処理 1 行（一覧・詳細ヘッダ共通）。 */
export interface BillingClosing {
  /** uuid — URL id。 */
  id: string;
  customerBpId: string;
  customerName: string;
  /** 締日（ISO date）。 */
  closingDate: string;
  /** 実行区分（定期 / 手動）。一覧・詳細で「なぜこの行があるか」を示す。 */
  kind: ClosingKind;
  status: ClosingStatus;
  totalAmount: number | null;
  /** 生成した請求書番号 INV-YYYYMM-NNNNN（未生成は null）。 */
  invoiceNumber: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/** 詳細画面に出す期間内出荷 1 行。 */
export interface ClosingShipmentRow {
  /** 導出番号 DOR-YYYYMM-NNNNN。 */
  deliveryOrderNumber: string;
  shippedAt: string | null;
  quantity: number;
  amount: number;
}

export interface BillingClosingDetail extends BillingClosing {
  /** 請求期間の対象出荷（PENDING: 未請求候補 / PROCESSED: 請求書由来）。 */
  shipments: ClosingShipmentRow[];
  /**
   * 請求書の宛先（取引先マスタの請求先。顧客本人なら null）。
   * 「なぜこの請求書は別の会社宛なのか」を画面から読めるようにするため。
   */
  billingPartyName: string | null;
  /** 支払条件（取引先マスタ）— 支払期日の根拠として出す。 */
  paymentTermsDays: number | null;
  paymentDay: number | null;
  /** 支払期日（この締日で生成される請求書の期限。ISO date）。 */
  dueDate: string;
}

/** 暦日（UTC 起点の Date）→ "YYYY-MM-DD"。 */
function calendarIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 請求書を生成できるか — 未処理（PENDING）で、かつ**締日を過ぎている**こと。
 * `todayIso` は JST の暦日（"YYYY-MM-DD"）。
 *
 * 締日より前に処理すると、そこから締日までの出荷が窓 (前回締日, 今回締日] に
 * 入ったまま請求されず、翌月の窓は締日の翌日から始まるので**永久に未請求**に
 * なる。月初のオートランが当月の PENDING 行を作るので、「押せる」と「押して
 * よい」は別 — ここで閉じる。
 */
export function isProcessable(
  c: Pick<BillingClosing, "status" | "closingDate">,
  todayIso: string,
): boolean {
  return c.status === "PENDING" && closingDateReached(c.closingDate, todayIso);
}

/** 締日を過ぎたか（締日の翌日以降）。closingDate は "YYYY-MM-DD" か Date。 */
export function closingDateReached(
  closingDate: string | Date,
  todayIso: string,
): boolean {
  const iso =
    typeof closingDate === "string"
      ? closingDate.slice(0, 10)
      : calendarIso(closingDate);
  return todayIso > iso;
}

// ── 実行してよい指定日 / 試算 ───────────────────────────────────────────────

/**
 * 締日処理を**実行**してよい指定日か — 未来日は不可（今日まで）。
 *
 * 指定日は候補集め（collectClosingCandidatesUpTo）にしか効かず、請求書を作って
 * よいかは常に**実際の今日**で判定される（closingDateReached — lib/closing.ts と
 * lib/invoice-generation.ts の両方）。つまり 1 回の実行が 2 つの時計を見ている
 * ので、未来日で走らせると締日行だけができて請求書はできない半端な状態が残る。
 * しかも生成の見送りは黙った `continue` なので、画面には「作成 1 件」とだけ出て
 * 一覧は空になり、理由がどこにも出ない（実際にそうなった）。
 *
 * **作れない行は最初から作らせない**のがここ。未来の分を見たいだけなら
 * 試算（simulateClosing — 何も書かない）を使う。
 */
export function isRunnableClosingDate(
  dateIso: string,
  todayIso: string,
): boolean {
  return dateIso <= todayIso;
}

/** 試算 1 行 — 指定日に実行したら、この顧客のこの締日がどうなるか。 */
export interface ClosingSimulationRow {
  customerName: string;
  /** 締日（ISO）。 */
  closingDate: string;
  /** 対象になる出荷書番号（DOR-YYYYMM-NNNNN）。 */
  shipmentNumbers: string[];
  /** 対象出荷の合計金額（税抜）。 */
  totalAmount: number;
  /**
   * その実行で請求書（下書き）まで作られるか。**締日の翌日以降**に実行した
   * ときだけ true — 締日当日は false（closingDateReached と同じ規則なので、
   * 試算と実行がずれない）。
   */
  willGenerateInvoice: boolean;
}

/** 試算の結果（画面が出す形）。 */
export interface ClosingSimulation {
  /** 試算の基準日（"YYYY-MM-DD"）。 */
  targetDate: string;
  rows: ClosingSimulationRow[];
  /** 締日行の件数。 */
  closingCount: number;
  /** そのうち請求書まで作られる件数。 */
  invoiceCount: number;
  /** 対象出荷の合計金額（税抜）。 */
  totalAmount: number;
}

/**
 * 試算の候補（サーバーが集めたもの）→ 画面が出す形。純粋。
 *
 * 請求書ができるかの判定は**基準日 = 指定日**で行う（今日ではない）。
 * 「その日に実行したらどうなるか」を見せるのが試算なので、ここで今日を見ると
 * 未来日の試算が全部「未生成」になって何も分からなくなる。
 */
export function summarizeClosingSimulation(
  candidates: Omit<ClosingSimulationRow, "willGenerateInvoice">[],
  targetIso: string,
): ClosingSimulation {
  const rows = candidates
    .map((c) => ({
      ...c,
      willGenerateInvoice: closingDateReached(c.closingDate, targetIso),
    }))
    .sort(
      (a, b) =>
        a.closingDate.localeCompare(b.closingDate) ||
        a.customerName.localeCompare(b.customerName),
    );
  return {
    targetDate: targetIso,
    rows,
    closingCount: rows.length,
    invoiceCount: rows.filter((r) => r.willGenerateInvoice).length,
    totalAmount: rows.reduce((sum, r) => sum + r.totalAmount, 0),
  };
}

/**
 * 請求期間の始点 = **前回処理した締日の翌日**。無ければ顧客の締日設定から計算。
 *
 * 締日設定（closingDay）から前回締日を逆算していると、設定を変えた月に
 * 「旧締日の翌日〜新締日の前日」の出荷がどの窓にも入らない（20 日締 → 月末締に
 * 変えると 21 日〜前月末が落ちる）。実際に処理した行から引けば途切れない。
 */
export function billingPeriodStartFrom(
  closingDate: Date,
  closingDay: number | null | undefined,
  previousProcessedClosingDate: Date | null,
): Date {
  if (previousProcessedClosingDate)
    return addDays(previousProcessedClosingDate, 1);
  return billingPeriodStart(
    closingDate.getUTCFullYear(),
    closingDate.getUTCMonth() + 1,
    closingDay,
  );
}

// ── 対象月・締日の pure ヘルパー ─────────────────────────────────────────────
// 日付はすべて UTC 起点（DB の @db.Date と toISOString 表示に揃える）。

/**
 * "YYYY-MM-DD" → UTC 0時の Date。不正な形式・存在しない日付は null。
 * `runClosing` が受け取る実行日（既定 = 今日）の検証に使う。
 */
export function parseClosingDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // ロールオーバー（例: 2026-02-30）を弾く — UTC の年月日を作り直して照合する。
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** 対象月の月初（UTC 0時）。 */
export function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** 対象月の翌月初（UTC 0時）— 排他的上限。 */
export function nextMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1 + 1, 1));
}

/**
 * 顧客の締日設定 → 対象月の締日（UTC 0時）。
 * closingDay: 1–31。31 または未設定（null）は月末。月の日数を超える値も月末。
 */
export function closingDateFor(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(closingDay ?? 31, daysInMonth);
  return new Date(Date.UTC(year, month - 1, Math.max(day, 1)));
}

/** 日付に日数を加算（UTC）。支払期限 = 締日 + 支払サイト日数。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// ── 請求期間（前回締日, 今回締日] ───────────────────────────────────────────
//
// 顧客の請求期間は暦月ではなく **前回の締日の翌日 〜 今回の締日** で切る。
// 「月初〜締日」で切ると、締日より後の出荷はその月にも翌月（翌月も月初から
// 数える）にも入らず、どの締めにも拾われないまま請求されない。
//
// 締日は暦日（@db.Date = UTC 0 時の Date）で持つが、shipped_at は時刻を持つ
// タイムスタンプなので、境界は **JST の 0 時**（= UTC 前日 15:00）に置く。
// UTC 0 時で切ると JST 0〜9 時の出荷が前日の側に落ちる。

/** JST（UTC+9）— 帳票・締日の暦日を決める時計。 */
const JST_OFFSET_MS = 9 * 3_600_000;

/** 暦日（UTC 0 時の Date）→ その暦日の JST 0 時を表す瞬間。 */
export function jstMidnightOf(calendarDate: Date): Date {
  return new Date(calendarDate.getTime() - JST_OFFSET_MS);
}

/** 前月の締日（暦日）。1 月なら前年 12 月。月末指定（31/null）は前月の月末。 */
export function previousClosingDate(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return closingDateFor(prevYear, prevMonth, closingDay);
}

/** 請求期間の開始日（暦日）= 前回締日の翌日。invoices.billing_period_from。 */
export function billingPeriodStart(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): Date {
  return addDays(previousClosingDate(year, month, closingDay), 1);
}

export interface BillingWindow {
  /** 今回の締日（暦日）。 */
  closingDate: Date;
  /** shipped_at の下限（含む）= 前回締日の翌日 JST 0 時。 */
  gte: Date;
  /** shipped_at の上限（含まない）= 今回締日の翌日 JST 0 時。 */
  lt: Date;
}

/**
 * 顧客 × 対象月の請求期間 — shipped_at が [gte, lt) なら今回の締めに入る。
 * closingDay は顧客の締日設定（1–31、31/null = 月末）。
 */
export function billingWindowFor(
  year: number,
  month: number,
  closingDay: number | null | undefined,
): BillingWindow {
  const closingDate = closingDateFor(year, month, closingDay);
  return {
    closingDate,
    gte: jstMidnightOf(billingPeriodStart(year, month, closingDay)),
    lt: jstMidnightOf(addDays(closingDate, 1)),
  };
}

/** shipped_at が請求期間に入るか。 */
export function inBillingWindow(
  shippedAt: Date,
  window: Pick<BillingWindow, "gte" | "lt">,
): boolean {
  return shippedAt >= window.gte && shippedAt < window.lt;
}

/**
 * fromDate 以降・targetDate 以下の締日をすべて返す（暦日、UTC 0時）。
 *
 * 「指定日までに締日が到来した未処理をすべて」は 1 か月ぶんでは終わらない —
 * 締めを何か月も走らせていない顧客がいれば、その間の締日をひとつずつ数える
 * 必要がある（月をまたいでも取りこぼさないのがこの関数の存在理由）。
 * 旧 autorunTargetMonths（月初 3 日だけ前月も見る特例）はこの規則に置き換わり、
 * 走らせ忘れは「翌日以降の実行が拾う」で自然に解消するので不要になった。
 */
export function scheduledClosingDates(
  fromDate: Date,
  targetDate: Date,
  closingDay: number | null | undefined,
): Date[] {
  const dates: Date[] = [];
  let year = fromDate.getUTCFullYear();
  let month = fromDate.getUTCMonth() + 1;
  // 安全弁 — データ不整合（fromDate が異常に古い等）で無限ループしないよう
  // 100 年分（1200 か月）で必ず止める。通常は数か月分しか積まない。
  for (let i = 0; i < 1200; i++) {
    const d = closingDateFor(year, month, closingDay);
    if (d > targetDate) break;
    if (d >= fromDate) dates.push(d);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}
