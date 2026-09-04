"use client";

import { Button } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { portalLogout } from "@/app/(portal)/portal/logout-action";

/**
 * ログアウト。ヘッダー（`compact`）と Drawer の両方に置く。
 *
 * ヘッダーでは行き先の並びに混ざるので `variant="subtle"` の小さいボタンにし、
 * Drawer では全幅の普通のボタンにする（触る面積を確保する）。
 */
export function PortalLogoutButton({ compact = false }: { compact?: boolean }) {
  const tr = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      fullWidth={!compact}
      leftSection={<IconLogout size={14} />}
      loading={pending}
      onClick={() =>
        start(async () => {
          await portalLogout();
          router.replace("/portal/login");
        })
      }
      size={compact ? "compact-sm" : "sm"}
      variant={compact ? "subtle" : "default"}
      w={compact ? "fit-content" : undefined}
    >
      {tr("common.logOut")}
    </Button>
  );
}
