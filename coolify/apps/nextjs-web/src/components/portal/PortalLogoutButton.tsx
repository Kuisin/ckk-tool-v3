"use client";

import { Button } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { portalLogout } from "@/app/(portal)/portal/logout-action";

export function PortalLogoutButton() {
  const tr = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      leftSection={<IconLogout size={14} />}
      loading={pending}
      onClick={() =>
        start(async () => {
          await portalLogout();
          router.replace("/portal/login");
        })
      }
      variant="default"
      w="fit-content"
    >
      {tr("common.logOut")}
    </Button>
  );
}
