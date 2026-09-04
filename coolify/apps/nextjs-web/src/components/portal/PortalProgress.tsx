"use client";

/**
 * 進捗の見せ方（バッジと段）。
 *
 * 社外に出す進捗は 5 段 + キャンセルで、**工程の粒度は出さない**
 * （lib/portal-progress-core.ts）。ここは色と並べ方だけを持つ。
 *
 * キャンセルは段ではない（進行の外）ので Stepper には流さず、注意として
 * 別に描く —— 進行中の見た目のまま「実は止まっていた」が一番困る。
 */

import { Alert, Badge, Stepper } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/useViewport";
import {
  PORTAL_PROGRESS_STEPS,
  type PortalProgress,
  portalProgressLabel,
  portalProgressStepIndex,
} from "@/lib/portal-progress-core";

export const PORTAL_PROGRESS_COLOR: Record<PortalProgress, string> = {
  RECEIVED: "gray",
  IN_PRODUCTION: "violet",
  READY: "blue",
  SHIPPED: "orange",
  DELIVERED: "green",
  CANCELLED: "red",
};

export function PortalProgressBadge({
  progress,
}: {
  progress: PortalProgress;
}) {
  const tr = useTranslations();
  return (
    <Badge color={PORTAL_PROGRESS_COLOR[progress]} size="sm" variant="light">
      {portalProgressLabel(progress, tr)}
    </Badge>
  );
}

export function PortalProgressSteps({
  progress,
}: {
  progress: PortalProgress;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const index = portalProgressStepIndex(progress);

  if (index < 0) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />}>
        {tr("portal.orders.cancelledNotice")}
      </Alert>
    );
  }

  return (
    // active は「達成済みの段数」（Mantine の規約）。いま居る段を進行中として
    // 描きたいので、段の番号をそのまま渡す。
    <Stepper
      active={index}
      orientation={isMobile ? "vertical" : "horizontal"}
      size="sm"
    >
      {PORTAL_PROGRESS_STEPS.map((step) => (
        <Stepper.Step key={step} label={portalProgressLabel(step, tr)} />
      ))}
    </Stepper>
  );
}
