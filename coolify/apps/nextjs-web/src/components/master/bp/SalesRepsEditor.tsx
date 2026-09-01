"use client";

/**
 * SalesRepsEditor.tsx — 顧客の営業担当一覧（app.bp_sales_reps）の編集。
 *
 * 1 顧客に複数登録でき、書類（見積書・注文請書 …）の営業担当はこの一覧から
 * 選ぶ。ラジオで選んだ 1 名が主担当 = 新規書類の既定値（DB 側も顧客あたり
 * 1 名に制限）。取引先フォームの「顧客情報」セクションからだけ使う。
 */

import { ActionIcon, Group, Radio, Select, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { SecondaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import type { Option } from "@/lib/mock";

export interface SalesRepFormRow {
  userId: string;
  isPrimary: boolean;
}

export function SalesRepsEditor({
  value,
  onChange,
  options,
  error,
}: {
  value: SalesRepFormRow[];
  onChange: (rows: SalesRepFormRow[]) => void;
  /** 選べるユーザー（有効な社員アカウント）。 */
  options: Option[];
  error?: string;
}) {
  const tr = useTr();
  const setPrimary = (userId: string) =>
    onChange(value.map((r) => ({ ...r, isPrimary: r.userId === userId })));

  const setUser = (index: number, userId: string | null) =>
    onChange(
      value.map((r, i) => (i === index ? { ...r, userId: userId ?? "" } : r)),
    );

  const remove = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    // 主担当を消したら先頭を繰り上げる（既定値が引けない状態を作らない）。
    if (next.length > 0 && !next.some((r) => r.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    onChange(next);
  };

  const add = () =>
    onChange([...value, { userId: "", isPrimary: value.length === 0 }]);

  return (
    <Stack gap="xs">
      {value.length === 0 ? (
        <Text c="dimmed" size="xs">
          {tr(
            tr(
              tr(
                "未登録。登録すると、この顧客の書類で営業担当を選べるようになります。",
              ),
            ),
          )}
        </Text>
      ) : (
        <Radio.Group
          onChange={setPrimary}
          value={value.find((r) => r.isPrimary)?.userId ?? ""}
        >
          <Stack gap="xs">
            {value.map((row, index) => (
              <Group
                align="center"
                gap="xs"
                // 同じ担当者を二重に選べてしまう瞬間があるので index キー。
                // biome-ignore lint/suspicious/noArrayIndexKey: 行は並び順そのものが同一性
                key={index}
                wrap="nowrap"
              >
                <Radio
                  aria-label={tr("主担当にする")}
                  disabled={!row.userId}
                  value={row.userId}
                />
                <Select
                  aria-label={tr("営業担当")}
                  className="flex-1"
                  data={options}
                  onChange={(v) => setUser(index, v)}
                  placeholder={tr("担当者を選択")}
                  searchable
                  value={row.userId || null}
                />
                <ActionIcon
                  aria-label={tr("この営業担当を削除")}
                  color="red"
                  onClick={() => remove(index)}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </Radio.Group>
      )}
      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}
      <Group>
        <SecondaryButton onClick={add}>{tr("営業担当を追加")}</SecondaryButton>
        {value.length > 1 && (
          <Text c="dimmed" size="xs">
            {tr("ラジオで選んだ 1 名が主担当（新規書類の既定値）")}
          </Text>
        )}
      </Group>
    </Stack>
  );
}
