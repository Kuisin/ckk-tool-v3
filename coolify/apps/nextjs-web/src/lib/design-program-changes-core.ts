/**
 * design-program-changes-core.ts — 加工プログラムの変更の規則。純関数（Web のみ）。
 *
 * プログラムは版（DB の 1 行 = 1 版）を持ち、工程を開始したときに出ていた版を
 * work_order_step_programs に記録する。記録のある版は「使用済み」。
 *
 *   - 未使用の版   → その場で直せる（EDIT）・消せる（DELETE、どの版も未使用なら）
 *   - 使用済みの版 → 直さない。新しい版を作る（REVISE = revision + 1）か、
 *                    廃止する（RETIRE = 新しい工程に出さない）
 *   - 追加（ADD）
 *
 * どれも申請（design_program_changes）として出し、承認設定（MS0B）の
 * 「加工プログラムの変更」の最終承認で当たる（段が無ければ申請と同時に当たる）。
 * **当てる時点で前提を確かめ直す**（programChangePremise）— 承認を待つあいだに
 * 工程が始まって使用済みになった版を、その場で書き換えないため。
 *
 * 図面の版の確定とは独立（確定で凍るのは図面で、プログラムではない）。
 */

import { z } from "zod";
import { type LocalizedText, localized } from "./format";

export const PROGRAM_CHANGE_KINDS = [
  "ADD",
  "EDIT",
  "REVISE",
  "DELETE",
  "RETIRE",
] as const;
export type ProgramChangeKind = (typeof PROGRAM_CHANGE_KINDS)[number];

export const PROGRAM_CHANGE_STATUSES = [
  "PENDING",
  "APPLIED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
] as const;
export type ProgramChangeStatus = (typeof PROGRAM_CHANGE_STATUSES)[number];

/** 中身を持つ変更（ADD / EDIT / REVISE）。 */
export function changeHasContent(kind: ProgramChangeKind): boolean {
  return kind === "ADD" || kind === "EDIT" || kind === "REVISE";
}

/**
 * プログラム 1 版の中身（申請の payload）。
 * file: keep = 基にした版のファイルを引き継ぐ / remove = 外す / new = 申請と
 * 一緒に上げたファイル（design_program_changes.new_file_id）。
 */
export const programContentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  programNumber: z.string().trim().max(100).nullish(),
  machineModelIds: z.array(z.number().int().positive()).max(50).default([]),
  processStepIds: z.array(z.number().int().positive()).min(1).max(100),
  notes: z.string().trim().max(2000).nullish(),
  file: z.enum(["keep", "remove", "new"]).default("keep"),
});
export type ProgramContent = z.infer<typeof programContentSchema>;

/** DB の payload を読む（壊れていれば null）。 */
export function parseProgramContent(value: unknown): ProgramContent | null {
  const r = programContentSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** 版の状態（画面の操作の出し分け・適用時の突き合わせで同じものを見る）。 */
export interface ProgramRevisionState {
  /** 現行版か（superseded_at = null）。 */
  current: boolean;
  retired: boolean;
  /** この版が使用済みか。 */
  used: boolean;
  /** 同じプログラムのどれかの版が使用済みか。 */
  keyUsed: boolean;
}

export interface ProgramActions {
  edit: boolean;
  revise: boolean;
  delete: boolean;
  retire: boolean;
}

const NONE: ProgramActions = {
  edit: false,
  revise: false,
  delete: false,
  retire: false,
};

/**
 * この版に対して出せる申請。保留中の申請があれば何も出さない（1 本に 1 件）。
 *
 * - 直す（その場）は**この版**が未使用のときだけ。使用済みなら新しい版を作る。
 * - 消すのは**どの版も**未使用のときだけ（使った版の行は残す）。使った版が
 *   あるプログラムは廃止で止める。
 */
export function allowedProgramActions(
  state: ProgramRevisionState,
  opts: { pending: boolean },
): ProgramActions {
  if (opts.pending || !state.current || state.retired) return NONE;
  return {
    edit: !state.used,
    revise: state.used,
    delete: !state.keyUsed,
    retire: state.keyUsed,
  };
}

export type ProgramPremiseIssue =
  | "notFound"
  | "notCurrent"
  | "retired"
  | "used"
  | "keyUsed";

/**
 * 申請を当ててよいか（当てる直前に、いまの状態で確かめる）。
 * null = 当ててよい。ADD は基にする版が無いので常に null。
 */
export function programChangePremise(
  kind: ProgramChangeKind,
  state: ProgramRevisionState | null,
): ProgramPremiseIssue | null {
  if (kind === "ADD") return null;
  if (!state) return "notFound";
  if (!state.current) return "notCurrent";
  if (state.retired) return "retired";
  if (kind === "EDIT" && state.used) return "used";
  if (kind === "DELETE" && state.keyUsed) return "keyUsed";
  return null;
}

/** 当てたあとのファイル（keep は基にした版のもの、new は申請で上げたもの）。 */
export function resolveContentFile(
  content: Pick<ProgramContent, "file">,
  baseFileId: string | null,
  newFileId: string | null,
): string | null {
  if (content.file === "new") return newFileId;
  if (content.file === "remove") return null;
  return baseFileId;
}

/**
 * 申請を人が読む名前にする（未処理一覧・承認依頼の対象欄）。
 * 「製品コード v図面の版 / プログラム名」— uuid を並べない。
 */
export function designProgramChangeLabel(row: {
  payload: unknown;
  program: { name: string } | null;
  designVersion: {
    version: number;
    item: { code: string | null; name: unknown };
  };
}): string {
  const product =
    row.designVersion.item.code ??
    localized(row.designVersion.item.name as LocalizedText | null);
  const name =
    parseProgramContent(row.payload)?.name ?? row.program?.name ?? "";
  return `${product} v${row.designVersion.version} / ${name}`;
}
