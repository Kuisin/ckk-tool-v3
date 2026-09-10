/**
 * api-clients-admin.ts — SY0I（API クライアント）の読み書き。server-only.
 *
 * ここが**唯一の発行口**。だから「有効なトークンは 2 本まで」を DB の制約では
 * なくこの層で守る（部分 unique では N 本を表現できないし、portal-auth.ts が
 * portal_sessions で同じ判断をしている）。
 *
 * ■ 生のトークンが通る道は 1 本だけ
 * `issueToken()` の戻り値にだけ現れる。DB にも監査行にも `revalidate` の
 * payload にも入れない（`/api/intake/inbound` の「トークンは絶対に載せない」と
 * 同じ規約）。呼び出し側は 1 度画面に出して捨てる。
 */

import "server-only";

import { prisma } from "./db";
import { mintToken, tokenLast4 } from "./token-core";

/** 1 クライアントが同時に持てる有効トークンの数。差し替えを無停止でやるため 2。 */
export const MAX_ACTIVE_TOKENS = 2;

export interface ApiClientTokenRow {
  id: string;
  last4: string;
  label: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface ApiClientRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  allowedCidrs: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  userId: string;
  username: string;
  /** 割り当てられているロール名（実際に何を読めるかはこれで決まる）。 */
  roles: string[];
  activeTokenCount: number;
  tokens: ApiClientTokenRow[];
}

const TOKEN_SELECT = {
  id: true,
  last4: true,
  label: true,
  expiresAt: true,
  lastUsedAt: true,
  useCount: true,
  createdAt: true,
  revokedAt: true,
} as const;

const CLIENT_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      roleAssignments: {
        where: { isActive: true },
        select: { role: { select: { rolename: true } } },
      },
    },
  },
  tokens: { orderBy: { createdAt: "desc" as const }, select: TOKEN_SELECT },
} as const;

type Row = Awaited<ReturnType<typeof findRow>>;

function findRow(id: string) {
  return prisma.apiClient.findUnique({
    where: { id },
    include: CLIENT_INCLUDE,
  });
}

/** 有効なトークンか（失効しておらず、期限内）。判定はここ 1 か所。 */
export function isTokenActive(
  t: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (t.revokedAt !== null) return false;
  return t.expiresAt === null || t.expiresAt.getTime() > now.getTime();
}

function map(r: NonNullable<Row>): ApiClientRow {
  const now = new Date();
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.isActive,
    expiresAt: r.expiresAt,
    allowedCidrs: r.allowedCidrs,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
    revokedAt: r.revokedAt,
    userId: r.user.id,
    username: r.user.username,
    roles: r.user.roleAssignments.map((a) => a.role.rolename).sort(),
    activeTokenCount: r.tokens.filter((t) => isTokenActive(t, now)).length,
    tokens: r.tokens,
  };
}

export async function listApiClients(): Promise<ApiClientRow[]> {
  const rows = await prisma.apiClient.findMany({
    orderBy: [{ revokedAt: "asc" }, { name: "asc" }],
    include: CLIENT_INCLUDE,
  });
  return rows.map(map);
}

export async function getApiClient(id: string): Promise<ApiClientRow | null> {
  const row = await findRow(id);
  return row ? map(row) : null;
}

/** クライアント名から backing user の username を作る（表示と突合のためだけ）。 */
export function apiUsername(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `api:${slug || "client"}`;
}

export interface CreateApiClientInput {
  name: string;
  description?: string | null;
  allowedCidrs?: string[];
  expiresAt?: Date | null;
  createdBy: string;
}

/**
 * クライアントと backing user を 1 トランザクションで作る。
 *
 * **`isActive` は既定の false のまま**。作っただけでは何も通らない
 * （有効化は特権操作 `api_client.activate`）。ロールもここでは付けない —
 * それは SY01 の変更依頼（`user_admin`）の仕事で、身元を作る人と権限を
 * 与える人を分けるための線引き。
 */
export async function createApiClient(
  input: CreateApiClientInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        group: "SYSTEM",
        username: apiUsername(input.name),
        displayName: input.name,
        isActive: true,
      },
      select: { id: true },
    });
    const client = await tx.apiClient.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        userId: user.id,
        allowedCidrs: input.allowedCidrs ?? [],
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy,
      },
      select: { id: true },
    });
    return { id: client.id };
  });
}

export type IssueTokenResult =
  | { ok: true; raw: string; last4: string; tokenId: string }
  | { ok: false; reason: "NOT_FOUND" | "REVOKED" | "TOO_MANY" };

/**
 * トークンを 1 本発行する。**戻り値の `raw` が生値の唯一の出口。**
 *
 * 上限（MAX_ACTIVE_TOKENS）はトランザクションの中で数える — 同時に 2 回
 * 押されても 3 本にならないように。
 */
export async function issueToken(
  clientId: string,
  opts: { label?: string | null; expiresAt?: Date | null; createdBy: string },
): Promise<IssueTokenResult> {
  const { raw, hash } = mintToken();
  const now = new Date();

  try {
    const tokenId = await prisma.$transaction(async (tx) => {
      const client = await tx.apiClient.findUnique({
        where: { id: clientId },
        select: { id: true, revokedAt: true, tokens: { select: TOKEN_SELECT } },
      });
      if (!client) throw new Error("NOT_FOUND");
      if (client.revokedAt !== null) throw new Error("REVOKED");

      const active = client.tokens.filter((t) => isTokenActive(t, now)).length;
      if (active >= MAX_ACTIVE_TOKENS) throw new Error("TOO_MANY");

      const row = await tx.apiClientToken.create({
        data: {
          clientId,
          tokenHash: hash,
          last4: tokenLast4(raw),
          label: opts.label ?? null,
          expiresAt: opts.expiresAt ?? null,
          createdBy: opts.createdBy,
        },
        select: { id: true },
      });
      return row.id;
    });
    return { ok: true, raw, last4: tokenLast4(raw), tokenId };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "NOT_FOUND" || m === "REVOKED" || m === "TOO_MANY") {
      return { ok: false, reason: m };
    }
    throw e;
  }
}

export async function revokeToken(
  tokenId: string,
  revokedBy: string,
): Promise<void> {
  await prisma.apiClientToken.updateMany({
    where: { id: tokenId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy },
  });
}

/** 有効化 / 無効化。**無効化は承認が要らない**（アクセスを減らす操作）。 */
export async function setApiClientActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await prisma.apiClient.update({ where: { id }, data: { isActive } });
}

/**
 * クライアントごと取り消す。トークンも全部失効させ、backing user も止める
 * （3 つのうち 1 つでも生きていると「取り消した」と言えない）。
 */
export async function revokeApiClient(
  id: string,
  revokedBy: string,
  reason: string | null,
): Promise<void> {
  const now = new Date();
  const client = await prisma.apiClient.findUnique({
    where: { id },
    select: { userId: true },
  });
  await prisma.$transaction([
    prisma.apiClientToken.updateMany({
      where: { clientId: id, revokedAt: null },
      data: { revokedAt: now, revokedBy },
    }),
    prisma.apiClient.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: now,
        revokedBy,
        revokedReason: reason,
      },
    }),
    ...(client
      ? [
          prisma.user.update({
            where: { id: client.userId },
            data: { isActive: false },
          }),
        ]
      : []),
  ]);
}

export interface UpdateApiClientInput {
  description?: string | null;
  allowedCidrs?: string[];
  expiresAt?: Date | null;
}

export async function updateApiClient(
  id: string,
  input: UpdateApiClientInput,
): Promise<void> {
  await prisma.apiClient.update({ where: { id }, data: input });
}
