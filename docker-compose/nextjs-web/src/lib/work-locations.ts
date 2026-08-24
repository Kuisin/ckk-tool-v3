import "server-only";

/**
 * work-locations.ts — 作業場所マスタ (MS0D) の server ヘルパ。
 *
 * 場所の**種別**（machine / area …）は管理者定義 — `app.system_settings` の
 * `work_location.types`（lib/app-config.ts の generic KV）に保持し、スキーマ
 * 変更なしで追加できる（trial_pricing.tool_types と同じ方式）。組み込みの
 * machine / area は削除不可。グループ・場所本体は work_location_groups /
 * work_locations テーブル（capacity = 同時に割り当て可能な作業数）。
 */

import { readConfigNamespace, writeConfigValues } from "./app-config";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";

const NS = "work_location";
const TYPES_KEY = `${NS}.types`;

export interface WorkLocationType {
  key: string;
  label: { ja: string; en: string };
  /** 組み込み種別（削除不可）。 */
  builtin?: boolean;
}

export const BUILTIN_TYPES: WorkLocationType[] = [
  { key: "machine", label: { ja: "機械", en: "Machine" }, builtin: true },
  { key: "area", label: { ja: "エリア", en: "Area" }, builtin: true },
];

function parseTypes(raw: unknown): WorkLocationType[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkLocationType[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { key, label } = entry as { key?: unknown; label?: unknown };
    if (typeof key !== "string" || key === "") continue;
    const l = (label ?? {}) as Record<string, unknown>;
    out.push({
      key,
      label: {
        ja: typeof l.ja === "string" ? l.ja : key,
        en: typeof l.en === "string" ? l.en : "",
      },
    });
  }
  return out;
}

/** 種別一覧 — 組み込み + 管理者定義（key 重複は組み込み優先）。 */
export async function readWorkLocationTypes(): Promise<WorkLocationType[]> {
  const config = await readConfigNamespace(NS);
  const custom = parseTypes(config.get(TYPES_KEY)).filter(
    (t) => !BUILTIN_TYPES.some((b) => b.key === t.key),
  );
  return [...BUILTIN_TYPES, ...custom];
}

/** 管理者定義種別の保存（組み込みは保存しない）。 */
export async function writeWorkLocationTypes(
  types: WorkLocationType[],
): Promise<void> {
  const custom = types
    .filter((t) => !BUILTIN_TYPES.some((b) => b.key === t.key))
    .map((t) => ({ key: t.key, label: t.label }));
  await writeConfigValues({ [TYPES_KEY]: custom });
}

/** 種別キー → 表示ラベル（未知キーはそのまま返す）。 */
export function typeLabelOf(
  types: readonly WorkLocationType[],
  key: string,
): string {
  return types.find((t) => t.key === key)?.label.ja ?? key;
}

/** 作業計画の 作業場所 Select 用（有効のみ、「グループ / 場所」ラベル）。 */
export async function fetchWorkLocationOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.workLocation.findMany({
    where: { isActive: true, group: { isActive: true } },
    include: { group: { select: { name: true, sortOrder: true } } },
    orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${localized(r.group.name as LocalizedText | null)} / ${localized(r.name as LocalizedText | null)}`,
  }));
}

/**
 * 拠点付きの作業場所 Select 用（SY09 端末の既定作業場所など）。
 * plantId はグループの拠点（null = 拠点指定なし — どの拠点でも選択可）。
 */
export async function fetchWorkLocationOptionsWithPlant(): Promise<
  { value: string; label: string; plantId: number | null }[]
> {
  const rows = await prisma.workLocation.findMany({
    where: { isActive: true, group: { isActive: true } },
    include: { group: { select: { name: true, plantId: true } } },
    orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${localized(r.group.name as LocalizedText | null)} / ${localized(r.name as LocalizedText | null)}`,
    plantId: r.group.plantId,
  }));
}

/**
 * 工程マスタの許可作業場所を id 集合へ解決する。
 * リンク行（process_step_work_locations）が無い工程は **null = 無制限**。
 * 種別リンクは「そのグループ種別に属する全場所」、個別リンクはその場所。
 * 計画・実績の両方の検証と選択肢の絞り込みに使う（キオスク側の同等品は
 * nextjs-kiosk lib/step-execution.ts allowedWorkLocationIdsForStep）。
 */
export async function fetchAllowedWorkLocationIds(
  processStepId: number,
): Promise<Set<number> | null> {
  const links = await prisma.processStepWorkLocation.findMany({
    where: { processStepId },
    select: { typeKey: true, workLocationId: true },
  });
  if (links.length === 0) return null;
  const ids = new Set<number>();
  const typeKeys = links
    .map((l) => l.typeKey)
    .filter((k): k is string => k != null);
  for (const l of links) {
    if (l.workLocationId != null) ids.add(l.workLocationId);
  }
  if (typeKeys.length > 0) {
    const byType = await prisma.workLocation.findMany({
      where: { group: { typeKey: { in: typeKeys } } },
      select: { id: true },
    });
    for (const l of byType) ids.add(l.id);
  }
  return ids;
}
