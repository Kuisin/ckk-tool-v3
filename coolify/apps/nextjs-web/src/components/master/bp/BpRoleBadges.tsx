"use client";

/**
 * BpRoleBadges.tsx — 取引先に付与されたロールのバッジ列（一覧・詳細で共通）。
 *
 * 仕入先・外注先ロールは bp_vendor_attrs.vendor_type で「仕入先」「外注先」に
 * 分かれるので、分かっていればそちらを表示する。
 */

import { Badge, Group, Text } from "@mantine/core";
import {
  BP_ROLE_COLOR,
  BP_ROLE_LABEL,
  VENDOR_TYPE_LABEL,
} from "@/lib/enum-labels";

export function BpRoleBadges({
  roles,
  vendorType,
}: {
  roles: string[];
  vendorType?: string | null;
}) {
  if (roles.length === 0) {
    return (
      <Text c="dimmed" size="xs">
        ロール未設定
      </Text>
    );
  }
  return (
    <Group gap={4} wrap="wrap">
      {roles.map((role) => (
        <Badge
          color={BP_ROLE_COLOR[role] ?? "gray"}
          key={role}
          size="sm"
          variant="light"
        >
          {role === "VENDOR" && vendorType
            ? (VENDOR_TYPE_LABEL[vendorType] ?? BP_ROLE_LABEL[role])
            : (BP_ROLE_LABEL[role] ?? role)}
        </Badge>
      ))}
    </Group>
  );
}
