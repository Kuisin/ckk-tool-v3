"use client";

/** 版の役割（プレビュー / 図面データ / 参考資料）と「最新」のバッジ。 */

import { Badge } from "@mantine/core";
import { useTranslations } from "next-intl";
import { DESIGN_FILE_ROLE_COLOR, type DesignFileRole } from "./model";

export function RoleBadge({
  role,
  latest,
}: {
  role?: DesignFileRole;
  latest?: boolean;
}) {
  const tr = useTranslations();
  if (latest) {
    return (
      <Badge color="green" variant="light">
        {tr("common.latest")}
      </Badge>
    );
  }
  if (!role) return null;
  return (
    <Badge color={DESIGN_FILE_ROLE_COLOR[role] ?? "gray"} variant="light">
      {tr(`enum.DESIGN_FILE_ROLE_LABEL.${role}`)}
    </Badge>
  );
}
