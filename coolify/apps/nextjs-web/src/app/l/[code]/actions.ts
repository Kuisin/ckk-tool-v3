"use server";

/**
 * Server Action — 外部リンク確認ページの「続行」。
 *
 * **ここでもう一度 resolve する**のが要点。ページ表示時に判定済みでも、
 * その後にブラックリストが更新されているかもしれないし、フォームだけを直接
 * POST されることもある。遷移直前の状態で判定し直してから送り出す。
 */

import { redirect } from "next/navigation";
import { recordShortLinkHit, resolveShortLink } from "@/lib/link-index";

export async function followShortLinkAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const resolved = await resolveShortLink(code);

  // ブロック済み・不明コードは確認ページへ戻す（そこで理由を表示する）。
  if (resolved.status !== "ok") redirect(`/l/${encodeURIComponent(code)}`);

  await recordShortLinkHit(code);
  redirect(resolved.url);
}
