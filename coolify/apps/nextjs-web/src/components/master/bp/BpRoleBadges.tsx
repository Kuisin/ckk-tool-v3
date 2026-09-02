"use client";

/**
 * BpRoleBadges.tsx — 取引先に付与されたロールのバッジ列（一覧・詳細で共通）。
 *
 * 仕入先・外注先ロールは bp_vendor_attrs.vendor_type で「仕入先」「外注先」に
 * 分かれるので、分かっていればそちらを表示する。
 */

import { Badge, Group, Text } from "@mantine/core";
import { useLocale, useTranslations } from "next-intl";
import { BP_ROLE_COLOR, bpRoleLabel, vendorTypeLabel } from "@/lib/enum-labels";
export function BpRoleBadges({
  roles,
  vendorType,
}: {
  roles: string[];
  vendorType?: string | null;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  if (roles.length === 0) {
    return (
      <Text c="dimmed" size="xs">
        {tr("master.bp.noRoleSet")}
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
            ? (vendorTypeLabel(vendorType, locale) ?? bpRoleLabel(role, locale))
            : (bpRoleLabel(role, locale) ?? role)}
        </Badge>
      ))}
    </Group>
  );
}
