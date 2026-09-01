"use client";

/**
 * ApprovalTargetField.tsx — 検査承認の宛先（グループ / カスタム）選択。
 *
 * CM02 フォームの承認フロー段（ApprovalFlowEditor の宛先トグル）と同じ形:
 * グループかカスタム（この検査表だけの承認者・複数可）のどちらか一方を選ぶ。
 * 両方未設定 = 誰でも検収できる。切り替えると反対側は必ず捨てる
 * （両方入った状態を作らない）。
 */

import {
  Group,
  Pill,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SearchSelect } from "@/components/ui/SearchSelect";

export interface ApproverOption {
  value: string;
  label: string;
}

export function ApprovalTargetField({
  groupOptions,
  groupId,
  onGroupChange,
  approvers,
  onApproversChange,
  onSearchApprovers,
}: {
  groupOptions: { value: string; label: string }[];
  groupId: string | null;
  onGroupChange: (v: string | null) => void;
  approvers: ApproverOption[];
  onApproversChange: (v: ApproverOption[]) => void;
  onSearchApprovers: (query: string) => Promise<ApproverOption[]>;
}) {
  const tr = useTranslations();
  const [mode, setMode] = useState<"group" | "custom">(
    approvers.length > 0 ? "custom" : "group",
  );

  return (
    <Stack gap={4}>
      <Text fw={500} size="sm">
        {tr("common.inspectionApprovalRecipient")}
      </Text>
      <Group gap="sm" wrap="wrap">
        <SegmentedControl
          data={[
            { value: "group", label: tr("common.group") },
            { value: "custom", label: tr("common.custom") },
          ]}
          onChange={(v) => {
            const next = v as "group" | "custom";
            setMode(next);
            // 切り替えたら反対側は必ず捨てる（両方入った状態を作らない）。
            if (next === "custom") onGroupChange(null);
            else onApproversChange([]);
          }}
          value={mode}
        />
        {mode === "group" ? (
          <Select
            clearable
            data={groupOptions}
            onChange={onGroupChange}
            placeholder={tr("common.select")}
            value={groupId}
            w={260}
          />
        ) : (
          <Stack gap={4} style={{ flex: 1, minWidth: 260 }}>
            <SearchSelect
              onChange={(value, option) => {
                if (!value || !option) return;
                if (approvers.some((a) => a.value === value)) return;
                onApproversChange([
                  ...approvers,
                  { value, label: option.label },
                ]);
              }}
              onSearch={async (q) => {
                const rows = await onSearchApprovers(q);
                return rows.filter(
                  (r) => !approvers.some((a) => a.value === r.value),
                );
              }}
              placeholder={tr("common.searchAndAdd")}
              storageKey="inspection-template-approver"
              value={null}
            />
            {approvers.length > 0 && (
              <Group gap={4}>
                {approvers.map((a) => (
                  <Pill
                    key={a.value}
                    onRemove={() =>
                      onApproversChange(
                        approvers.filter((x) => x.value !== a.value),
                      )
                    }
                    withRemoveButton
                  >
                    {a.label}
                  </Pill>
                ))}
              </Group>
            )}
          </Stack>
        )}
      </Group>
      <Text c="dimmed" size="xs">
        {tr("master.inspectionTemplates.theTargetCanBeAnApproval")}
      </Text>
    </Stack>
  );
}
