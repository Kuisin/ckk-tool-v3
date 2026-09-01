"use client";

/**
 * ShareGrantsView — 共有設定を読む形で出す（共有タブの閲覧モード）。
 *
 * 編集用の ShareGrantsPanel は 1 行が Select 3 つなので、いま誰に何を許して
 * いるのかを**読む**用途には向かない。ここは値だけを並べる。
 *
 * 「共有が 0 件 = 非公開」は既定の挙動そのものなので、空のときこそはっきり
 * 出す（作成者と管理者にしか見えていない、という事実に気づける必要がある）。
 */

import { Alert, Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/useViewport";
import type { ShareGrantView } from "@/lib/share-grants";
import {
  SHARE_LEVEL_LABEL,
  SHARE_SUBJECT_LABEL,
} from "@/lib/share-grants-core";
import type { ConditionFieldOption } from "./ShareConditionEditor";

/** 条件（「この項目がこの値の回答だけ」）を 1 行の文にする。 */
function conditionText(
  grant: ShareGrantView,
  fields: ConditionFieldOption[],
): string | null {
  if (!grant.conditionFieldKey) return null;
  const field = fields.find((f) => f.key === grant.conditionFieldKey);
  const label = field?.label ?? grant.conditionFieldKey;
  // 保存時のラベルが残っていればそれを使う（項目の選択肢が後から変わっても
  // 「何を指していたか」が読めるようにするため）。
  const values =
    grant.conditionLabels && grant.conditionLabels.length > 0
      ? grant.conditionLabels
      : (grant.conditionValues ?? []);
  if (values.length === 0) return null;
  return `${label} が ${values.join(" / ")} の回答だけ`;
}

export function ShareGrantsView({
  grants,
  conditionFields = [],
}: {
  grants: ShareGrantView[];
  conditionFields?: ConditionFieldOption[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();

  const notice = (
    <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
      {tr("forms.shareGrantsView.aFormWithNoSharesSet")}
    </Alert>
  );

  if (grants.length === 0) {
    return (
      <Stack gap="sm">
        {notice}
        <Text c="dimmed" size="sm">
          {tr("common.notSharedWithAnyonePrivate")}
        </Text>
      </Stack>
    );
  }

  const rows = grants.map((g) => ({
    grant: g,
    subject:
      g.subjectType === "EVERYONE"
        ? tr("common.everyoneWhoCanLogIn")
        : (g.subjectLabel ?? g.subjectId ?? "—"),
    condition: conditionText(g, conditionFields),
  }));

  return (
    <Stack gap="sm">
      {notice}
      {isMobile ? (
        // スマホは 4 列の表を諦めて 1 行 = 1 カード（design.md §20.2）。
        <Stack gap="sm">
          {rows.map(({ grant, subject, condition }) => (
            <Paper key={grant.id} p="sm" radius="sm" withBorder>
              <Stack gap={4}>
                <Group gap="xs">
                  <Badge color="gray" variant="light">
                    {SHARE_SUBJECT_LABEL[grant.subjectType]}
                  </Badge>
                  <Text fw={600} size="sm">
                    {subject}
                  </Text>
                </Group>
                <Group gap="xs">
                  <Text size="sm">{SHARE_LEVEL_LABEL[grant.level]}</Text>
                  {grant.notifyOnComplete && (
                    <Badge color="indigo" variant="light">
                      {tr("common.completionNotice")}
                    </Badge>
                  )}
                </Group>
                {condition && (
                  <Text c="dimmed" size="xs">
                    {condition}
                  </Text>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 100 }}>{tr("common.target")}</Table.Th>
              <Table.Th>{tr("common.counterparty")}</Table.Th>
              <Table.Th style={{ width: 200 }}>
                {tr("common.permission")}
              </Table.Th>
              <Table.Th>{tr("forms.shareGrantsView.condition")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ grant, subject, condition }) => (
              <Table.Tr key={grant.id}>
                <Table.Td>
                  <Badge color="gray" variant="light">
                    {SHARE_SUBJECT_LABEL[grant.subjectType]}
                  </Badge>
                </Table.Td>
                <Table.Td>{subject}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Text size="sm">{SHARE_LEVEL_LABEL[grant.level]}</Text>
                    {grant.notifyOnComplete && (
                      <Badge color="indigo" variant="light">
                        {tr("common.completionNotice")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  {condition ?? (
                    <Text c="dimmed" size="sm">
                      {tr("forms.shareGrantsView.allResponses")}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
