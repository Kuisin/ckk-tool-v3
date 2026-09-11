/**
 * api-write.ts — 書き込みの口の共通部分。server-only.
 *
 * ■ 使い方（書き込みハンドラはこの形以外を書かない）
 *
 *   export async function POST(request: Request) {
 *     return runWrite(request, "order_acceptance", "CREATE", async ({ ctx, body }) => {
 *       // ← ここで **lib の関数を呼ぶ**。prisma を直に触らない。
 *       const r = await createOrderAcceptance(...);
 *       return { status: 201, body: { number: r.number } };
 *     });
 *   }
 *
 * ■ この層が引き受けること
 *   - 認証・認可（`requireApiPermission`）とアクセス記録
 *   - **冪等キーの検査と応答の再生**（再送で 2 本目を採番させない）
 *   - JSON 本文の読み取り
 *
 * ■ この層が**引き受けないこと**
 *   業務規則。それは `lib/*` の関数が持ち、画面の Server Action と**同じ
 *   関数**でなければならない。ここで prisma を直に触ると、API と画面で
 *   規則が二重になり、いつか黙って食い違う（`scripts/check-api-gates.mjs`
 *   が機械で止める）。
 */

import "server-only";

import type { PermissionAction } from "@ckk/authz-core";
import type { ApiClientContext } from "./api-auth";
import { logApiAccess } from "./api-auth";
import { requireApiPermission } from "./api-authz";
import { instanceOf, problemResponse } from "./api-problem";
import {
  decideIdempotency,
  isValidIdempotencyKey,
  requestFingerprint,
} from "./api-write-core";
import { prisma } from "./db";

export interface WriteResult {
  status: number;
  body: unknown;
}

export interface WriteContext {
  ctx: ApiClientContext;
  /** 解釈済みの JSON 本文（本文が無ければ `{}`）。 */
  body: unknown;
  /** 生の本文（指紋の計算に使ったもの）。 */
  rawBody: string;
  request: Request;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * 書き込みの口を包む。
 *
 * **`Idempotency-Key` は必須。** 「付ければ安全、付けなければ危険」に
 * しない — いちばん雑な呼び出し側がいちばん危険な経路を通ることになる。
 */
export async function runWrite(
  request: Request,
  code: string,
  action: PermissionAction,
  handler: (c: WriteContext) => Promise<WriteResult>,
): Promise<Response> {
  const path = instanceOf(request);
  const gate = await requireApiPermission(request, code, action);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const key = request.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(key)) {
    return problemResponse({
      code: "invalid_request",
      detail:
        "An Idempotency-Key header is required on writes (8-255 printable ASCII characters).",
      instance: path,
    });
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    rawBody = "";
  }
  let body: unknown = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return problemResponse({
        code: "invalid_request",
        detail: "The request body is not valid JSON.",
        instance: path,
      });
    }
  }

  const fingerprint = requestFingerprint(request.method, path, rawBody);
  const stored = await prisma.apiIdempotencyKey
    .findUnique({
      where: { clientId_key: { clientId: ctx.clientId, key: key as string } },
      select: {
        requestHash: true,
        responseStatus: true,
        responseBody: true,
      },
    })
    .catch(() => null);

  const decision = decideIdempotency(stored, fingerprint);

  if (decision.kind === "conflict") {
    await logApiAccess({
      clientId: ctx.clientId,
      tokenId: ctx.tokenId,
      method: request.method,
      path,
      status: 422,
      denyReason: null,
      permissionCode: `${code}:${action}`,
      ip: ctx.ip,
    });
    return problemResponse({
      code: "invalid_request",
      status: 422,
      detail:
        "This Idempotency-Key was already used with a different request body.",
      instance: path,
    });
  }

  if (decision.kind === "replay") {
    // 再実行しない。**保存した応答をそのまま返す。**
    return new Response(decision.body, {
      status: decision.status,
      headers: { ...JSON_HEADERS, "idempotency-replayed": "true" },
    });
  }

  const result = await handler({ body, ctx, rawBody, request });
  const serialized = JSON.stringify(result.body);

  // 成功した書き込みだけを覚える。失敗は覚えない — 直して同じ鍵で
  // 送り直せるようにするため（失敗を覚えると、直しても永久に同じ誤りが返る）。
  if (result.status >= 200 && result.status < 300) {
    await prisma.apiIdempotencyKey
      .create({
        data: {
          clientId: ctx.clientId,
          key: key as string,
          requestHash: fingerprint,
          responseStatus: result.status,
          responseBody: serialized,
        },
      })
      .catch((e: unknown) => {
        // 競合（同じ鍵で同時に 2 本）は片方が勝てばよい。
        console.warn("[api-write] idempotency store failed", e);
      });
  }

  return new Response(serialized, {
    status: result.status,
    headers: JSON_HEADERS,
  });
}

/** 409（版が古い）。`If-Match` の判定は `api-write-core.ts` が持つ。 */
export function staleResponse(request: Request, currentEtag: string): Response {
  return new Response(
    JSON.stringify({
      type: "/problems/conflict",
      title: "Conflict",
      status: 409,
      code: "conflict",
      detail: "The resource changed since you read it. Re-read and retry.",
      instance: instanceOf(request),
    }),
    {
      status: 409,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        "cache-control": "no-store",
        etag: currentEtag,
      },
    },
  );
}

/** `If-Match` が無い書き込みを拒む応答。 */
export function ifMatchRequiredResponse(request: Request): Response {
  return problemResponse({
    code: "invalid_request",
    status: 428,
    detail:
      "An If-Match header is required. Send the ETag you read, or If-Match: * to overwrite deliberately.",
    instance: instanceOf(request),
  });
}
