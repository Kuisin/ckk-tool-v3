import "server-only";

/**
 * data.ts — フォーム画面（CM02）のデータソース。
 * ページはここが返した素の値を "use client" のビューへ渡すだけにする。
 */

import type { RoleOption } from "@/components/forms/ShareGrantsPanel";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";
import { localized } from "@/lib/format";

/** 共有先に指定できるロール（system ロールも含む — 管理者へ配ることがある）。 */
export async function fetchRoleOptions(): Promise<RoleOption[]> {
  try {
    const rows = await prisma.role.findMany({
      orderBy: { id: "asc" },
      select: { id: true, displayName: true, rolename: true },
    });
    return rows.map((r) => ({
      value: String(r.id),
      label: localized(r.displayName as LocalizedText | null) || r.rolename,
    }));
  } catch {
    return [];
  }
}
