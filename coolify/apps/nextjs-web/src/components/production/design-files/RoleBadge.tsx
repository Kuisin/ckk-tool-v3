"use client";

/** 版の役割（プレビュー / 図面データ / 参考資料）と「最新」のバッジ。 */

import { Badge } from "@mantine/core";
import { useTr } from "@/hooks/useTr";
import {
  DESIGN_FILE_ROLE_COLOR,
  DESIGN_FILE_ROLE_LABEL,
  type DesignFileRole,
} from "./model";

export function RoleBadge({
  role,
  latest,
}: {
  role?: DesignFileRole;
  latest?: boolean;
}) {
  const tr = useTr();
  if (latest) {
    return (
      <Badge color="green" variant="light">
        {tr("最新")}
      </Badge>
    );
  }
  if (!role) return null;
  return (
    <Badge color={DESIGN_FILE_ROLE_COLOR[role] ?? "gray"} variant="light">
      {DESIGN_FILE_ROLE_LABEL[role] ?? role}
    </Badge>
  );
}
