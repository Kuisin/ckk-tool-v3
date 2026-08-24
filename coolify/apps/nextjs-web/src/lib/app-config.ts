import "server-only";

/**
 * app-config.ts — generic per-app configuration store.
 *
 * The whole "アプリ設定" framework persists to ONE table: `app.system_settings`
 * (key PK, value JSON, description, updated_by, updated_at — see
 * `_specs/tables.md`). Keys are namespaced `"<namespace>.<field>"` so any app
 * can keep arbitrary settings — including code strings (e.g. the 試算 custom
 * calculation) — without a schema change. Per-app adapters (e.g.
 * `system-settings.ts` for 試算) map their typed shape onto these keys.
 *
 * This is the single generic accessor; feature code should prefer a typed
 * adapter over reading raw keys.
 */

import { prisma } from "./db";

/** Read every stored value under `"<namespace>."` as a key→JSON map. */
export async function readConfigNamespace(
  namespace: string,
): Promise<Map<string, unknown>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: `${namespace}.` } },
  });
  return new Map(rows.map((r) => [r.key, r.value as unknown]));
}

/** Upsert a batch of fully-qualified keys in one transaction. */
export async function writeConfigValues(
  entries: Record<string, unknown>,
): Promise<void> {
  const ops = Object.entries(entries).map(([key, value]) =>
    prisma.systemSetting.upsert({
      where: { key },
      // Prisma's Json column accepts any JSON-serialisable value.
      create: { key, value: value as never },
      update: { value: value as never },
    }),
  );
  await prisma.$transaction(ops);
}
