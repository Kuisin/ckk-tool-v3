/**
 * design-programs.ts — 加工プログラム（設計図の版ごと）の読み書き。server-only.
 *
 * - 図面の版 (design_versions) に N 本。1 本が N 工程（工程マスタ）を受け持ち、
 *   0..N 機種（machine_models — 作業場所 MS0D の中のマスタ）を対象にする。
 * - DB の 1 行 = プログラムの 1 版（program_key で同一性、revision で版番号）。
 * - **工程を開始したときに出ていた版を記録する**（work_order_step_programs —
 *   recordStepProgramsTx）。記録のある版は使用済みで、その場では書き換えない。
 * - 変更はすべて申請（design_program_changes）を通す。規則は
 *   lib/design-program-changes-core.ts、承認は承認設定（MS0B）の
 *   「加工プログラムの変更」— 段が無ければ申請と同時に当たる。
 * - 図面の版の確定とは独立（確定後も足し・直しができる）。
 * - 工程実行画面が「この工程で使うプログラム」を引く口もここ
 *   （選び方・並べ方は lib/design-programs-core.ts — 共有端末と双子）。
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { approvalNeed, startApprovalFlow } from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { type Prisma, prisma } from "@/lib/db";
import { storeOne, type UploadedFile } from "@/lib/design-files";
import {
  allowedProgramActions,
  changeHasContent,
  type ProgramActions,
  type ProgramChangeKind,
  type ProgramContent,
  type ProgramPremiseIssue,
  type ProgramRevisionState,
  parseProgramContent,
  programChangePremise,
  resolveContentFile,
} from "@/lib/design-program-changes-core";
import {
  currentPrograms,
  pickWorkOrderDesignVersion,
  programsForStep,
  programsShownForStep,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { type LocalizedText, localized } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import { deleteObject } from "@/lib/storage";

const TARGET_TYPE = "design_program_changes" as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** 名前付きの参照（機種・工程）。 */
export interface NamedRef {
  id: number;
  name: string;
}

/** プログラムの 1 版（画面へ渡す分）。 */
export interface ProgramRevisionView {
  id: string;
  programKey: string;
  revision: number;
  name: string;
  programNumber: string | null;
  fileId: string | null;
  filename: string | null;
  machineModels: NamedRef[];
  notes: string | null;
  sortOrder: number;
  processSteps: NamedRef[];
  supersededAt: string | null;
  retiredAt: string | null;
  /** この版で開始した工程の数（> 0 = 使用済み）。 */
  useCount: number;
}

/** 申請 1 件（承認カード・プログラムの印に出す分）。 */
export interface ProgramChangeView {
  id: string;
  kind: ProgramChangeKind;
  status: string;
  error: string | null;
  note: string | null;
  /** 基にした版（ADD は null）。 */
  programId: string | null;
  baseName: string | null;
  baseRevision: number | null;
  content: {
    name: string;
    programNumber: string | null;
    machineModels: NamedRef[];
    processSteps: NamedRef[];
    notes: string | null;
    file: "keep" | "remove" | "new";
    newFilename: string | null;
  } | null;
  requestedByName: string | null;
  requestedAt: string;
}

/** 図面の版の画面に出すプログラム 1 本（現行版 + 過去の版）。 */
export interface DesignProgramView extends ProgramRevisionView {
  used: boolean;
  keyUsed: boolean;
  /** 古い版（新しい順）。読むだけ。 */
  history: ProgramRevisionView[];
  /** 保留中の申請（あれば）。 */
  pending: ProgramChangeView | null;
  /** 出せる申請（権限は別 — 画面側で design_file:UPDATE と合わせる）。 */
  actions: ProgramActions;
}

export interface DesignProgramsData {
  programs: DesignProgramView[];
  /** 保留中の追加申請（まだプログラムの行が無い）。 */
  pendingAdds: ProgramChangeView[];
  /** 直近の当たらなかった申請（理由を見せる）。 */
  failed: ProgramChangeView[];
}

/** 工程実行画面の 1 本（機種一致の印つき）。 */
export interface StepProgramView extends ProgramRevisionView {
  modelMatch: boolean;
}

/** 工程実行画面が受け取るまとめ。 */
export interface StepProgramsView {
  /** プログラムを引いた版（無ければ null — 図面が無い / 確定版が無い）。 */
  version: { id: string; version: number; itemId: number } | null;
  programs: StepProgramView[];
  /** true = 開始時に記録した版を出している。 */
  fromRecord: boolean;
}

const PROGRAM_SELECT = {
  id: true,
  designVersionId: true,
  programKey: true,
  revision: true,
  name: true,
  programNumber: true,
  fileId: true,
  notes: true,
  sortOrder: true,
  supersededAt: true,
  retiredAt: true,
  file: { select: { filename: true } },
  machineModels: {
    select: { machineModel: { select: { id: true, name: true } } },
  },
  steps: {
    select: {
      processStepId: true,
      processStep: { select: { name: true, sortOrder: true } },
    },
  },
  _count: { select: { stepUses: true } },
} as const satisfies Prisma.DesignProgramSelect;

type ProgramRow = Prisma.DesignProgramGetPayload<{
  select: typeof PROGRAM_SELECT;
}>;

function toView(r: ProgramRow): ProgramRevisionView {
  return {
    id: r.id,
    programKey: r.programKey,
    revision: r.revision,
    name: r.name,
    programNumber: r.programNumber,
    fileId: r.fileId,
    filename: r.file?.filename ?? null,
    machineModels: r.machineModels
      .map((m) => ({
        id: m.machineModel.id,
        name: localized(m.machineModel.name as LocalizedText | null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    notes: r.notes,
    sortOrder: r.sortOrder,
    processSteps: [...r.steps]
      .sort((a, b) => a.processStep.sortOrder - b.processStep.sortOrder)
      .map((s) => ({
        id: s.processStepId,
        name: localized(s.processStep.name as LocalizedText | null),
      })),
    supersededAt: r.supersededAt?.toISOString() ?? null,
    retiredAt: r.retiredAt?.toISOString() ?? null,
    useCount: r._count.stepUses,
  };
}

const CHANGE_SELECT = {
  id: true,
  kind: true,
  status: true,
  error: true,
  note: true,
  programId: true,
  payload: true,
  requestedAt: true,
  newFile: { select: { filename: true } },
  program: { select: { name: true, revision: true } },
  requestedByUser: { select: { displayName: true } },
} as const satisfies Prisma.DesignProgramChangeSelect;

type ChangeRow = Prisma.DesignProgramChangeGetPayload<{
  select: typeof CHANGE_SELECT;
}>;

async function nameMaps(rows: ChangeRow[]): Promise<{
  models: Map<number, string>;
  steps: Map<number, string>;
}> {
  const modelIds = new Set<number>();
  const stepIds = new Set<number>();
  for (const r of rows) {
    const c = parseProgramContent(r.payload);
    for (const id of c?.machineModelIds ?? []) modelIds.add(id);
    for (const id of c?.processStepIds ?? []) stepIds.add(id);
  }
  const [models, steps] = await Promise.all([
    modelIds.size
      ? prisma.machineModel.findMany({
          where: { id: { in: [...modelIds] } },
          select: { id: true, name: true },
        })
      : [],
    stepIds.size
      ? prisma.processStepCatalog.findMany({
          where: { id: { in: [...stepIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  return {
    models: new Map(
      models.map((m) => [m.id, localized(m.name as LocalizedText | null)]),
    ),
    steps: new Map(
      steps.map((s) => [s.id, localized(s.name as LocalizedText | null)]),
    ),
  };
}

function toChangeView(
  r: ChangeRow,
  names: { models: Map<number, string>; steps: Map<number, string> },
): ProgramChangeView {
  const c = parseProgramContent(r.payload);
  const ref = (map: Map<number, string>) => (id: number) => ({
    id,
    name: map.get(id) ?? `#${id}`,
  });
  return {
    id: r.id,
    kind: r.kind as ProgramChangeKind,
    status: r.status,
    error: r.error,
    note: r.note,
    programId: r.programId,
    baseName: r.program?.name ?? null,
    baseRevision: r.program?.revision ?? null,
    content: c
      ? {
          name: c.name,
          programNumber: c.programNumber ?? null,
          machineModels: c.machineModelIds.map(ref(names.models)),
          processSteps: c.processStepIds.map(ref(names.steps)),
          notes: c.notes ?? null,
          file: c.file,
          newFilename: r.newFile?.filename ?? null,
        }
      : null,
    requestedByName: r.requestedByUser?.displayName ?? null,
    requestedAt: r.requestedAt.toISOString(),
  };
}

/** 申請 1 件を画面の形で（承認の中継ページ・通知用）。 */
export async function fetchProgramChange(
  changeId: string,
): Promise<(ProgramChangeView & { designVersionId: string }) | null> {
  const r = await prisma.designProgramChange.findUnique({
    where: { id: changeId },
    select: { ...CHANGE_SELECT, designVersionId: true },
  });
  if (!r) return null;
  return {
    ...toChangeView(r, await nameMaps([r])),
    designVersionId: r.designVersionId,
  };
}

/**
 * 図面の版のプログラム（現行版ごとに 1 本 + 過去の版 + 保留中の申請）。
 * 失敗時は空（詳細画面を壊さない）。
 */
export async function listDesignPrograms(
  versionId: string,
): Promise<DesignProgramsData> {
  const empty: DesignProgramsData = {
    programs: [],
    pendingAdds: [],
    failed: [],
  };
  try {
    const [rows, changes] = await Promise.all([
      prisma.designProgram.findMany({
        where: { designVersionId: versionId },
        select: PROGRAM_SELECT,
        orderBy: [{ sortOrder: "asc" }, { revision: "desc" }],
      }),
      prisma.designProgramChange.findMany({
        where: {
          designVersionId: versionId,
          OR: [
            { status: "PENDING" },
            {
              status: "FAILED",
              resolvedAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
            },
          ],
        },
        select: CHANGE_SELECT,
        orderBy: { requestedAt: "desc" },
      }),
    ]);
    const names = await nameMaps(changes);
    const changeViews = changes.map((c) => toChangeView(c, names));
    const pendingBy = new Map(
      changeViews
        .filter((c) => c.status === "PENDING" && c.programId)
        .map((c) => [c.programId as string, c]),
    );
    const byKey = new Map<string, ProgramRow[]>();
    for (const r of rows) {
      const list = byKey.get(r.programKey) ?? [];
      list.push(r);
      byKey.set(r.programKey, list);
    }
    const programs: DesignProgramView[] = [];
    for (const list of byKey.values()) {
      list.sort((a, b) => b.revision - a.revision);
      // 現行版（印が無い場合は最新の版を代わりに出す — 壊れた行で消えない）。
      const head = list.find((r) => r.supersededAt == null) ?? list[0];
      const views = list.map(toView);
      const headView = views[list.indexOf(head)];
      const keyUsed = views.some((v) => v.useCount > 0);
      const state: ProgramRevisionState = {
        current: head.supersededAt == null,
        retired: head.retiredAt != null,
        used: headView.useCount > 0,
        keyUsed,
      };
      const pending = pendingBy.get(head.id) ?? null;
      programs.push({
        ...headView,
        used: state.used,
        keyUsed,
        history: views.filter((v) => v.id !== head.id),
        pending,
        actions: allowedProgramActions(state, { pending: pending != null }),
      });
    }
    programs.sort(
      (a, b) =>
        Number(a.retiredAt != null) - Number(b.retiredAt != null) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "ja"),
    );
    return {
      programs,
      pendingAdds: changeViews.filter(
        (c) => c.status === "PENDING" && c.kind === "ADD",
      ),
      failed: changeViews.filter((c) => c.status === "FAILED"),
    };
  } catch (e) {
    console.error("listDesignPrograms failed", e);
    return empty;
  }
}

/** 版の状態（申請時・適用時に同じ読み方で）。 */
async function revisionState(
  db: Db,
  programId: string,
): Promise<{
  row: {
    id: string;
    designVersionId: string;
    programKey: string;
    revision: number;
    fileId: string | null;
    sortOrder: number;
    name: string;
  };
  state: ProgramRevisionState;
} | null> {
  const row = await db.designProgram.findUnique({
    where: { id: programId },
    select: {
      id: true,
      designVersionId: true,
      programKey: true,
      revision: true,
      fileId: true,
      sortOrder: true,
      name: true,
      supersededAt: true,
      retiredAt: true,
    },
  });
  if (!row) return null;
  const [used, keyUsed] = await Promise.all([
    db.workOrderStepProgram.count({ where: { programId } }),
    db.workOrderStepProgram.count({
      where: { program: { programKey: row.programKey } },
    }),
  ]);
  return {
    row,
    state: {
      current: row.supersededAt == null,
      retired: row.retiredAt != null,
      used: used > 0,
      keyUsed: keyUsed > 0,
    },
  };
}

function premiseMessage(issue: ProgramPremiseIssue, tr: Tr): string {
  return tr(`production.designPrograms.premise.${issue}`);
}

/** 機種・工程が実在するか（存在しない参照で FK エラーを出さない）。 */
async function referencesExist(db: Db, c: ProgramContent): Promise<boolean> {
  const stepIds = [...new Set(c.processStepIds)];
  const modelIds = [...new Set(c.machineModelIds)];
  const [steps, models] = await Promise.all([
    db.processStepCatalog.count({ where: { id: { in: stepIds } } }),
    db.machineModel.count({ where: { id: { in: modelIds } } }),
  ]);
  return steps === stepIds.length && models === modelIds.length;
}

/** どこからも指されなくなったファイルを片付ける（best-effort）。 */
async function dropFilesIfUnreferenced(ids: (string | null)[]): Promise<void> {
  for (const id of new Set(ids.filter((x): x is string => x != null))) {
    try {
      const [programs, pending] = await Promise.all([
        prisma.designProgram.count({ where: { fileId: id } }),
        prisma.designProgramChange.count({
          where: { newFileId: id, status: "PENDING" },
        }),
      ]);
      if (programs + pending > 0) continue;
      const f = await prisma.file.findUnique({
        where: { id },
        select: { storageKey: true },
      });
      if (!f) continue;
      await prisma.file.delete({ where: { id } });
      await deleteObject(f.storageKey).catch(() => {});
    } catch (e) {
      console.error("dropFilesIfUnreferenced failed", e);
    }
  }
}

export interface ProgramChangeResult {
  ok: boolean;
  error?: string;
  /** true = 承認依頼中として保留した（何も動いていない）。 */
  pending?: boolean;
  /** true = 当たった。 */
  applied?: boolean;
}

/**
 * 加工プログラムの変更を申請する（design_file:UPDATE は呼び出し側で確認済み）。
 * 承認設定に段が無ければ申請と同時に当てる。
 */
export async function requestProgramChange(input: {
  versionId: string;
  kind: ProgramChangeKind;
  programId?: string | null;
  content?: ProgramContent | null;
  note?: string | null;
  upload?: UploadedFile | null;
}): Promise<ProgramChangeResult> {
  const tr = await getTranslations();
  const v = await prisma.designVersion.findUnique({
    where: { id: input.versionId },
    select: { id: true, itemId: true, version: true },
  });
  if (!v)
    return { ok: false, error: tr("production.designFileActions.notFound") };

  let base: Awaited<ReturnType<typeof revisionState>> = null;
  if (input.kind !== "ADD") {
    if (!input.programId) {
      return { ok: false, error: tr("production.designFileActions.notFound") };
    }
    base = await revisionState(prisma, input.programId);
    if (!base || base.row.designVersionId !== v.id) {
      return { ok: false, error: tr("production.designFileActions.notFound") };
    }
    const issue = programChangePremise(input.kind, base.state);
    if (issue) return { ok: false, error: premiseMessage(issue, tr) };
    const pending = await prisma.designProgramChange.count({
      where: { programId: base.row.id, status: "PENDING" },
    });
    if (pending > 0) {
      return {
        ok: false,
        error: tr("production.designPrograms.alreadyPending"),
      };
    }
  }

  let content: ProgramContent | null = null;
  if (changeHasContent(input.kind)) {
    content = input.content ?? null;
    if (!content) {
      return {
        ok: false,
        error: tr("production.designPrograms.invalidPayload"),
      };
    }
    if (!(await referencesExist(prisma, content))) {
      return {
        ok: false,
        error: tr("production.designPrograms.invalidReference"),
      };
    }
    if (content.file === "new" && !input.upload) {
      return { ok: false, error: tr("production.designPrograms.fileMissing") };
    }
    if (content.file === "keep" && input.kind === "ADD") {
      content = { ...content, file: "remove" };
    }
  }

  const need = await approvalNeed(TARGET_TYPE);
  if (need.kind === "blocked") return { ok: false, error: need.error };

  let newFileId: string | null = null;
  if (content?.file === "new" && input.upload) {
    const stored = await storeOne(v.itemId, input.upload, tr);
    if (!stored.ok) return { ok: false, error: stored.error };
    newFileId = stored.fileId;
  }

  const actor = await getCurrentActorId();
  let row: { id: string };
  try {
    row = await prisma.designProgramChange.create({
      data: {
        designVersionId: v.id,
        kind: input.kind,
        programId: base?.row.id ?? null,
        payload: (content ?? undefined) as Prisma.InputJsonValue | undefined,
        newFileId,
        note: input.note?.trim() || null,
        requestedBy: actor,
      },
      select: { id: true },
    });
  } catch (e) {
    await dropFilesIfUnreferenced([newFileId]);
    // 部分 unique（1 プログラムに保留 1 件）に同時に当たった。
    console.error("requestProgramChange create failed", e);
    return { ok: false, error: tr("production.designPrograms.alreadyPending") };
  }

  if (need.kind === "skip") return applyProgramChange(row.id);

  const started = await startApprovalFlow({
    targetType: TARGET_TYPE,
    targetId: row.id,
    notes: input.note?.trim() || undefined,
  });
  if (!started.ok) {
    // 依頼が作れないなら保留行も残さない（承認できない幽霊を作らない）。
    await prisma.designProgramChange.delete({ where: { id: row.id } });
    await dropFilesIfUnreferenced([newFileId]);
    return {
      ok: false,
      error:
        started.error ??
        tr("production.workOrderFlowChanges.approvalRequestFailedFallback"),
    };
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "design_versions",
    recordId: v.id,
    after: {
      note: tr("production.designPrograms.requestedAudit", {
        kind: tr(`production.designPrograms.kind.${input.kind}`),
        name: content?.name ?? base?.row.name ?? "",
      }),
    },
  });
  return { ok: true, pending: true };
}

/** 適用を止める理由（トランザクションを巻き戻してから FAILED に残す）。 */
class ProgramApplyError extends Error {}

async function replaceContentTx(
  tx: Prisma.TransactionClient,
  programId: string,
  c: ProgramContent,
): Promise<void> {
  await tx.designProgramStep.deleteMany({ where: { programId } });
  await tx.designProgramStep.createMany({
    data: [...new Set(c.processStepIds)].map((processStepId) => ({
      programId,
      processStepId,
    })),
  });
  await tx.designProgramMachineModel.deleteMany({ where: { programId } });
  if (c.machineModelIds.length > 0) {
    await tx.designProgramMachineModel.createMany({
      data: [...new Set(c.machineModelIds)].map((machineModelId) => ({
        programId,
        machineModelId,
      })),
    });
  }
}

/**
 * 申請を当てる（最終承認のとき / 承認が要らないときは申請の直後）。
 * 前提（基にした版がまだ現行版か・未使用か）を確かめ直し、崩れていれば
 * 何も動かさず FAILED + 理由で残す。
 */
export async function applyProgramChange(
  changeId: string,
): Promise<ProgramChangeResult> {
  const tr = await getTranslations();
  const actor = await getCurrentActorId();
  const change = await prisma.designProgramChange.findUnique({
    where: { id: changeId },
    select: {
      id: true,
      status: true,
      kind: true,
      programId: true,
      payload: true,
      newFileId: true,
      designVersionId: true,
      designVersion: { select: { version: true } },
    },
  });
  if (!change) {
    return { ok: false, error: tr("production.designPrograms.changeNotFound") };
  }
  if (change.status !== "PENDING") {
    return { ok: false, error: tr("approvals.engine.alreadyProcessed") };
  }
  const kind = change.kind as ProgramChangeKind;
  const dropAfter: (string | null)[] = [];
  let summaryName = "";
  let appliedProgramId: string | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.designProgramChange.updateMany({
          where: { id: changeId, status: "PENDING" },
          data: { status: "PENDING" },
        });
        if (locked.count !== 1) {
          throw new ProgramApplyError(tr("approvals.engine.alreadyProcessed"));
        }
        const content = changeHasContent(kind)
          ? parseProgramContent(change.payload)
          : null;
        if (changeHasContent(kind) && !content) {
          throw new ProgramApplyError(
            tr("production.designPrograms.invalidPayload"),
          );
        }
        if (content && !(await referencesExist(tx, content))) {
          throw new ProgramApplyError(
            tr("production.designPrograms.invalidReference"),
          );
        }
        const base =
          kind === "ADD" || !change.programId
            ? null
            : await revisionState(tx, change.programId);
        const issue = programChangePremise(kind, base?.state ?? null);
        if (issue) throw new ProgramApplyError(premiseMessage(issue, tr));
        const now = new Date();

        switch (kind) {
          case "ADD": {
            const c = content as ProgramContent;
            const max = await tx.designProgram.aggregate({
              where: { designVersionId: change.designVersionId },
              _max: { sortOrder: true },
            });
            const id = randomUUID();
            await tx.designProgram.create({
              data: {
                id,
                programKey: id,
                revision: 1,
                designVersionId: change.designVersionId,
                name: c.name,
                programNumber: c.programNumber || null,
                notes: c.notes || null,
                fileId: resolveContentFile(c, null, change.newFileId),
                sortOrder: (max._max.sortOrder ?? -1) + 1,
                createdBy: actor,
              },
            });
            await replaceContentTx(tx, id, c);
            appliedProgramId = id;
            summaryName = c.name;
            break;
          }
          case "EDIT": {
            const c = content as ProgramContent;
            const b = base?.row;
            if (!b) throw new ProgramApplyError(premiseMessage("notFound", tr));
            const fileId = resolveContentFile(c, b.fileId, change.newFileId);
            if (b.fileId && b.fileId !== fileId) dropAfter.push(b.fileId);
            // 条件付き — 読んだあとに工程が始まって使用済みになっていたら、
            // 記録の行が先に入る（RESTRICT は効かないので数え直して止める）。
            await tx.designProgram.update({
              where: { id: b.id },
              data: {
                name: c.name,
                programNumber: c.programNumber || null,
                notes: c.notes || null,
                fileId,
              },
            });
            await replaceContentTx(tx, b.id, c);
            const usedNow = await tx.workOrderStepProgram.count({
              where: { programId: b.id },
            });
            if (usedNow > 0) {
              throw new ProgramApplyError(premiseMessage("used", tr));
            }
            appliedProgramId = b.id;
            summaryName = c.name;
            break;
          }
          case "REVISE": {
            const c = content as ProgramContent;
            const b = base?.row;
            if (!b) throw new ProgramApplyError(premiseMessage("notFound", tr));
            const flipped = await tx.designProgram.updateMany({
              where: { id: b.id, supersededAt: null, retiredAt: null },
              data: { supersededAt: now },
            });
            if (flipped.count !== 1) {
              throw new ProgramApplyError(premiseMessage("notCurrent", tr));
            }
            const id = randomUUID();
            await tx.designProgram.create({
              data: {
                id,
                programKey: b.programKey,
                revision: b.revision + 1,
                designVersionId: b.designVersionId,
                name: c.name,
                programNumber: c.programNumber || null,
                notes: c.notes || null,
                fileId: resolveContentFile(c, b.fileId, change.newFileId),
                sortOrder: b.sortOrder,
                createdBy: actor,
              },
            });
            await replaceContentTx(tx, id, c);
            appliedProgramId = id;
            summaryName = c.name;
            break;
          }
          case "DELETE": {
            const b = base?.row;
            if (!b) throw new ProgramApplyError(premiseMessage("notFound", tr));
            const rows = await tx.designProgram.findMany({
              where: { programKey: b.programKey },
              select: { id: true, fileId: true },
            });
            dropAfter.push(...rows.map((r) => r.fileId));
            // 使用済みの版があれば RESTRICT で DB が止める（前提で確かめ済み）。
            await tx.designProgram.deleteMany({
              where: { programKey: b.programKey },
            });
            summaryName = b.name;
            break;
          }
          case "RETIRE": {
            const b = base?.row;
            if (!b) throw new ProgramApplyError(premiseMessage("notFound", tr));
            const r = await tx.designProgram.updateMany({
              where: { id: b.id, supersededAt: null, retiredAt: null },
              data: { retiredAt: now },
            });
            if (r.count !== 1) {
              throw new ProgramApplyError(premiseMessage("notCurrent", tr));
            }
            appliedProgramId = b.id;
            summaryName = b.name;
            break;
          }
        }
        await tx.designProgramChange.update({
          where: { id: changeId },
          data: {
            status: "APPLIED",
            error: null,
            appliedAt: now,
            appliedProgramId,
            resolvedBy: actor,
            resolvedAt: now,
          },
        });
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    const message =
      e instanceof ProgramApplyError
        ? e.message
        : tr("production.designPrograms.applyFailed");
    if (!(e instanceof ProgramApplyError)) {
      console.error("applyProgramChange failed", e);
    }
    await prisma.designProgramChange.updateMany({
      where: { id: changeId, status: "PENDING" },
      data: {
        status: "FAILED",
        error: message,
        resolvedBy: actor,
        resolvedAt: new Date(),
      },
    });
    await dropFilesIfUnreferenced([change.newFileId]);
    await recordAudit({
      action: "UPDATE",
      tableName: "design_versions",
      recordId: change.designVersionId,
      after: {
        note: tr("production.designPrograms.applyFailedAudit", {
          error: message,
        }),
      },
    });
    return { ok: false, error: message };
  }

  await dropFilesIfUnreferenced(dropAfter);
  await recordAudit({
    action: "UPDATE",
    tableName: "design_versions",
    recordId: change.designVersionId,
    after: {
      note: tr("production.designPrograms.appliedAudit", {
        kind: tr(`production.designPrograms.kind.${kind}`),
        name: summaryName,
        version: change.designVersion.version,
      }),
      programChange: { id: changeId, kind, programId: appliedProgramId },
    },
  });
  return { ok: true, applied: true };
}

/** 差し戻し・取り下げで保留を閉じる（何も動かさない）。 */
export async function closeProgramChange(
  changeId: string,
  status: "REJECTED" | "CANCELLED",
): Promise<void> {
  const actor = await getCurrentActorId();
  const row = await prisma.designProgramChange.findUnique({
    where: { id: changeId },
    select: { newFileId: true },
  });
  await prisma.designProgramChange.updateMany({
    where: { id: changeId, status: "PENDING" },
    data: { status, resolvedBy: actor, resolvedAt: new Date() },
  });
  await dropFilesIfUnreferenced([row?.newFileId ?? null]);
}

// ── 工程実行画面 ────────────────────────────────────────────────────────────

const STEP_SELECT = {
  status: true,
  startedAt: true,
  processStepId: true,
  plans: { select: { workLocation: { select: { machineModelId: true } } } },
  actuals: { select: { workLocation: { select: { machineModelId: true } } } },
  programUses: { select: { program: { select: PROGRAM_SELECT } } },
  workOrder: {
    select: {
      productItemId: true,
      designFile: { select: { designVersionId: true } },
      orderLineLinks: {
        select: {
          orderLine: {
            select: { acceptance: { select: { customerBpId: true } } },
          },
        },
      },
    },
  },
} as const satisfies Prisma.WorkOrderStepSelect;

type StepRow = Prisma.WorkOrderStepGetPayload<{ select: typeof STEP_SELECT }>;

/** 工程の機械（計画・実績の作業場所）の機種。 */
function stepModelIds(step: StepRow): (number | null)[] {
  return [
    ...step.plans.map((p) => p.workLocation?.machineModelId ?? null),
    ...step.actuals.map((a) => a.workLocation?.machineModelId ?? null),
  ];
}

/** 指示書が見る図面の版と、その版の全プログラム（全版）。 */
async function stepCandidates(
  db: Db,
  step: StepRow,
): Promise<{
  version: { id: string; version: number; itemId: number } | null;
  rows: ProgramRow[];
}> {
  const wo = step.workOrder;
  if (!wo.productItemId) return { version: null, rows: [] };
  const versions = await db.designVersion.findMany({
    where: { itemId: wo.productItemId },
    select: { id: true, customerBpId: true, version: true, status: true },
  });
  const picked = pickWorkOrderDesignVersion(versions, {
    pinnedVersionId: wo.designFile?.designVersionId ?? null,
    customerBpId: workOrderDesignCustomer(
      wo.orderLineLinks.map((l) => l.orderLine.acceptance.customerBpId),
    ),
  });
  if (!picked) return { version: null, rows: [] };
  const rows = await db.designProgram.findMany({
    where: { designVersionId: picked.id },
    select: PROGRAM_SELECT,
  });
  return {
    version: {
      id: picked.id,
      version: picked.version,
      itemId: wo.productItemId,
    },
    rows,
  };
}

const forCore = (r: ProgramRow) => ({
  ...r,
  machineModelIds: r.machineModels.map((m) => m.machineModel.id),
  processStepIds: r.steps.map((s) => s.processStepId),
});

/**
 * 工程実行画面: この工程で使う加工プログラム。
 *
 * 開始済みの工程は開始時に記録した版、それ以外はいまの現行版
 * （lib/design-programs-core programsShownForStep）。機種の一致は、
 * その工程の計画行と実績行の作業場所の機種で見る。
 */
export async function fetchStepPrograms(
  stepId: string,
): Promise<StepProgramsView> {
  const empty: StepProgramsView = {
    version: null,
    programs: [],
    fromRecord: false,
  };
  try {
    const step = await prisma.workOrderStep.findUnique({
      where: { id: stepId },
      select: STEP_SELECT,
    });
    if (!step) return empty;
    const { version, rows } = await stepCandidates(prisma, step);
    const shown = programsShownForStep(
      {
        started: step.status !== "PENDING",
        recorded: step.programUses.map((u) => forCore(u.program)),
        candidates: rows.map(forCore),
      },
      step.processStepId,
      stepModelIds(step),
    );
    return {
      version,
      fromRecord: shown.fromRecord,
      programs: shown.programs.map((p) => ({
        ...toView(p),
        modelMatch: p.modelMatch,
      })),
    };
  } catch (e) {
    console.error("fetchStepPrograms failed", e);
    return empty;
  }
}

/**
 * 工程の開始で、いまこの工程に出ている版を記録する（開始と同じトランザクション
 * で呼ぶ）。記録した版は使用済みになり、その場では書き換えられなくなる。
 * 共有端末（nextjs-kiosk lib/design-programs.ts）にも同じ処理がある。
 */
export async function recordStepProgramsTx(
  tx: Prisma.TransactionClient,
  stepId: string,
): Promise<number> {
  const step = await tx.workOrderStep.findUnique({
    where: { id: stepId },
    select: STEP_SELECT,
  });
  if (!step) return 0;
  const { rows } = await stepCandidates(tx, step);
  const chosen = programsForStep(
    currentPrograms(rows.map(forCore)),
    step.processStepId,
    stepModelIds(step),
  );
  if (chosen.length === 0) return 0;
  const r = await tx.workOrderStepProgram.createMany({
    data: chosen.map((p) => ({ stepId, programId: p.id })),
    skipDuplicates: true,
  });
  return r.count;
}
