/**
 * design-spec.ts — 版の仕様の検証と、製品ごとの仕様の解決。server-only.
 *
 * 仕様（材種・直径・全長・製品項目）は設計図の版 (design_versions) が持つ。
 * 製品 1 つにつき 1 つの値が要る読み手 — 指示書の素材候補・製品検索・外部 API・
 * 製品マスタの表示・分析ビュー — は、どの版を読むかを必ずここ
 * （→ lib/design-files-core.ts pickSpecVersion）で決める。読み手ごとに
 * 「最新の版」を書くと、下書きの仕様を拾う画面と拾わない画面ができる。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  type DesignExtract,
  enforceExtract,
  toDesignExtract,
} from "@/lib/design-extract-core";
import {
  type DesignVersionStatus,
  pickSpecVersion,
  TITLE_BLOCK_FIELDS,
  type TitleBlock,
  titleBlockJson,
  toTitleBlock,
} from "@/lib/design-files-core";
import {
  materialSpecErrors,
  specRecord,
  validateSpec,
} from "@/lib/design-spec-core";
import { type LocalizedText, localized } from "@/lib/format";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";

/** 版の仕様（画面・API から受ける形）。 */
export const versionSpecSchema = z.object({
  materialTypeId: z.number().int().positive().nullable(),
  diameterMm: z.number().nullable(),
  lengthMm: z.number().nullable(),
  spec: z.record(z.string(), z.string()).nullable(),
  titleBlock: z
    .object(
      Object.fromEntries(
        TITLE_BLOCK_FIELDS.map((f) => [f, z.string().max(500).optional()]),
      ) as Record<
        (typeof TITLE_BLOCK_FIELDS)[number],
        z.ZodOptional<z.ZodString>
      >,
    )
    .default({}),
  notes: z.string().max(2000).nullable(),
  /** 図面から読み取った値（形は toDesignExtract が正規化する）。 */
  extract: z.unknown().nullable().optional(),
});
export type VersionSpecInput = z.infer<typeof versionSpecSchema>;

/** 版の仕様として保存する列（検証済み）。 */
export interface VersionSpecColumns {
  materialTypeId: number | null;
  diameterMm: number | null;
  lengthMm: number | null;
  spec: Record<string, string> | null;
  titleBlock: Record<string, string> | null;
  notes: string | null;
  extract: DesignExtract | null;
}

/**
 * 受けた仕様を検証して列の形にする。画面の検証（design-spec-core）と同じ関数を
 * サーバーでも通す — UI のガードを飾りにしない。
 */
export async function validateVersionSpec(
  input: VersionSpecInput,
): Promise<
  { ok: true; data: VersionSpecColumns } | { ok: false; error: string }
> {
  const tr = await getTranslations();
  // 読み取り専用の欄（図面から読み、手入力にしていない欄）は図面の値に揃える —
  // 画面の外から別の値を送っても、手入力に切り替えていなければ通さない。
  // 検証は揃えたあとの値（= 実際に保存する値）に対して行う。
  const extract = toDesignExtract(input.extract ?? null);
  const enforced = enforceExtract(
    {
      diameterMm: input.diameterMm,
      lengthMm: input.lengthMm,
      spec:
        input.spec && Object.keys(input.spec).length > 0 ? input.spec : null,
      titleBlock: input.titleBlock as TitleBlock,
    },
    extract,
  );
  const errs = materialSpecErrors(
    { materialTypeId: input.materialTypeId, ...enforced },
    tr,
  );
  const first = errs.diameterMm ?? errs.lengthMm;
  if (first) return { ok: false, error: first };
  if (input.materialTypeId != null) {
    const mt = await prisma.materialType.findUnique({
      where: { id: input.materialTypeId },
      select: { id: true },
    });
    if (!mt) return { ok: false, error: tr("common.invalidInput") };
  }
  const [types, defs] = await Promise.all([
    getResolvedProductTypes(),
    getProductItemDefs(),
  ]);
  const specError = validateSpec(enforced.spec, types, defs, tr);
  if (specError) return { ok: false, error: specError };
  return {
    ok: true,
    data: {
      materialTypeId: input.materialTypeId,
      // 寸法は材種なしでも持てる（図面から読んだ寸法を捨てない —
      // design-spec-core materialSpecErrors）。
      diameterMm: enforced.diameterMm,
      lengthMm: enforced.lengthMm,
      spec: enforced.spec,
      titleBlock: titleBlockJson(enforced.titleBlock),
      notes: input.notes?.trim() || null,
      extract,
    },
  };
}

/** 製品ごとに解決した仕様（読み手が受け取る形）。 */
export interface ResolvedItemSpec {
  versionId: string;
  version: number;
  customerBpId: string | null;
  materialTypeId: number | null;
  materialTypeCode: string | null;
  materialTypeName: string | null;
  diameterMm: number | null;
  lengthMm: number | null;
  spec: Record<string, string>;
  titleBlock: TitleBlock;
  /** 図面から読み取った値（表示で「図面 / 手入力」の印を付ける）。 */
  extract: DesignExtract | null;
}

const SPEC_SELECT = {
  id: true,
  itemId: true,
  version: true,
  status: true,
  customerBpId: true,
  confirmedAt: true,
  materialTypeId: true,
  diameterMm: true,
  lengthMm: true,
  spec: true,
  titleBlock: true,
  extract: true,
  materialType: { select: { code: true, name: true } },
} as const;

type SpecRow = {
  id: string;
  itemId: number;
  version: number;
  status: string;
  customerBpId: string | null;
  confirmedAt: Date | null;
  materialTypeId: number | null;
  diameterMm: { toString(): string } | null;
  lengthMm: { toString(): string } | null;
  spec: unknown;
  titleBlock: unknown;
  extract: unknown;
  materialType: { code: string | null; name: unknown } | null;
};

function toResolved(v: SpecRow): ResolvedItemSpec {
  return {
    versionId: v.id,
    version: v.version,
    customerBpId: v.customerBpId,
    materialTypeId: v.materialTypeId,
    materialTypeCode: v.materialType?.code ?? null,
    materialTypeName: v.materialType
      ? localized(v.materialType.name as LocalizedText | null)
      : null,
    diameterMm: v.diameterMm != null ? Number(v.diameterMm.toString()) : null,
    lengthMm: v.lengthMm != null ? Number(v.lengthMm.toString()) : null,
    spec: specRecord(v.spec),
    titleBlock: toTitleBlock(v.titleBlock),
    extract: toDesignExtract(v.extract),
  };
}

function pick(rows: readonly SpecRow[], customerBpId: string | null) {
  return pickSpecVersion(
    rows.map((r) => ({ ...r, status: r.status as DesignVersionStatus })),
    customerBpId,
  );
}

/**
 * 製品の仕様を 1 つ解決する。
 *
 * `designFileId` を渡すと（指示書がピン留めした図面）、その版の仕様が勝つ —
 * 人が明示的に選んだ図面で作るのだから、仕様もその図面のもの。ピン留めが
 * 確定していない版を指していることは無い（ピン留めできるのは確定版だけ）。
 */
export async function resolveItemSpec(
  itemId: number,
  opts: { customerBpId?: string | null; designFileId?: string | null } = {},
): Promise<ResolvedItemSpec | null> {
  if (opts.designFileId) {
    const pinned = await prisma.designFile.findUnique({
      where: { id: opts.designFileId },
      select: { designVersion: { select: SPEC_SELECT } },
    });
    const v = pinned?.designVersion;
    if (v && v.itemId === itemId && v.status === "CONFIRMED") {
      return toResolved(v);
    }
  }
  const rows = await prisma.designVersion.findMany({
    where: { itemId, status: "CONFIRMED" },
    select: SPEC_SELECT,
  });
  const hit = pick(rows, opts.customerBpId ?? null);
  return hit ? toResolved(hit) : null;
}

/** 複数製品ぶんを 1 回で（一覧・検索・外部 API）。顧客は問わない（汎用優先）。 */
export async function resolveItemSpecs(
  itemIds: readonly number[],
): Promise<Map<number, ResolvedItemSpec>> {
  const out = new Map<number, ResolvedItemSpec>();
  if (itemIds.length === 0) return out;
  const rows = await prisma.designVersion.findMany({
    where: { itemId: { in: [...new Set(itemIds)] }, status: "CONFIRMED" },
    select: SPEC_SELECT,
  });
  const byItem = new Map<number, SpecRow[]>();
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? [];
    list.push(r);
    byItem.set(r.itemId, list);
  }
  for (const [id, list] of byItem) {
    const hit = pick(list, null);
    if (hit) out.set(id, toResolved(hit));
  }
  return out;
}

/**
 * 材種の検索語に当たる製品の id（F4 の材種絞り込み）。確定済みの版のどれかが
 * その材種を要求していれば当たりにする — 汎用だけに絞ると顧客専用の図面しか
 * 無い製品が検索から消える。
 */
export async function itemIdsByMaterialTypeCode(
  code: string,
  take: number,
): Promise<number[]> {
  const rows = await prisma.designVersion.findMany({
    where: {
      status: "CONFIRMED",
      materialType: { code: { contains: code, mode: "insensitive" } },
    },
    select: { itemId: true },
    distinct: ["itemId"],
    take,
  });
  return rows.map((r) => r.itemId);
}
