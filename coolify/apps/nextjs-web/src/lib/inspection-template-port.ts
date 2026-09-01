import "server-only";

/**
 * inspection-template-port.ts — 検査表テンプレート (MS09) の書き出し / 取込（DB 側）。
 *
 * 形の定義と Excel の読み替えは lib/inspection-template-io.ts（純粋・試験あり）。
 * こちらは **DB と権限と監査**だけを持つ。
 *
 * ## 取込の決め事
 *
 * - **同じコードがあれば新しいバージョンを足す。** 既存の版を書き換えない —
 *   検査記録は使った版の行を指しているので、上書きすると過去の記録の意味が
 *   後から変わってしまう（MS09 のバージョン管理の考え方そのまま）。
 * - 工程は**コードで引く**。見つからなければ「その工程が無い」と言って、
 *   その検査表だけ取り込まない（黙って関連工程なしで作らない — 現場では
 *   どの工程の検査表か分からないものが増えるほうが困る）。
 * - **1 枚ずつ独立して処理する。** 5 枚のうち 1 枚が駄目でも、残り 4 枚は入る。
 *   全部を巻き戻すと、直す対象が分からないまま最初からやり直しになる。
 */

import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ImportRowError,
  PORTABLE_KIND,
  PORTABLE_VERSION,
  type PortableFile,
  type PortableItem,
  type PortableTemplate,
} from "@/lib/inspection-template-io";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

/** 書き出し（指定が空なら有効なもの全部）。 */
export async function exportTemplates(
  ids: number[],
): Promise<ActionResult<PortableFile>> {
  const authz = await checkPermission("master", "READ");
  if (!authz.ok) return actionError(authz.error);

  const rows = await prisma.inspectionTemplate.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : { isActive: true },
    orderBy: [{ code: "asc" }, { version: "asc" }],
    include: {
      relatedProcessStep: { select: { code: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (rows.length === 0) {
    return actionError("書き出す検査表がありません");
  }

  return actionOk({
    kind: PORTABLE_KIND,
    version: PORTABLE_VERSION,
    exportedAt: new Date().toISOString(),
    templates: rows.map((t) => ({
      code: t.code,
      name: t.name as PortableTemplate["name"],
      // **id ではなくコード**で持つ（環境をまたぐと id は別物を指す）
      relatedProcessStepCode: t.relatedProcessStep?.code ?? null,
      samplingMode: t.samplingMode as PortableTemplate["samplingMode"],
      samplingValue: t.samplingValue ? Number(t.samplingValue) : null,
      recordStyle: t.recordStyle as PortableTemplate["recordStyle"],
      layoutStyle: t.layoutStyle as PortableTemplate["layoutStyle"],
      sampleNaming: t.sampleNaming as PortableTemplate["sampleNaming"],
      isActive: t.isActive,
      items: t.items.map((i) => ({
        itemName: i.itemName as PortableTemplate["items"][number]["itemName"],
        inputType: i.inputType as PortableItem["inputType"],
        unit: i.unit,
        toleranceMin: i.toleranceMin ? Number(i.toleranceMin) : null,
        toleranceMax: i.toleranceMax ? Number(i.toleranceMax) : null,
        options: (i.options ?? null) as never,
        acceptBool: i.acceptBool,
        acceptOptions: (i.acceptOptions ?? null) as never,
        goalValue: i.goalValue ?? null,
        allowManualOverride: i.allowManualOverride,
        isRequired: i.isRequired,
        section: i.section as PortableItem["section"],
        department: i.department as PortableItem["department"],
        measurementEquipment: i.measurementEquipment,
        nominalValue: i.nominalValue ? Number(i.nominalValue) : null,
        toleranceTopDelta: i.toleranceTopDelta
          ? Number(i.toleranceTopDelta)
          : null,
        toleranceBottomDelta: i.toleranceBottomDelta
          ? Number(i.toleranceBottomDelta)
          : null,
      })),
    })),
  });
}

export interface ImportOutcome {
  /** 新しく作った検査表（コードと版）。 */
  created: Array<{ code: string; version: number; items: number }>;
  /** 取り込めなかったもの。**理由を必ず添える**。 */
  skipped: Array<{ code: string; reason: string }>;
  /** Excel の行単位の読み取り失敗（JSON 取込では空）。 */
  rowErrors: ImportRowError[];
}

/** 取込。1 枚ずつ独立して処理し、結果をまとめて返す。 */
export async function importTemplates(
  templates: PortableTemplate[],
  rowErrors: ImportRowError[] = [],
): Promise<ActionResult<ImportOutcome>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);

  const outcome: ImportOutcome = { created: [], skipped: [], rowErrors };

  for (const t of templates) {
    try {
      // 工程はコードで引く。無ければこの 1 枚を飛ばす。
      let relatedProcessStepId: number | null = null;
      if (t.relatedProcessStepCode) {
        const step = await prisma.processStepCatalog.findUnique({
          where: { code: t.relatedProcessStepCode },
          select: { id: true },
        });
        if (!step) {
          outcome.skipped.push({
            code: t.code,
            reason: `関連工程「${t.relatedProcessStepCode}」が見つかりません`,
          });
          continue;
        }
        relatedProcessStepId = step.id;
      }

      // 同じコードがあれば次の版として足す（既存の版は書き換えない）
      const latest = await prisma.inspectionTemplate.findFirst({
        where: { code: t.code },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      const created = await prisma.inspectionTemplate.create({
        data: {
          code: t.code,
          version,
          name: t.name,
          relatedProcessStepId,
          samplingMode: t.samplingMode as PortableTemplate["samplingMode"],
          samplingValue: t.samplingMode === "ALL" ? null : t.samplingValue,
          recordStyle: t.recordStyle as PortableTemplate["recordStyle"],
          isActive: t.isActive,
          items: {
            create: t.items.map((item, index) => ({
              itemName: item.itemName,
              inputType: item.inputType,
              unit: item.unit,
              toleranceMin: item.toleranceMin,
              toleranceMax: item.toleranceMax,
              options: item.options ?? undefined,
              acceptBool: item.acceptBool,
              acceptOptions: item.acceptOptions ?? undefined,
              goalValue: (item.goalValue ?? undefined) as never,
              allowManualOverride: item.allowManualOverride,
              isRequired: item.isRequired,
              section: item.section,
              department: item.department,
              measurementEquipment: item.measurementEquipment,
              nominalValue: item.nominalValue,
              toleranceTopDelta: item.toleranceTopDelta,
              toleranceBottomDelta: item.toleranceBottomDelta,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      });

      await recordAudit({
        action: "CREATE",
        tableName: "inspection_templates",
        recordId: String(created.id),
        after: {
          note: `取込で作成: ${t.code} v${version}（項目 ${t.items.length} 件）`,
          code: t.code,
          version,
        },
      });
      outcome.created.push({
        code: t.code,
        version,
        items: t.items.length,
      });
    } catch (e) {
      outcome.skipped.push({
        code: t.code,
        reason: e instanceof Error ? e.message : "取込に失敗しました",
      });
    }
  }

  return actionOk(outcome);
}
