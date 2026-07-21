import "server-only";

/**
 * profile.ts — ログイン中ユーザーの完全なプロフィール（server-only）.
 *
 * セッション（Auth.js）→ app.users → directory.employee_directory（AD 同期）を
 * 結合し、表示名・所属・役職・メール等の完全なプロフィールを返す。SSO ユーザーで
 * employee_directory 行が無い場合は取得できた範囲（セッション由来）で埋める。
 */

import { auth } from "@/auth";
import { prisma } from "./db";

export interface UserProfile {
  displayName: string;
  username: string;
  /** アバターのイニシャル（表示名の先頭 2 文字）。 */
  initials: string;
  email: string | null;
  department: string | null;
  title: string | null;
  company: string | null;
  office: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

function initialsOf(name: string, fallback: string): string {
  const compact = name.replace(/\s+/g, "");
  return compact.slice(0, 2) || fallback.slice(0, 2);
}

/** ログイン中ユーザーの完全プロフィール。未ログインは null。 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const session = await auth();
  const su = session?.user as
    | { username?: string; name?: string | null; email?: string | null }
    | undefined;
  const username = su?.username;
  if (!username) return null;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { employee: true },
  });
  const emp = user?.employee ?? null;
  const displayName =
    user?.displayName || emp?.displayName || su?.name || username;

  return {
    displayName,
    username,
    initials: initialsOf(displayName, username),
    email: user?.email ?? emp?.email ?? su?.email ?? null,
    department: emp?.department ?? null,
    title: emp?.title ?? null,
    company: emp?.company ?? null,
    office: emp?.office ?? null,
    phone: emp?.phone ?? emp?.mobile ?? null,
    avatarUrl: null,
  };
}
