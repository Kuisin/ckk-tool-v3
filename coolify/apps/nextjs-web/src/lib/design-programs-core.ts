/**
 * design-programs-core.ts — 加工プログラム（設計図の版ごと）の選び方。純関数。
 *
 * **twin file** — nextjs-kiosk/src/lib/design-programs-core.ts は逐語コピー
 * （`pnpm twin:sync`）。工程実行画面は Web と共有端末の両方にあり、どちらも
 * 「この工程で使うプログラムはどれか・どれを先に出すか」を同じ規則で
 * 決めなければならない（片方だけ直ると、同じ工程で現場が見るプログラムが
 * 画面によって違う）。DB を読む部分は各アプリが持ち、ここは判断だけ。
 *
 * 前提:
 *   - 1 本のプログラムは N 工程（工程マスタ process_step_catalog.id）を受け持つ。
 *   - 機械のマスタは無い。**作業場所 (work_locations) が機械そのもの**で、
 *     プログラムの workLocationId は「この機械向け」の印。
 */

/** 指示書が見る図面の版を決めるための、版 1 つ分。 */
export interface ProgramVersionLike {
  id: string;
  /** null = 汎用の系列。 */
  customerBpId: string | null;
  version: number;
  status: string;
}

/**
 * 指示書の顧客を 1 人に決める（注文明細の注文請書の顧客）。
 *
 * 複数の注文明細を束ねた指示書は顧客が 1 人に定まらないことがある。
 * **定まるときだけ**その顧客、混在・無しは null（= 汎用の系列を見る）。
 * 指示書詳細が図面を引くときと同じ規則。
 */
export function workOrderDesignCustomer(
  customers: readonly (string | null | undefined)[],
): string | null {
  const set = new Set(customers.filter((c): c is string => c != null));
  return set.size === 1 ? [...set][0] : null;
}

/**
 * 指示書が使う図面の版（加工プログラムを引く版）。
 *
 * 1. 指示書が図面をピン留めしていれば、その図面の版（人が選んだものが勝つ）。
 * 2. そうでなければ確定済みの版から、顧客一致の系列の最新 → 汎用の最新。
 *    **他の顧客の系列へは落ちない**（lib/design-files-core resolveSeriesCustomer
 *    と同じ規約 — B の指示書に A のプログラムを黙って出さない）。
 * 見つからなければ null。
 */
export function pickWorkOrderDesignVersion<T extends ProgramVersionLike>(
  versions: readonly T[],
  opts: { pinnedVersionId?: string | null; customerBpId?: string | null },
): T | null {
  if (opts.pinnedVersionId) {
    const pinned = versions.find((v) => v.id === opts.pinnedVersionId);
    if (pinned) return pinned;
  }
  const confirmed = versions.filter((v) => v.status === "CONFIRMED");
  const latestOf = (series: string | null) =>
    confirmed
      .filter((v) => (v.customerBpId ?? null) === series)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  const customer = opts.customerBpId ?? null;
  if (customer != null) {
    const hit = latestOf(customer);
    if (hit) return hit;
  }
  return latestOf(null);
}

/** プログラム 1 本（工程実行画面が並べる分）。 */
export interface ProgramLike {
  id: string;
  name: string;
  sortOrder: number;
  workLocationId: number | null;
  /** 受け持つ工程（工程マスタ id）。 */
  processStepIds: readonly number[];
}

export type ProgramForStep<T extends ProgramLike> = T & {
  /** 計画・実績の作業場所（= 機械）と一致したか。 */
  machineMatch: boolean;
};

/**
 * この工程で使うプログラムを選んで並べる。
 *
 * - 工程マスタ id がプログラムの受け持ち工程に入っているものだけ。
 * - その工程の計画・実績の作業場所（= 機械）と一致するものが**先頭**。
 *   一致の中・不一致の中は版での並び（sortOrder → 名前）を保つ。
 *   機械を問わない（workLocationId = null）ものは一致扱いにしない —
 *   「この機械向けに書いた」ものを先に見せるための並びなので。
 */
export function programsForStep<T extends ProgramLike>(
  programs: readonly T[],
  processStepId: number,
  workLocationIds: readonly (number | null | undefined)[],
): ProgramForStep<T>[] {
  const machines = new Set(
    workLocationIds.filter((id): id is number => id != null),
  );
  return programs
    .filter((p) => p.processStepIds.includes(processStepId))
    .map((p) => ({
      ...p,
      machineMatch: p.workLocationId != null && machines.has(p.workLocationId),
    }))
    .sort(
      (a, b) =>
        Number(b.machineMatch) - Number(a.machineMatch) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "ja"),
    );
}
