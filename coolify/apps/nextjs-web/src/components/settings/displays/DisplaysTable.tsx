"use client";

/**
 * DisplaysTable — ディスプレイ一覧（SY0I）。
 *
 * 「どこに何台あって、いま点いているか」を一目で出す。オンライン判定は
 * サーバー計算の初期値（initialOnline）から始め、WS / ポーリングが
 * 繋がったらそちらで上書きする（useDisplayPresence）。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { ListShell } from "@/components/ui/shells";
import type { DisplayRow } from "@/lib/displays-admin";
import {
  type DisplayPresenceEntry,
  useDisplayPresence,
} from "./useDisplayPresence";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "有効", color: "green" },
  DISABLED: { label: "一時停止", color: "gray" },
  REVOKED: { label: "失効", color: "red" },
};

/** live なデータがあればそちらが勝つ。停止・失効は常にオフライン扱い。 */
export function resolveOnline(
  row: DisplayRow,
  presence: ReadonlyMap<string, DisplayPresenceEntry>,
  live: boolean,
): boolean {
  if (row.status !== "ACTIVE") return false;
  if (live) return presence.get(row.id)?.isOnline ?? false;
  return row.initialOnline;
}

type Props = {
  rows: DisplayRow[];
  plantOptions: Array<{ value: string; label: string }>;
};

export function DisplaysTable({ rows, plantOptions }: Props) {
  const { presence, live } = useDisplayPresence();
  const fmt = useFormat();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [plant, setPlant] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (plant && String(r.plantId ?? "") !== plant) return false;
      if (!q) return true;
      return [r.name, r.location, r.profileName, r.plantName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, status, plant]);

  return (
    <ListShell
      action={
        <Group gap="xs">
          <SecondaryButton href="/settings/displays/profiles">
            表示内容
          </SecondaryButton>
          <PrimaryButton
            href="/settings/displays/pair"
            leftSection={<IconPlus size={16} />}
          >
            ディスプレイを登録
          </PrimaryButton>
        </Group>
      }
      breadcrumbs={[{ label: "システム" }, { label: "ディスプレイ管理" }]}
      filters={
        <>
          <Select
            clearable
            data={[
              { value: "ACTIVE", label: "有効" },
              { value: "DISABLED", label: "一時停止" },
              { value: "REVOKED", label: "失効" },
            ]}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={140}
          />
          <Select
            clearable
            data={plantOptions}
            onChange={setPlant}
            placeholder="拠点"
            searchable
            value={plant}
            w={200}
          />
        </>
      }
      onReset={() => {
        setQuery("");
        setStatus(null);
        setPlant(null);
      }}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="名前・設置場所・表示内容で検索"
          value={query}
        />
      }
      title="ディスプレイ管理"
    >
      {filtered.length === 0 ? (
        <Text c="dimmed" py="xl" size="sm" ta="center">
          {rows.length === 0
            ? "まだディスプレイが登録されていません。Raspberry Pi の画面に出ている QR コードを読み取って登録してください。"
            : "条件に一致するディスプレイがありません"}
        </Text>
      ) : (
        <Stack gap={0}>
          {filtered.map((row, i) => {
            const online = resolveOnline(row, presence, live);
            const s = STATUS_LABEL[row.status] ?? STATUS_LABEL.ACTIVE;
            return (
              <Link
                href={`/settings/displays/${row.id}`}
                key={row.id}
                style={{
                  borderTop:
                    i === 0
                      ? undefined
                      : "1px solid var(--mantine-color-default-border)",
                  color: "inherit",
                  display: "block",
                  textDecoration: "none",
                }}
              >
                <Group align="center" gap="md" py="sm" wrap="nowrap">
                  <Badge
                    color={online ? "green" : "gray"}
                    size="sm"
                    variant={online ? "filled" : "light"}
                    w={80}
                  >
                    {online ? "オンライン" : "オフライン"}
                  </Badge>

                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm" truncate>
                      {row.name ?? "（名称未設定）"}
                    </Text>
                    <Text c="dimmed" size="xs" truncate>
                      {[row.plantName, row.location]
                        .filter(Boolean)
                        .join(" / ") || "設置場所未設定"}
                    </Text>
                  </Stack>

                  <Text
                    c={row.profileName ? undefined : "dimmed"}
                    size="sm"
                    w={200}
                  >
                    {row.profileName ?? "表示内容 未割当"}
                  </Text>

                  <Badge color={s.color} size="sm" variant="light" w={80}>
                    {s.label}
                  </Badge>

                  <Text c="dimmed" size="xs" ta="right" w={140}>
                    {row.lastSeenAt ? fmt.dateTime(row.lastSeenAt) : "—"}
                  </Text>
                </Group>
              </Link>
            );
          })}
        </Stack>
      )}
    </ListShell>
  );
}
