import "server-only";

/**
 * match-aliases.ts — 学習した照合名（app.match_aliases）の読み書き。server-only.
 *
 * 「この表記はこのマスタのことだ」という人の判断を貯め、次の取込で使う。
 * 何を学習するかの判断は lib/match-alias-core（純ロジック・テスト付き）。
 *
 * **1 表記 = 1 マスタ**（unique(target_type, alias_key)）。同じ表記を別の
 * マスタへ結び直したら upsert でその行が移る（最後の訂正が勝つ）。だから
 * 引く側は 1 件引くだけでよく、曖昧さの判断が要らない。
 */

import { prisma } from "./db";
import {
  type AliasLearning,
  aliasKeyFor,
  type MatchAliasTarget,
} from "./match-alias-core";
import { label } from "./messages";

/**
 * 学習を保存する（best-effort）。
 *
 * 呼び出し元は書類の保存 — **ここで失敗しても保存は成功させる**。学習は
 * あくまで次回を楽にするための副産物で、これが理由で人の作業を止めない。
 */
export async function saveAliasLearnings(
  learnings: readonly AliasLearning[],
  actorId: string | null,
): Promise<void> {
  for (const l of learnings) {
    try {
      await prisma.matchAlias.upsert({
        where: {
          targetType_aliasKey: {
            targetType: l.targetType,
            aliasKey: l.aliasKey,
          },
        },
        create: {
          targetType: l.targetType,
          targetId: l.targetId,
          alias: l.alias,
          aliasKey: l.aliasKey,
          createdBy: actorId,
        },
        // 付け替え（別マスタへ結び直した）と、表記そのものの上書き。
        // hitCount は「この表記で自動確定した回数」なので、ここでは触らない。
        update: {
          targetId: l.targetId,
          alias: l.alias,
          lastSeenAt: new Date(),
        },
      });
    } catch (e) {
      console.error(
        label(
          "api.matchAliases.failedToSaveLearning",
          "ja",
          "[match-aliases] 学習の保存に失敗 {targetType}/{targetId}",
          { targetType: l.targetType, targetId: l.targetId },
        ),
        e,
      );
    }
  }
}

/** 学習済みの結び付き 1 件。 */
export interface AliasHit {
  targetId: string;
  /** 登録されている表記（画面に「なぜこれなのか」を出すため）。 */
  alias: string;
}

/**
 * 印字された表記 → 学習済みのマスタ（1 件 or なし）。
 *
 * 正規化キーで引くので、覚えたときと全角/半角・記号が違っても当たる。
 * 見つかった行の hitCount を進めるのは呼び出し側の任意（noteAliasHit）。
 */
export async function findAlias(
  targetType: MatchAliasTarget,
  rawText: string | null | undefined,
): Promise<AliasHit | null> {
  const text = rawText?.trim();
  if (!text) return null;
  const aliasKey = aliasKeyFor(targetType, text);
  if (!aliasKey) return null;
  const row = await prisma.matchAlias.findUnique({
    where: { targetType_aliasKey: { targetType, aliasKey } },
    select: { targetId: true, alias: true },
  });
  return row ? { targetId: row.targetId, alias: row.alias } : null;
}

/**
 * 「この表記で当たった」を記録する（best-effort）。
 * 育っている表記と、覚えたきり使われていない表記を後から見分けるため。
 */
export async function noteAliasHit(
  targetType: MatchAliasTarget,
  aliasKey: string,
): Promise<void> {
  try {
    await prisma.matchAlias.update({
      where: { targetType_aliasKey: { targetType, aliasKey } },
      data: { hitCount: { increment: 1 }, lastSeenAt: new Date() },
    });
  } catch {
    // 記録できなくても突合の結果は変わらない。
  }
}

/**
 * マスタ id → 学習済み表記の一覧。突合プールの照合キーに混ぜて使う
 * （完全一致では拾えない「前方一致・一部一致」も学習分から効かせるため）。
 */
export async function aliasesByTarget(
  targetType: MatchAliasTarget,
  targetIds?: readonly string[],
): Promise<Map<string, string[]>> {
  const rows = await prisma.matchAlias.findMany({
    where: {
      targetType,
      ...(targetIds ? { targetId: { in: [...targetIds] } } : {}),
    },
    select: { targetId: true, alias: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.targetId);
    if (list) list.push(r.alias);
    else map.set(r.targetId, [r.alias]);
  }
  return map;
}
