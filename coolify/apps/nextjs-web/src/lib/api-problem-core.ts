/**
 * api-problem-core.ts — 外部 API の誤り本文（RFC 9457 problem+json）。純粋。
 *
 * ■ **英語で固定し、翻訳しない**
 *
 * `_specs/i18n-glossary.md` §1 の対象外として明記してある。機械向けの契約に
 * 「閲覧者ごとに変わる文字列」を混ぜない — next-intl を通すと、呼び出し側から
 * 見て同じ誤りが日によって違う文字列になる。ここの `title` / `detail` は
 * UI 文言ではなく**プロトコルの一部**。
 *
 * ■ `type` と `code` は公開契約
 *
 * 呼び出し側は `code` で分岐する。**一度出したら改名しない**（値の追加はよい）。
 * `type` は相対 URI 参照で、RFC 9457 §3.1.1 が許している。あとから
 * `https://…/problems/x` の実体を用意しても、相対のままなら壊れない。
 *
 * ■ 401 は 1 種類しかない
 *
 * 認証の失敗は 12 通りあるが（`api-auth-core.ts` の `ApiAuthDenyReason`）、
 * 返す本文は**全部これ 1 つ**。試験（api-problem-core.test.ts）が
 * 「どの理由でも同じ本文」を機械で固定する。
 */

export type ProblemCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "invalid_cursor"
  | "rate_limited"
  | "conflict"
  | "internal_error";

/** code → title。英語・不変。 */
export const PROBLEM_TITLES: Readonly<Record<ProblemCode, string>> =
  Object.freeze({
    unauthorized: "Unauthorized",
    forbidden: "Forbidden",
    not_found: "Not found",
    invalid_request: "Invalid request",
    invalid_cursor: "Invalid cursor",
    rate_limited: "Too many requests",
    conflict: "Conflict",
    internal_error: "Internal error",
  });

export const PROBLEM_STATUS: Readonly<Record<ProblemCode, number>> =
  Object.freeze({
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    invalid_request: 400,
    invalid_cursor: 400,
    rate_limited: 429,
    conflict: 409,
    internal_error: 500,
  });

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  instance?: string;
}

export interface BuildProblemInput {
  code: ProblemCode;
  /** 省略時は PROBLEM_STATUS の既定。 */
  status?: number;
  /** **英語で書くこと。** 呼び出し側が読む補足。 */
  detail?: string;
  /** 要求されたパス（pathname のみ。クエリは載せない）。 */
  instance?: string;
}

export function buildProblem({
  code,
  status,
  detail,
  instance,
}: BuildProblemInput): ProblemBody {
  const body: ProblemBody = {
    type: `/problems/${code}`,
    title: PROBLEM_TITLES[code],
    status: status ?? PROBLEM_STATUS[code],
    code,
  };
  if (detail) body.detail = detail;
  if (instance) body.instance = instance;
  return body;
}

/**
 * 認証失敗の**唯一の**本文。理由（`ApiAuthDenyReason`）を受け取らないのは
 * 設計であって手抜きではない — 受け取れる形にすると、いつか誰かが分岐を足す。
 */
export function unauthorizedProblem(instance?: string): ProblemBody {
  return buildProblem({
    code: "unauthorized",
    detail: "A valid API token is required.",
    instance,
  });
}

/** 認可失敗。**こちらは具体的でよい** — 相手は既に認証を通っている。 */
export function forbiddenProblem(
  permissionCode: string,
  action: string,
  instance?: string,
): ProblemBody {
  return buildProblem({
    code: "forbidden",
    detail: `Requires ${permissionCode}:${action}.`,
    instance,
  });
}
