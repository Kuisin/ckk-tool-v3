/**
 * api-problem.ts — RFC 9457 problem+json の Response を組み立てる。
 *
 * 本文の形は api-problem-core.ts（純粋・試験対象）が決める。ここは
 * Response とヘッダだけ。
 *
 * **誤り本文は英語で固定し、next-intl を通さない**（`_specs/api.md` §4、
 * `_specs/i18n-glossary.md` §1 の対象外）。機械向けの契約に、閲覧者ごとに
 * 変わる文字列を混ぜない。
 */

import {
  type BuildProblemInput,
  buildProblem,
  forbiddenProblem,
  type ProblemBody,
  unauthorizedProblem,
} from "./api-problem-core";

const HEADERS: Record<string, string> = {
  "content-type": "application/problem+json; charset=utf-8",
  // 誤りを中間でキャッシュされると、権限を直したのに直らないように見える。
  "cache-control": "no-store",
};

function toResponse(
  body: ProblemBody,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { ...HEADERS, ...extra },
  });
}

export function problemResponse(input: BuildProblemInput): Response {
  return toResponse(buildProblem(input));
}

/**
 * 認証失敗。**理由を受け取らない** — 12 通りの拒否理由はすべてこの 1 つの
 * 応答になる（`api-auth-core.ts` の頭を参照）。理由は監査記録にだけ残す。
 *
 * `WWW-Authenticate` は 401 に必須（RFC 9110 §11.6.1）。
 */
export function unauthorized(instance?: string): Response {
  return toResponse(unauthorizedProblem(instance), {
    "www-authenticate": "Bearer",
  });
}

/** 認可失敗。相手は認証を通っているので、必要な権限は具体的に返してよい。 */
export function forbidden(
  permissionCode: string,
  action: string,
  instance?: string,
): Response {
  return toResponse(forbiddenProblem(permissionCode, action, instance));
}

export function notFoundProblem(instance?: string): Response {
  return problemResponse({ code: "not_found", instance });
}

export function rateLimited(instance?: string): Response {
  // Retry-After は**付けない**。待てば通ると教えることは、その先に
  // 当てるべきものが在ると教えること（401 と同じ姿勢）。
  return problemResponse({ code: "rate_limited", instance });
}

/** 要求されたパス（pathname のみ）。クエリは誤用でトークンを載せうるので捨てる。 */
export function instanceOf(request: Request): string {
  try {
    return new URL(request.url).pathname.slice(0, 256);
  } catch {
    return "/api/v1";
  }
}
