import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProfileView } from "@/components/profile/ProfileView";
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
      email: true,
      group: true,
      passwordHash: true,
      lastLoginAt: true,
      approvalGroupMembers: {
        where: { isActive: true, group: { isActive: true } },
        select: { group: { select: { type: true, name: true } } },
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
        email: user.email,
        group: user.group,
        hasPassword: Boolean(user.passwordHash),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        approvalGroups: user.approvalGroupMembers.map((m) => ({
          type: m.group.type,
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
