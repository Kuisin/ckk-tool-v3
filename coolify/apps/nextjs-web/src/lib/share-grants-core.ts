/**
 * share-grants-core.ts — レコード単位の共有の判定（純関数・テスト対象）。
 *
 * なぜ RBAC と別立てなのか: 権限コード（`form` / `internal_page`）は
 * 「そのアプリを使えるか」までしか決められず、「この 1 件を誰に見せるか」を
 * 表現できない。フォームは既定で非公開（URL を知っている人だけ）、社内文書は
 * 全社 / 拠点 / ロール / 個人で配る — どちらもレコード単位なので、
 * app.share_grants に行を持ってここで解決する。
 *
 * 解決の考え方は @ckk/authz-core decide() と同じで、**当てはまる行の和集合**。
 * 1 行でも権限を与えていれば与える（否定行は持たない）。
 */

export type ShareSubjectType = "EVERYONE" | "PLANT" | "ROLE" | "USER";
export type ShareLevel = "RESPOND" | "READ" | "EDIT" | "MANAGE";

export interface ShareGrantRow {
  subjectType: ShareSubjectType;
  /** EVERYONE のときは null。それ以外は plant.id / role.id / user.id の文字列。 */
  subjectId: string | null;
  level: ShareLevel;
}

export interface ShareSubject {
  userId: string;
  /** 所属拠点の id（user_plants）。 */
  plantIds: readonly string[];
  /** 保持ロールの id（user_role_relation。文字列化して渡す）。 */
  roleIds: readonly string[];
  /** レコードの作成者本人か。作成者は常に MANAGE。 */
  isOwner: boolean;
  /** system:ADMIN。全レコードに対して MANAGE。 */
  isSuperuser: boolean;
}

export interface ShareAccess {
  canRespond: boolean;
  canRead: boolean;
  canEdit: boolean;
  canManage: boolean;
}

const NONE: ShareAccess = {
  canRespond: false,
  canRead: false,
  canEdit: false,
  canManage: false,
};

const ALL: ShareAccess = {
  canRespond: true,
  canRead: true,
  canEdit: true,
  canManage: true,
};

/** その行が対象ユーザーに当てはまるか。 */
function matches(row: ShareGrantRow, subject: ShareSubject): boolean {
  switch (row.subjectType) {
    case "EVERYONE":
      return true;
    case "PLANT":
      return row.subjectId != null && subject.plantIds.includes(row.subjectId);
    case "ROLE":
      return row.subjectId != null && subject.roleIds.includes(row.subjectId);
    case "USER":
      return row.subjectId != null && row.subjectId === subject.userId;
    default:
      // 未知の種別は権限を与えない（fail-closed）。
      return false;
  }
}

/**
 * 与える権限は上位が下位を含む:
 *   MANAGE ⊃ EDIT ⊃ READ ⊃ RESPOND
 * 「回答できるが他人の回答は見えない」を作りたいので RESPOND は READ を含まない。
 */
function apply(level: ShareLevel, acc: ShareAccess): ShareAccess {
  switch (level) {
    case "MANAGE":
      return ALL;
    case "EDIT":
      return { ...acc, canRespond: true, canRead: true, canEdit: true };
    case "READ":
      return { ...acc, canRespond: true, canRead: true };
    case "RESPOND":
      return { ...acc, canRespond: true };
    default:
      return acc;
  }
}

export function resolveShareAccess(
  grants: readonly ShareGrantRow[],
  subject: ShareSubject,
): ShareAccess {
  if (subject.isSuperuser || subject.isOwner) return ALL;
  let acc = NONE;
  for (const row of grants) {
    if (matches(row, subject)) acc = apply(row.level, acc);
  }
  return acc;
}

/** 共有先の表示用ラベル（バッジなどに使う）。 */
export const SHARE_LEVEL_LABEL: Record<ShareLevel, string> = {
  RESPOND: "回答のみ",
  READ: "閲覧",
  EDIT: "編集",
  MANAGE: "管理",
};

export const SHARE_SUBJECT_LABEL: Record<ShareSubjectType, string> = {
  EVERYONE: "全社",
  PLANT: "拠点",
  ROLE: "ロール",
  USER: "個人",
};
