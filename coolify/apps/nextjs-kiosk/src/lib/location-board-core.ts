/**
 * location-board-core.ts — 作業場所別の工程一覧の純ロジック（isomorphic）。
 *
 * 画面（/work-location）は「この機械の前に置いたタブレットが、その機械の仕事を
 * 出す」ためのもの。DB を引かずに決まることだけをここに置く:
 *   - 読み取った QR が作業場所のものか（`CKK:LOC:<work_locations.code>`）
 *   - 一覧の広さ（この作業場所だけ / グループ全体）
 *   - 行ごとの操作可否と担当者名
 *
 * ★ **操作可否は step-execution.ts の canOperateStep と同じ規則**にする。
 *   あちらが権威（API も getMyStep も通る）で、ここはその写しを画面に出すための
 *   純関数。食い違うと「一覧では押せるのに開くと 404」になる。
 */

import { QR_KINDS, qrKeyOfKind } from "./qr-payload";

/** 一覧のパス。 */
export const BOARD_PATH = "/work-location";

/** 一覧の広さ。 */
export type BoardScope = "location" | "group";

/**
 * 作業場所コードの長さの上限。API 側の zod（route.ts の workLocationCode:
 * max(100)）と合わせる — 画面で通して API で弾かれる形にしない。
 */
const MAX_LOCATION_CODE_LENGTH = 100;

/**
 * スキャン文字列 → 作業場所コード。作業場所 QR でなければ null。
 *
 * 指示書 QR（CKK:WO:…）やカード QR（素の 16 桁）を読んでしまったときに
 * 黙って通さないための関門。`qrKeyOfKind` が種別を見て弾く。
 */
export function parseWorkLocationQr(raw: string): string | null {
  const key = qrKeyOfKind(raw, QR_KINDS.WORK_LOCATION);
  if (key == null) return null;
  const trimmed = key.trim();
  if (trimmed === "" || trimmed.length > MAX_LOCATION_CODE_LENGTH) return null;
  return trimmed;
}

/**
 * クエリ文字列 → 一覧の広さ。**不明値は狭いほう**（この作業場所だけ）に倒す。
 * URL は誰でも書ける入力なので、広がる側を既定にしない。
 */
export function parseScope(raw: string | null | undefined): BoardScope {
  return raw === "group" ? "group" : "location";
}

/**
 * 一覧の URL。端末の既定作業場所を見ているときは `loc` を省く — そうすると
 * 「この端末の既定」という意味が URL に残り、端末の設定を変えれば追従する。
 */
export interface BoardTarget {
  /** いま見ている作業場所コード。端末の既定と同じなら省かれる。 */
  code?: string | null;
  scope?: BoardScope;
  /** 端末の既定作業場所コード（あれば）。 */
  deviceDefaultCode?: string | null;
}

/**
 * 一覧のクエリ部分だけ（"" / "?loc=M-04" / "?loc=M-04&scope=group"）。
 * 工程の実行画面が戻り先を組み立てるのに使う。
 */
export function boardQuery(opts: BoardTarget): string {
  const params = new URLSearchParams();
  const { code, deviceDefaultCode } = opts;
  if (code != null && code !== "" && code !== deviceDefaultCode) {
    params.set("loc", code);
  }
  if (opts.scope === "group") params.set("scope", "group");
  const qs = params.toString();
  return qs === "" ? "" : `?${qs}`;
}

/** 一覧の URL。 */
export function boardHref(opts: BoardTarget): string {
  return `${BOARD_PATH}${boardQuery(opts)}`;
}

/** 計画行のうち、操作可否の判定に要る分だけ。 */
export interface PlanAssignee {
  /** 担当者。**null = 「いつ・どこで」だけ決めた計画**（誰も縛らない）。 */
  userId: string | null;
  /** 表示名（担当者が居るときだけ）。 */
  displayName?: string | null;
}

export interface StepOperability {
  canOperate: boolean;
  /** 担当者名（重複除去・計画順）。空 = 担当者なし。 */
  assigneeNames: string[];
}

/**
 * 行の操作可否と担当者名。**step-execution.ts canOperateStep の 3 条件の写し**:
 *
 *   (a) 自分に計画が割り当てられている
 *   (b) 自分がセッションロックを保持している
 *   (c) **担当者付きの**計画が 1 行も無い（未計画は開放）
 *
 * (c) がこの画面の要。作業計画は担当者が任意になり（20261018090000）、代わりに
 * 計画日 + 作業場所が必須になったので、「この工程・この日・この機械・担当者は
 * 決めない」という行が普通に作られる。それは `user_id IS NULL` なので (c) を
 * 素通りし、**既に誰でも操作できる** — 権限の穴ではなく、`listMySteps` が
 * すべて userId で引いているせいで**どこにも表示されていなかった**だけ。
 * だからこの画面は権限を 1 ミリも広げない。
 */
export function stepOperability(
  plans: readonly PlanAssignee[],
  myUserId: string,
  holdsLock: boolean,
): StepOperability {
  const assigneeNames: string[] = [];
  let mine = false;
  let assignedToSomeone = false;
  for (const p of plans) {
    if (p.userId == null) continue; // 担当者なしの行は誰も縛らない
    assignedToSomeone = true;
    if (p.userId === myUserId) mine = true;
    const name = p.displayName ?? null;
    if (name != null && name !== "" && !assigneeNames.includes(name)) {
      assigneeNames.push(name);
    }
  }
  return {
    canOperate: mine || holdsLock || !assignedToSomeone,
    assigneeNames,
  };
}
