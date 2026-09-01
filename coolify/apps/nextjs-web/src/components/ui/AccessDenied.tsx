/**
 * AccessDenied — 権限不足ページの標準表示（READ ゲート用）。
 *
 * requireAppRead()（lib/authz-page.tsx）が deny 時に返す本文。
 * settings/users で使っていた PageHeader + EmptyState(IconLock) パターンの共通化。
 */

import { IconLock } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export async function AccessDenied({
  title,
  breadcrumbs,
  message,
}: {
  title: string;
  breadcrumbs: (string | { label: string; href: string })[];
  message?: string;
}) {
  const tr = await getTranslations();
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} title={title} />
      <EmptyState
        icon={<IconLock size={28} />}
        message={message ?? tr("layout.appFlags.youDoNotHavePermissionTo")}
      />
    </>
  );
}
