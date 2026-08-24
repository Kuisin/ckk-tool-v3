import "server-only";

/**
 * profile.ts — ログイン中ユーザーの完全なプロフィール（server-only）.
 *
 * セッション（Auth.js）→ app.users → directory.employee_directory（AD 同期）を
 * 結合し、表示名・所属・役職・メール等の完全なプロフィールを返す。SSO ユーザーで
 * employee_directory 行が無い場合は取得できた範囲（セッション由来）で埋める。
 */

import { auth } from "@/auth";
import { avatarUrl } from "./avatar";
import { prisma } from "./db";

export interface UserProfile {
  displayName: string;
  username: string;
  /** アバターのイニシャル（表示名の先頭 2 文字）。写真が無いときの代替。 */
  initials: string;
  email: string | null;
  department: string | null;
  title: string | null;
  company: string | null;
  office: string | null;
  phone: string | null;
  /** 写真（大 — プロフィール・ホーム用）。 */
  avatarUrl: string | null;
  /** 写真（小 — ヘッダー・一覧・履歴用）。 */
  avatarThumbUrl: string | null;
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
    // 写真はアプリ内でアップロードしたもの（AD からは取得しない）。
    avatarUrl:
      user?.id && user.avatarFileId
        ? avatarUrl(user.id, user.avatarFileId)
        : null,
    // サムネイル未生成の古い写真は大サイズで代用（配信側もフォールバック）。
    avatarThumbUrl: user?.id
      ? user.avatarThumbFileId
        ? avatarUrl(user.id, user.avatarThumbFileId, "thumb")
        : user.avatarFileId
          ? avatarUrl(user.id, user.avatarFileId)
          : null
      : null,
  };
}

/**
 * 初期パスワードのまま使われていないか（`users.password_change_required`）。
 *
 * 初期管理者アカウントは既定パスワードで作られるため、変更するまで他の画面を
 * 開かせない。ダッシュボードのレイアウトがこれを見て /password-change へ飛ばす。
 * 判定は毎回 DB を引く — セッション（JWT）に持たせるとパスワード変更後も
 * 古い値が残り、いつまでも変更画面に閉じ込められる。
 */
export async function isPasswordChangeRequired(): Promise<boolean> {
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)
    ?.username;
  if (!username) return false;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { passwordChangeRequired: true },
  });
  return user?.passwordChangeRequired ?? false;
}
