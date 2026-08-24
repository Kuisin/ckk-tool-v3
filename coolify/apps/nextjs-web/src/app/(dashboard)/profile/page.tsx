import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProfileView } from "@/components/profile/ProfileView";
import { effectiveMemberWhere } from "@/lib/approval-membership";
import { avatarUrl } from "@/lib/avatar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** プロフィール — 本人情報・メール（通知宛先）・パスワード・登録デバイス。 */
export default async function ProfilePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      username: true,
      displayName: true,
      avatarFileId: true,
      avatarThumbFileId: true,
      email: true,
      group: true,
      passwordHash: true,
      lastLoginAt: true,
      // 期間限定メンバーは期間内だけ「所属している」と出す
      approvalGroupMembers: {
        where: {
          group: { isActive: true },
          ...effectiveMemberWhere(new Date()),
        },
        select: { group: { select: { id: true, name: true } } },
      },
      pushSubscriptions: {
        orderBy: { createdAt: "desc" },
        select: { id: true, userAgent: true, createdAt: true },
      },
    },
  });

  return (
    <ProfileView
      user={{
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarFileId
          ? avatarUrl(userId, user.avatarFileId)
          : null,
        avatarThumbUrl: user.avatarThumbFileId
          ? avatarUrl(userId, user.avatarThumbFileId, "thumb")
          : null,
        email: user.email,
        group: user.group,
        hasPassword: Boolean(user.passwordHash),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        approvalGroups: user.approvalGroupMembers.map((m) => ({
          id: m.group.id,
          name: m.group.name,
        })),
        devices: user.pushSubscriptions.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
        })),
      }}
    />
  );
}
