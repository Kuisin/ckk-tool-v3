/**
 * movement-type-core.ts — 移動タイプと手動入出庫の判定（純ロジック・I/O なし）。
 *
 * 「この型では出庫元が要るのか」「どの向きにいくつ動くのか」を、画面とサーバーの
 * **両方が同じ関数で**決める。片方だけが知っていると、画面では通るのに保存で
 * 弾かれる（またはその逆の、もっと悪いほう）が起きる。
 *
 * client-safe（`server-only` 無し）。
 */

export type MovementDirection = "IN" | "OUT" | "TRANSFER";

/** 移動タイプのうち、判定に要るぶんだけ。 */
export interface MovementTypeRule {
  direction: MovementDirection;
  requiresFrom: boolean;
  requiresTo: boolean;
}

/** 在庫の置き場所（拠点 + 保管場所 + 棚）。保管場所・棚は未割当があり得る。 */
export interface MovementEndpoint {
  plantId: number | null;
  storageLocationId: number | null;
  shelfId: number | null;
}

export interface MovementDraft {
  itemId: number | null;
  quantity: number;
  from: MovementEndpoint;
  to: MovementEndpoint;
}

/**
 * 向きから決まる「最低限どちら側が要るか」。
 *
 * 移動タイプの requiresFrom / requiresTo は利用者が変えられるが、**向きが要求する
 * ぶんは外せない** — 出庫なのに出庫元が無ければ、どこから引くのか決まらない。
 * 設定画面はこれを下限として使い、利用者は「さらに要求する」方向にだけ足せる。
 */
export function requiredEndpoints(direction: MovementDirection): {
  from: boolean;
  to: boolean;
} {
  switch (direction) {
    case "IN":
      return { from: false, to: true };
    case "OUT":
      return { from: true, to: false };
    case "TRANSFER":
      return { from: true, to: true };
  }
}

/** 設定として筋が通っているか（下限を満たしているか）。 */
export function isValidRule(rule: MovementTypeRule): boolean {
  const min = requiredEndpoints(rule.direction);
  return (!min.from || rule.requiresFrom) && (!min.to || rule.requiresTo);
}

/** 置き場所が指定されたと言えるか（拠点が入っていれば可。保管場所は任意）。 */
export function hasEndpoint(e: MovementEndpoint): boolean {
  return e.plantId != null;
}

export type MovementProblem =
  | "itemRequired"
  | "quantityPositive"
  | "fromRequired"
  | "toRequired"
  | "sameEndpoint";

/**
 * 入力の検査。**画面もサーバーもこれを呼ぶ。**
 *
 * 同じ場所への移動を弾くのは TRANSFER のときだけ — 入庫・出庫では片側しか
 * 使わないので、もう片方が同じに見えても意味が無い。
 */
export function validateMovement(
  rule: MovementTypeRule,
  draft: MovementDraft,
): MovementProblem[] {
  const problems: MovementProblem[] = [];
  if (draft.itemId == null) problems.push("itemRequired");
  if (!(draft.quantity > 0)) problems.push("quantityPositive");

  const min = requiredEndpoints(rule.direction);
  if ((min.from || rule.requiresFrom) && !hasEndpoint(draft.from)) {
    problems.push("fromRequired");
  }
  if ((min.to || rule.requiresTo) && !hasEndpoint(draft.to)) {
    problems.push("toRequired");
  }

  if (
    rule.direction === "TRANSFER" &&
    hasEndpoint(draft.from) &&
    hasEndpoint(draft.to) &&
    draft.from.plantId === draft.to.plantId &&
    draft.from.storageLocationId === draft.to.storageLocationId &&
    draft.from.shelfId === draft.to.shelfId
  ) {
    problems.push("sameEndpoint");
  }

  return problems;
}

export interface MovementPosting {
  endpoint: MovementEndpoint;
  transactionType: "IN" | "OUT";
}

/**
 * 1 回の手動入出庫が起こす計上の並び。
 *
 * TRANSFER は **OUT が先**。先に入れてから出すと、出庫元が足りなかったときに
 * 「増えてから失敗する」順になる（同一トランザクションなので最終的には巻き戻るが、
 * 残量ガードの判定順が変わって、通ってはいけない移動が通り得る）。
 */
export function postingsFor(
  rule: MovementTypeRule,
  draft: MovementDraft,
): MovementPosting[] {
  switch (rule.direction) {
    case "IN":
      return [{ endpoint: draft.to, transactionType: "IN" }];
    case "OUT":
      return [{ endpoint: draft.from, transactionType: "OUT" }];
    case "TRANSFER":
      return [
        { endpoint: draft.from, transactionType: "OUT" },
        { endpoint: draft.to, transactionType: "IN" },
      ];
  }
}

/**
 * 手動入出庫が起こす伝票の事由は **常に MANUAL**。
 *
 * 向きで ADJUSTMENT や STOCK_TRANSFER に振り分けたくなるが、それは嘘になる —
 * ADJUSTMENT は棚卸が数え直した結果で、STOCK_TRANSFER は在庫移動画面が起こす
 * もの。手で入れた入庫をそのどちらかに混ぜると、「棚卸で合わせた分」と
 * 「人が足した分」が後から区別できない。業務としてどの型かは移動タイプが持つ。
 */
export const MANUAL_CAUSE = "MANUAL" as const;
