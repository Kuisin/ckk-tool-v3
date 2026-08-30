import "server-only";

/**
 * privileged-access.ts — 時限昇格（方式 A）の門番。server-only.
 *
 * RBAC は変えていない。decide() が「申請してよいか」を答え、そのうえで
 * **承認済みで期限内の付与があるか**をここで見る。2 段構えなので、
 * @ckk/authz-core の意味論はそのまま残る。
 *
 * ■ peek と use を分けてある（これが一番大事）
 * 時計は初回使用から動く。だから「画面を描くための問い合わせ」で時計を
 * 動かしてはいけない — SY09 を開いただけで 30 分が減りはじめたら、
 * 誰も期限を信用しなくなる。
 *   peekElevation … 読むだけ。画面のボタン状態とカウントダウンに使う
 *   useElevation  … 実際に特権操作をするサーバーアクションだけが呼ぶ。
 *                   ここで初めて activated_at が入る
 *
 * ■ 判定は SQL の WHERE 句で閉じる
 * 「使えるか調べてから使う」を 2 クエリに分けると、その間に期限が切れたり
 * 同時実行で二重に arm されたりする。条件付き UPDATE 1 本にして、
 * 更新できた行がある = 使ってよかった、とする。行が返らなければ拒否。
 *
 * ■ 管理者は素通し（利用者の決定）
 * system:ADMIN は従来どおり直接実行できる。これが唯一の締め出し回避路でも
 * あるので、自己承認の抜け道を作らずに済んでいる。ただし素通しは監査行に
 * bypass:"admin" として残し、承認を経た実行と区別できるようにする。
 */

import { isSuperuser } from "@ckk/authz-core";
import { checkPermission, getPermissionSet, sessionUserId } from "./authz";
import { prisma } from "./db";
import {
  type GrantState,
  type GrantWindow,
  grantState,
  remainingMs,
} from "./privileged-access-core";
import {
  type ElevationCode,
  findOperation,
  operationsForCode,
  type PrivilegedOperation,
} from "./privileged-operations";

/** 画面に渡す昇格の状態（プリミティブのみ — クライアント境界を越えるため）。 */
export interface ElevationView {
  operationKey: string;
  /** 申請する資格そのものがあるか（decide(code, action)）。 */
  canRequest: boolean;
  /** いま実行してよいか。管理者は常に true。 */
  allowed: boolean;
  /** 管理者として素通ししているか（画面に「管理者権限で実行」と出す）。 */
  viaAdmin: boolean;
  /** 有効な付与の状態。無ければ null。 */
  state: GrantState | null;
  /** 残りミリ秒（カウントダウン用）。付与が無い / 管理者素通しなら null。 */
  remainingMs: number | null;
  /** 承認待ちの申請があるか（「申請済み・承認待ち」を出すため）。 */
  pending: boolean;
}

const DENIED = (operationKey: string, canRequest: boolean): ElevationView => ({
  operationKey,
  canRequest,
  allowed: false,
  viaAdmin: false,
  state: null,
  remainingMs: null,
  pending: false,
});

/** 未知の操作キーは常に拒否（登録簿に無いものを黙って通さない）。 */
function requireOperation(operationKey: string): PrivilegedOperation {
  const op = findOperation(operationKey);
  if (!op) {
    throw new Error(
      `未知の特権操作です: ${operationKey}（lib/privileged-operations.ts に登録してください）`,
    );
  }
  return op;
}

async function isAdminBypass(): Promise<boolean> {
  const set = await getPermissionSet();
  return set ? isSuperuser(set) : false;
}

/** その付与行のうち、判定に要る列だけ。 */
type GrantRow = GrantWindow & { id: string };

/**
 * いま使える付与を 1 件返す（読むだけ・arm しない）。
 * 既に動いている付与を優先する — 使いかけを放置して新しいものを消費すると、
 * 2 本持っているときに両方の時計が同時に減る。
 */
async function findUsableGrant(
  userId: string,
  op: PrivilegedOperation,
): Promise<GrantRow | null> {
  const rows = await prisma.$queryRaw<GrantRow[]>`
    SELECT r.id::text AS id, r.status::text AS status,
           r.window_starts_at AS "windowStartsAt",
           r.window_ends_at   AS "windowEndsAt",
           r.duration_minutes AS "durationMinutes",
           r.activated_at     AS "activatedAt"
      FROM app.privileged_access_requests r
      JOIN app.privileged_access_request_operations o
        ON o.request_id = r.id AND o.operation = ${op.key} AND o.granted
     WHERE r.requested_by = ${userId}::uuid
       AND r.status = 'APPROVED'
       AND now() BETWEEN r.window_starts_at AND r.window_ends_at
       AND (r.activated_at IS NULL
            OR now() <= r.activated_at + make_interval(mins => r.duration_minutes))
     ORDER BY r.activated_at NULLS LAST, r.window_ends_at
     LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * 画面用の状態。**書き込みは一切しない。**
 * ページの描画やボタンの活性判定はこれを使うこと。
 */
export async function peekElevation(
  operationKey: string,
): Promise<ElevationView> {
  const op = requireOperation(operationKey);
  const userId = await sessionUserId();
  if (!userId) return DENIED(op.key, false);

  const authz = await checkPermission(op.code, op.action);
  if (!authz.ok) return DENIED(op.key, false);

  if (await isAdminBypass()) {
    return {
      operationKey: op.key,
      canRequest: true,
      allowed: true,
      viaAdmin: true,
      state: null,
      remainingMs: null,
      pending: false,
    };
  }

  const grant = await findUsableGrant(userId, op);
  if (grant) {
    const now = new Date();
    return {
      operationKey: op.key,
      canRequest: true,
      allowed: true,
      viaAdmin: false,
      state: grantState(grant, now),
      remainingMs: remainingMs(grant, now),
      pending: false,
    };
  }

  const pending = await prisma.privilegedAccessRequest.count({
    where: {
      requestedBy: userId,
      code: op.code,
      status: "PENDING",
      operations: { some: { operation: op.key } },
    },
  });
  return { ...DENIED(op.key, true), pending: pending > 0 };
}

/** 複数操作ぶんまとめて（1 画面に複数のボタンが並ぶとき）。 */
export async function peekElevations(
  operationKeys: readonly string[],
): Promise<Record<string, ElevationView>> {
  const entries = await Promise.all(
    operationKeys.map(async (k) => [k, await peekElevation(k)] as const),
  );
  return Object.fromEntries(entries);
}

export type ElevationResult =
  | {
      ok: true;
      userId: string;
      /** 使った付与の id。監査行に残す。管理者素通しなら null。 */
      grantId: string | null;
      viaAdmin: boolean;
    }
  | { ok: false; error: string; needsElevation: boolean; operationKey: string };

/** 監査行の after に足す印。「どの承認で実行されたか」を後から辿れるようにする。 */
export function elevationAuditNote(
  r: Extract<ElevationResult, { ok: true }>,
  operationKey: string,
): Record<string, unknown> {
  return r.viaAdmin
    ? { privilegedOperation: operationKey, bypass: "admin" }
    : { privilegedOperation: operationKey, grantId: r.grantId };
}

/**
 * 特権操作を 1 回実行してよいかを判定し、**初回なら時計を動かす**。
 *
 * 実際に操作を行うサーバーアクション（またはルートハンドラ）の先頭で呼ぶ。
 * checkPermission の代わりではなく、その後段:
 *
 *   const gate = await useElevation("kiosk_card.issue");
 *   if (!gate.ok) return actionError(gate.error);
 *   … 実処理 …
 *   await recordAudit({ …, after: { …, ...elevationAuditNote(gate, "kiosk_card.issue") } });
 *
 * arm は条件付き UPDATE 1 本。更新できた行がある = その瞬間に有効だった、
 * なので「調べてから使う」の隙間が無い。
 */
export async function useElevation(
  operationKey: string,
): Promise<ElevationResult> {
  const op = requireOperation(operationKey);
  const userId = await sessionUserId();
  if (!userId) {
    return {
      ok: false,
      error: "ログインが必要です",
      needsElevation: false,
      operationKey: op.key,
    };
  }

  // ① 素の権限。これが無い人はそもそも申請もできない。
  const authz = await checkPermission(op.code, op.action);
  if (!authz.ok) {
    return {
      ok: false,
      error: authz.error,
      needsElevation: false,
      operationKey: op.key,
    };
  }

  // ② 管理者は素通し（利用者の決定）。監査には bypass として残る。
  if (await isAdminBypass()) {
    return { ok: true, userId, grantId: null, viaAdmin: true };
  }

  // ③ 承認済みで期限内の付与を 1 件消費する。判定と arm を 1 文で閉じる。
  const armed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE app.privileged_access_requests r
       SET activated_at = COALESCE(r.activated_at, now()),
           last_used_at = now(),
           use_count    = r.use_count + 1
     WHERE r.id = (
            SELECT r2.id
              FROM app.privileged_access_requests r2
              JOIN app.privileged_access_request_operations o
                ON o.request_id = r2.id AND o.operation = ${op.key} AND o.granted
             WHERE r2.requested_by = ${userId}::uuid
               AND r2.status = 'APPROVED'
               AND now() BETWEEN r2.window_starts_at AND r2.window_ends_at
               AND (r2.activated_at IS NULL
                    OR now() <= r2.activated_at + make_interval(mins => r2.duration_minutes))
             ORDER BY r2.activated_at NULLS LAST, r2.window_ends_at
             LIMIT 1)
    RETURNING r.id::text AS id
  `;

  const grantId = armed[0]?.id;
  if (!grantId) {
    return {
      ok: false,
      error: `この操作には承認が必要です（${op.label.ja}）。特権アクセス（SY0G）から申請してください`,
      needsElevation: true,
      operationKey: op.key,
    };
  }
  return { ok: true, userId, grantId, viaAdmin: false };
}

/** そのユーザーが申請できるコード（申請フォームの「対象」選択肢）。 */
export async function requestableCodes(
  codes: readonly ElevationCode[],
): Promise<ElevationCode[]> {
  const out: ElevationCode[] = [];
  for (const code of codes) {
    // コード内のどれか 1 つでも申請できれば選択肢に出す。
    const ops = operationsForCode(code);
    let allowed = false;
    for (const op of ops) {
      const r = await checkPermission(op.code, op.action);
      if (r.ok) {
        allowed = true;
        break;
      }
    }
    if (allowed) out.push(code);
  }
  return out;
}

/** その人が承認者として決裁できるコード。 */
export async function approvableCodes(
  codes: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const code of codes) {
    const r = await checkPermission(code, "APPROVE");
    if (r.ok) out.push(code);
  }
  return out;
}
