"use client";

import { Button } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { portalLogout } from "@/app/(portal)/portal/logout-action";
import { useTr } from "@/hooks/useTr";

export function PortalLogoutButton() {
  const tr = useTr();
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
      {tr("ログアウト")}
    </Button>
  );
}
