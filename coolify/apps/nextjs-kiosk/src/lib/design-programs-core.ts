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
 *   - プログラムは**機種**（machine_models）を 0..N 持つ。0 = 機種を問わない。
 *     機械（= 作業場所 work_locations）は機種を 0..1 持ち、「この機種用」は
 *     工程の計画・実績（共有端末では端末の既定も）の作業場所の機種と、
 *     プログラムの機種が 1 つでも重なること。
 *   - DB の 1 行 = プログラムの 1 版。programKey が版をまたいだ同一性で、
 *     新しい作業に出すのは現行版（supersededAt = null）のうち廃止していないもの。
 *     **開始済みの工程は、開始したときに記録した版**（work_order_step_programs）
 *     を出す — あとで版が上がっても、その工程が何で始めたかは変わらない。
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
  /** 対象の機種（machine_models.id）。空 = 機種を問わない。 */
  machineModelIds: readonly number[];
  /** 受け持つ工程（工程マスタ id）。 */
  processStepIds: readonly number[];
}

export type ProgramForStep<T extends ProgramLike> = T & {
  /** 計画・実績の機械（作業場所）の機種と一致したか。 */
  modelMatch: boolean;
};

/** 並べ方: 機種一致が先頭、その中・外は版での並び（sortOrder → 名前）。 */
function sortForStep<T extends ProgramLike>(
  rows: ProgramForStep<T>[],
): ProgramForStep<T>[] {
  return rows.sort(
    (a, b) =>
      Number(b.modelMatch) - Number(a.modelMatch) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "ja"),
  );
}

function withMatch<T extends ProgramLike>(
  p: T,
  models: ReadonlySet<number>,
): ProgramForStep<T> {
  return {
    ...p,
    modelMatch: p.machineModelIds.some((id) => models.has(id)),
  };
}

function modelSet(
  machineModelIds: readonly (number | null | undefined)[],
): Set<number> {
  return new Set(machineModelIds.filter((id): id is number => id != null));
}

/**
 * この工程で使うプログラムを選んで並べる。
 *
 * - 工程マスタ id がプログラムの受け持ち工程に入っているものだけ。
 * - その工程の計画・実績の機械の**機種**と一致するものが**先頭**。
 *   一致の中・不一致の中は版での並び（sortOrder → 名前）を保つ。
 *   機種を問わない（機種が空）ものは一致扱いにしない —
 *   「この機種向けに書いた」ものを先に見せるための並びなので。
 */
export function programsForStep<T extends ProgramLike>(
  programs: readonly T[],
  processStepId: number,
  machineModelIds: readonly (number | null | undefined)[],
): ProgramForStep<T>[] {
  const models = modelSet(machineModelIds);
  return sortForStep(
    programs
      .filter((p) => p.processStepIds.includes(processStepId))
      .map((p) => withMatch(p, models)),
  );
}

/** 版の情報（DB の 1 行 = 1 版）。 */
export interface ProgramRevisionLike {
  programKey: string;
  revision: number;
  /** 次の版ができた時刻。null = 現行版。 */
  supersededAt: Date | string | null;
  /** 廃止した時刻（現行版に立つ）。 */
  retiredAt: Date | string | null;
}

/**
 * 新しい作業に出す版 — プログラムごとの現行版のうち、廃止していないもの。
 * 現行版の印（supersededAt = null）が万一 2 行に立っていても、版番号の
 * 大きいほうを 1 本だけ出す（同じプログラムを 2 回並べない）。
 */
export function currentPrograms<T extends ProgramRevisionLike>(
  rows: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    if (r.supersededAt != null) continue;
    const prev = byKey.get(r.programKey);
    if (!prev || r.revision > prev.revision) byKey.set(r.programKey, r);
  }
  return [...byKey.values()].filter((r) => r.retiredAt == null);
}

/**
 * 工程実行画面に出すプログラム。
 *
 * - **開始済みで、開始時の記録があれば記録した版**（いまの現行版ではない）。
 *   記録は開始の時点で「この工程に出ていた版」なので、工程での絞り込みは
 *   済んでいる（並べ方だけ揃える）。
 * - 未開始、または記録の無い工程（この仕組みより前に始めた工程・開始時に
 *   1 本も無かった工程）は、現行版から programsForStep で選ぶ。
 */
export function programsShownForStep<
  T extends ProgramLike & ProgramRevisionLike,
>(
  input: {
    started: boolean;
    recorded: readonly T[];
    candidates: readonly T[];
  },
  processStepId: number,
  machineModelIds: readonly (number | null | undefined)[],
): { programs: ProgramForStep<T>[]; fromRecord: boolean } {
  if (input.started && input.recorded.length > 0) {
    const models = modelSet(machineModelIds);
    return {
      programs: sortForStep(input.recorded.map((p) => withMatch(p, models))),
      fromRecord: true,
    };
  }
  return {
    programs: programsForStep(
      currentPrograms(input.candidates),
      processStepId,
      machineModelIds,
    ),
    fromRecord: false,
  };
}
