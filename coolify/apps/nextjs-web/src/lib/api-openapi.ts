/**
 * api-openapi.ts — OpenAPI 3.1 文書の組み立て（純粋）。
 *
 * `api-resources.ts` の登録簿から作る。**手書きの文書を別に持たない** —
 * 2 つ書けば必ず離れていくので、口の一覧・権限・並び順は登録簿 1 本にする。
 *
 * 依存は増やしていない（zod 4 の `z.toJSONSchema()` があるが、応答の
 * 全フィールドまで zod で二重定義すると DTO と離れるので使っていない。
 * ここが約束するのは**封筒・引数・誤り・どの口に何の権限が要るか**まで）。
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api-pagination-core";
import { PROBLEM_STATUS, PROBLEM_TITLES } from "./api-problem-core";
import { API_RESOURCES } from "./api-resources";

const DESCRIPTION = `Read-only access to CKK business data.

**Authentication** — \`Authorization: Bearer <token>\`. Every failure returns the
same 401 body; the reason is recorded server-side only, so that the response
cannot be used to probe whether a token exists.

**Paging** — keyset, never OFFSET. Follow \`page.nextCursor\` until
\`page.hasMore\` is false. Cursors are opaque; do not parse them.

**Incremental sync** — keep \`syncedAt\` from the response and pass it back as
\`?updatedSince=\`. The bound is inclusive, so a row may be delivered more than
once: **process deliveries idempotently**.

**Deletions** are invisible to \`updatedSince\`. Poll \`/deletions\` as well.

Values are returned raw: enum values (not labels), multilingual fields as
\`{ ja, en, ... }\` objects, timestamps as RFC 3339 UTC. There is no viewer, so
nothing is localized or formatted for display.`;

function listParameters() {
  return [
    {
      name: "limit",
      in: "query",
      description: `Rows per page (default ${DEFAULT_PAGE_SIZE}, capped at ${MAX_PAGE_SIZE}).`,
      required: false,
      schema: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE },
    },
    {
      name: "cursor",
      in: "query",
      description:
        "Opaque cursor from the previous response's page.nextCursor. A malformed cursor returns 400 rather than silently restarting.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "updatedSince",
      in: "query",
      description:
        "RFC 3339 timestamp — normally the syncedAt of the previous sync. Inclusive bound.",
      required: false,
      schema: { type: "string", format: "date-time" },
    },
  ];
}

function problemSchema() {
  return {
    type: "object",
    required: ["type", "title", "status", "code"],
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      status: { type: "integer" },
      code: { type: "string", enum: Object.keys(PROBLEM_TITLES) },
      detail: { type: "string" },
      instance: { type: "string" },
    },
  };
}

function envelopeSchema() {
  return {
    type: "object",
    required: ["data", "page", "syncedAt"],
    properties: {
      data: { type: "array", items: { type: "object" } },
      page: {
        type: "object",
        required: ["nextCursor", "hasMore"],
        properties: {
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" },
        },
      },
      syncedAt: {
        type: "string",
        format: "date-time",
        description:
          "The database clock at read time. Pass this back as ?updatedSince= next time — never compute it from the caller's clock.",
      },
    },
  };
}

const ERROR_RESPONSES = {
  "400": {
    description: `${PROBLEM_TITLES.invalid_cursor} (${PROBLEM_STATUS.invalid_cursor})`,
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/Problem" },
      },
    },
  },
  "401": {
    description:
      "Unauthorized. Identical for every cause (missing, malformed, unknown, revoked, expired, IP-denied, suspended).",
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/Problem" },
      },
    },
  },
  "403": {
    description: "Forbidden. States the permission code and action required.",
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/Problem" },
      },
    },
  },
  "429": {
    description: "Too many authentication failures from this source address.",
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/Problem" },
      },
    },
  },
} as const;

export function buildOpenApiDocument(version: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    "/health": {
      get: {
        summary: "Liveness. No authentication, no database access.",
        security: [],
        responses: {
          "200": {
            description: "The service is up.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", enum: ["ok"] } },
                },
              },
            },
          },
          "404": { description: "The API is not enabled in this environment." },
        },
      },
    },
    "/me": {
      get: {
        summary:
          "The calling client's identity and effective permission codes. Use it to diagnose a 403 without a support ticket.",
        responses: {
          "200": { description: "The caller." },
          ...ERROR_RESPONSES,
        },
      },
    },
    "/deletions": {
      get: {
        summary:
          "Rows that were deleted. updatedSince cannot see deletions, so poll this too. Out-of-band psql deletions are not observable here.",
        parameters: [
          {
            name: "sinceEventId",
            in: "query",
            description:
              "lastEventId from the previous response. Monotonic integer.",
            required: false,
            schema: { type: "string" },
          },
          listParameters()[0],
        ],
        responses: {
          "200": {
            description: "Deletion events the caller is allowed to see.",
          },
          ...ERROR_RESPONSES,
        },
      },
    },
  };

  for (const r of API_RESOURCES) {
    paths[r.path] = {
      get: {
        summary: r.summary,
        description: [
          `Requires \`${r.permission}:READ\`.`,
          `Row scope: ${r.scope}`,
          `Ordered by \`${r.orderField}\` then ${
            r.tiebreak === "doc" ? "`(yearMonth, seq)`" : "`id`"
          }.`,
        ].join("\n\n"),
        parameters: listParameters(),
        responses: {
          "200": {
            description: "A page of results.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Envelope" },
              },
            },
          },
          ...ERROR_RESPONSES,
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "CKK external API",
      version,
      description: DESCRIPTION,
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      schemas: {
        Problem: problemSchema(),
        Envelope: envelopeSchema(),
      },
    },
    paths,
  };
}
