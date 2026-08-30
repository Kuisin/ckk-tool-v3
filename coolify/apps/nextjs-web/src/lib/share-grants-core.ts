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
  /**
   * 「この条件に当てはまる回答だけ見せる」。**READ にだけ意味がある** —
   * EDIT/MANAGE はフォームを預かる側なので絞らない。null = 絞り込みなし。
   */
  condition?: ShareCondition | null;
  /**
   * 「この共有先へ、申請・報告の完了を知らせる」（フォームだけが使う）。
   * 読めない共有（RESPOND）には付かない — 開けない通知を送らないため。
   */
  notifyOnComplete?: boolean;
}

/** 回答の絞り込み条件（1 項目 × 値の集合。値のどれかに当たれば通る）。 */
export interface ShareCondition {
  fieldKey: string;
  /** 突合キー（select/multiselect は選択肢の value、lookup はマスタの id）。 */
  values: readonly string[];
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
  /**
   * 他人の回答をどこまで見てよいか。`all` なら全件、そうでなければ
   * `conditions` のいずれかに当てはまる回答だけ。
   *
   * **自分の回答は常に別枠で見える** — ここは「他人の回答」の話。
   */
  responseScope: ResponseScope;
}

export interface ResponseScope {
  all: boolean;
  conditions: ShareCondition[];
}

const NONE: ShareAccess = {
  canRespond: false,
  canRead: false,
  canEdit: false,
  canManage: false,
  responseScope: { all: false, conditions: [] },
};

const ALL: ShareAccess = {
  canRespond: true,
  canRead: true,
  canEdit: true,
  canManage: true,
  responseScope: { all: true, conditions: [] },
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
function apply(row: ShareGrantRow, acc: ShareAccess): ShareAccess {
  switch (row.level) {
    case "MANAGE":
      return ALL;
    case "EDIT":
      return {
        ...acc,
        canRespond: true,
        canRead: true,
        canEdit: true,
        // フォームを預かる側なので回答は全部見える。
        responseScope: { all: true, conditions: [] },
      };
    case "READ":
      return {
        ...acc,
        canRespond: true,
        canRead: true,
        responseScope: widen(acc.responseScope, row.condition),
      };
    case "RESPOND":
      return { ...acc, canRespond: true };
    default:
      return acc;
  }
}

/**
 * 見える範囲を広げる（狭めることはしない）。
 *
 * 行の和集合という既存の規則をそのまま適用する: **条件なしの READ が 1 行でも
 * あれば全件**。条件付きどうしは条件を足し合わせる（どれかに当たれば見える）。
 * 逆向き（条件付きが全件を打ち消す）にはしない — 否定行を持たない設計なので、
 * 1 行増やして見える範囲が減るのは規則が壊れる。
 */
function widen(
  scope: ResponseScope,
  condition: ShareCondition | null | undefined,
): ResponseScope {
  if (scope.all) return scope;
  if (!condition || condition.values.length === 0)
    return { all: true, conditions: [] };
  return { all: false, conditions: [...scope.conditions, condition] };
}

export function resolveShareAccess(
  grants: readonly ShareGrantRow[],
  subject: ShareSubject,
): ShareAccess {
  if (subject.isSuperuser || subject.isOwner) return ALL;
  let acc = NONE;
  for (const row of grants) {
    if (matches(row, subject)) acc = apply(row, acc);
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

/**
 * 条件に使える項目の型。
 *
 * 「選んだもの」だけを条件にする。自由入力（テキスト・数値・日付）は表記ゆれで
 * 当たり外れが変わり、共有範囲が入力の綺麗さに左右されてしまう — 見える／
 * 見えないを決める材料としては危うい。
 */
export const SHARE_CONDITION_FIELD_TYPES = [
  "select",
  "multiselect",
  "lookup",
] as const;

export type ShareConditionFieldType =
  (typeof SHARE_CONDITION_FIELD_TYPES)[number];

export function isShareConditionFieldType(
  type: string,
): type is ShareConditionFieldType {
  return (SHARE_CONDITION_FIELD_TYPES as readonly string[]).includes(type);
}

/**
 * 1 つの回答値が条件の値集合に当たるか。
 *
 * 回答の形は項目の型で違う（select = 文字列 / multiselect = 配列 /
 * lookup = `{ id, label }`）。**lookup は id だけで突き合わせる** — ラベルは
 * マスタ名の写しなので、改名で共有範囲が変わってはいけない。
 */
function answerHits(answer: unknown, values: readonly string[]): boolean {
  if (answer == null) return false;
  if (typeof answer === "string") return values.includes(answer);
  if (Array.isArray(answer)) return answer.some((v) => answerHits(v, values));
  if (typeof answer === "object") {
    const id = (answer as { id?: unknown }).id;
    return typeof id === "string" && values.includes(id);
  }
  return false;
}

/**
 * この回答が「見せてよい範囲」に入るか。
 *
 * **fail-closed** — 条件の項目が回答に無い（その版には無かった項目など）ときは
 * 見せない。見せてから気付くのでは遅い種類の間違いなので、迷ったら隠す。
 */
/**
 * 完了通知を付けられる共有権限。**RESPOND は含まない** — 回答だけの共有では
 * 他人の回答を読めないので、通知を開いても notFound になる。
 */
export const NOTIFIABLE_SHARE_LEVELS: readonly ShareLevel[] = [
  "READ",
  "EDIT",
  "MANAGE",
];

export function canNotifyOnComplete(level: ShareLevel): boolean {
  return NOTIFIABLE_SHARE_LEVELS.includes(level);
}

/**
 * この回答の完了を知らせるべき共有行を選ぶ。
 *
 * 条件付き共有（「拠点 A の回答だけ」）はそのまま効く — 見えない回答の完了を
 * 知らせても行き止まりなので、**見える範囲と通知の範囲は同じ**にしてある。
 * 宛先の展開（拠点・ロール → ユーザー）は DB が要るので lib/form-completion.ts。
 */
export function completionNotifyGrants(
  grants: readonly ShareGrantRow[],
  answers: Record<string, unknown>,
): ShareGrantRow[] {
  return grants.filter((g) => {
    if (!g.notifyOnComplete || !canNotifyOnComplete(g.level)) return false;
    const condition = g.condition;
    if (!condition || condition.values.length === 0) return true;
    return answerHits(answers[condition.fieldKey], condition.values);
  });
}

export function responseInScope(
  scope: ResponseScope,
  answers: Record<string, unknown>,
): boolean {
  if (scope.all) return true;
  if (scope.conditions.length === 0) return false;
  return scope.conditions.some(
    (c) => c.values.length > 0 && answerHits(answers[c.fieldKey], c.values),
  );
}
