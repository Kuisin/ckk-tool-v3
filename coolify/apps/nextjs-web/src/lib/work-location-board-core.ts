/**
 * work-location-board-core.ts — 作業場所一覧（PD09）の並べ方。純ロジック。
 *
 * 共有端末の /work-location（1 か所の機械の前で「ここに待っている仕事」）を、
 * 事務所から**全部の作業場所を一度に**見るための並べ替え。行の拾い方は
 * データ層（app/(dashboard)/production/work-location-board/data.ts）が持ち、
 * ここは 作業場所ごとに束ねて、束と行の順番を決めるだけ。
 *
 * - 束の順 = 作業場所グループの並び順 → 作業場所の並び順 → コード。
 *   作業場所の無い行（社外工程・作業場所マスタ未設定の環境）は最後に 1 束。
 * - 行の順 = 計画の開始時刻（無いものは後ろ）→ 指示書番号 → 工程の並び順。
 */

/** なぜその行がその日の一覧に出ているか。 */
export type BoardRowReason =
  /** その日の計画。 */
  | "PLANNED"
  /** 前日以前の計画で、まだ終わっていない（今日を見ているときだけ）。 */
  | "CARRIED_OVER"
  /** その場所で実績を記録した進行中の工程（今日を見ているときだけ）。 */
  | "WORKING";

export interface BoardRow {
  /** 行の一意キー（計画 id / 実績由来は `w:<工程 id>:<場所 id>`）。 */
  key: string;
  stepId: string;
  workOrderNumber: number;
  docNumber: string;
  productName: string;
  stepName: string;
  stepSortOrder: number;
  stepStatus: string;
  reason: BoardRowReason;
  /** 計画日（YYYY-MM-DD）。実績由来は null。 */
  plannedDate: string | null;
  /** 計画の開始・終了（ISO）。時刻の無い計画は null。 */
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  assigneeName: string | null;
  /** 工程納期（YYYY-MM-DD）。 */
  dueDate: string | null;
  locationId: number | null;
}

export interface BoardLocation {
  id: number;
  code: string;
  name: string;
  groupName: string;
  groupSortOrder: number;
  sortOrder: number;
}

export interface BoardGroup {
  /** null = 作業場所なし。 */
  location: BoardLocation | null;
  rows: BoardRow[];
}

function compareRows(a: BoardRow, b: BoardRow): number {
  if (a.plannedStartAt !== b.plannedStartAt) {
    if (a.plannedStartAt == null) return 1;
    if (b.plannedStartAt == null) return -1;
    return a.plannedStartAt < b.plannedStartAt ? -1 : 1;
  }
  if (a.workOrderNumber !== b.workOrderNumber) {
    return a.workOrderNumber - b.workOrderNumber;
  }
  return a.stepSortOrder - b.stepSortOrder;
}

function compareLocations(a: BoardLocation, b: BoardLocation): number {
  return (
    a.groupSortOrder - b.groupSortOrder ||
    a.sortOrder - b.sortOrder ||
    a.code.localeCompare(b.code)
  );
}

/** 行を作業場所ごとに束ねる。行の無い作業場所は出さない。 */
export function groupBoardRows(
  rows: readonly BoardRow[],
  locations: readonly BoardLocation[],
): BoardGroup[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const buckets = new Map<number | null, BoardRow[]>();
  for (const r of rows) {
    // マスタから消えた（または無効な）場所の行は「作業場所なし」に寄せる —
    // 黙って捨てると、仕事が一覧から消える。
    const id =
      r.locationId != null && byId.has(r.locationId) ? r.locationId : null;
    const list = buckets.get(id) ?? [];
    list.push(r);
    buckets.set(id, list);
  }
  const groups: BoardGroup[] = [];
  const located = [...buckets.keys()]
    .filter((id): id is number => id != null)
    .map((id) => byId.get(id) as BoardLocation)
    .sort(compareLocations);
  for (const loc of located) {
    groups.push({
      location: loc,
      rows: [...(buckets.get(loc.id) ?? [])].sort(compareRows),
    });
  }
  const none = buckets.get(null);
  if (none) groups.push({ location: null, rows: [...none].sort(compareRows) });
  return groups;
}

/** YYYY-MM-DD として正しい日付か（URL の ?date= の検証）。 */
export function parseBoardDate(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === raw ? raw : null;
}
