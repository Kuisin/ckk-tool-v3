"use client";

/**
 * DisplaysTable — ディスプレイ一覧（SY09「ディスプレイ」タブ）。
 *
 * **共有端末と同じ 3 段**で登録する: 作る（オープン）→ リンク → 有効化。
 * リンクコードは端末と同じ 12 桁で、入力欄の作りも合わせてある
 * （現場が「どっちのコードか」を意識しなくて済むように）。
 *
 * オンライン判定はサーバー計算の初期値から始め、WS / ポーリングが繋がったら
 * そちらで上書きする（useDisplayPresence）。
 */

import {
  Badge,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  activateDisplay,
  createDisplayDevice,
  linkDisplayToProfile,
} from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { ListShell } from "@/components/ui/shells";
import { formatCode, normalizeCode } from "@/lib/crockford";
import type { DisplayRow } from "@/lib/displays-admin";
import {
  type DisplayPresenceEntry,
  useDisplayPresence,
} from "./useDisplayPresence";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: "リンク待ち", color: "gray" },
  LINKED: { label: "有効化待ち", color: "yellow" },
  ACTIVE: { label: "有効", color: "green" },
  DISABLED: { label: "一時停止", color: "gray" },
  REVOKED: { label: "失効", color: "red" },
};

/** live なデータがあればそちらが勝つ。有効以外は常にオフライン扱い。 */
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
  profiles: Array<{ id: string; name: string }>;
  plantOptions: Array<{ value: string; label: string }>;
};

export function DisplaysTable({ rows, profiles, plantOptions }: Props) {
  const { presence, live } = useDisplayPresence();
  const fmt = useFormat();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<DisplayRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [r.name, r.location, r.profileName, r.plantName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, status]);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error ?? "操作に失敗しました",
          color: "red",
        });
        return;
      }
      notifications.show({ message: ok, color: "green" });
      setCreateOpen(false);
      setLinkTarget(null);
      router.refresh();
    });

  return (
    <>
      <ListShell
        action={
          <PrimaryButton
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateOpen(true)}
          >
            ディスプレイを追加
          </PrimaryButton>
        }
        breadcrumbs={[{ label: "システム" }, { label: "端末管理" }]}
        embedded
        filters={
          <Select
            clearable
            data={Object.entries(STATUS_LABEL).map(([value, v]) => ({
              value,
              label: v.label,
            }))}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={150}
          />
        }
        onReset={() => {
          setQuery("");
          setStatus(null);
        }}
        search={
          <TextInput
            leftSection={<IconSearch size={14} />}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="名前・設置場所・表示内容で検索"
            value={query}
          />
        }
        title="ディスプレイ"
      >
        {filtered.length === 0 ? (
          <Text c="dimmed" py="xl" size="sm" ta="center">
            {rows.length === 0
              ? "まだディスプレイがありません。「ディスプレイを追加」で作ってから、画面に出るリンクコードで結びます。"
              : "条件に一致するディスプレイがありません"}
          </Text>
        ) : (
          <Stack gap={0}>
            {filtered.map((row, i) => {
              const online = resolveOnline(row, presence, live);
              const s = STATUS_LABEL[row.status] ?? STATUS_LABEL.PENDING;
              return (
                <Group
                  align="center"
                  gap="md"
                  key={row.id}
                  py="sm"
                  style={{
                    borderTop:
                      i === 0
                        ? undefined
                        : "1px solid var(--mantine-color-default-border)",
                  }}
                  wrap="nowrap"
                >
                  <Badge
                    color={online ? "green" : "gray"}
                    size="sm"
                    variant={online ? "filled" : "light"}
                    w={80}
                  >
                    {online ? "オンライン" : "オフライン"}
                  </Badge>

                  <Link
                    href={`/settings/kiosk-devices/displays/${row.id}`}
                    style={{
                      color: "inherit",
                      flex: 1,
                      minWidth: 0,
                      textDecoration: "none",
                    }}
                  >
                    <Stack gap={2}>
                      <Text fw={600} size="sm" truncate>
                        {row.name ?? "（名称未設定）"}
                      </Text>
                      <Text c="dimmed" size="xs" truncate>
                        {[row.plantName, row.location]
                          .filter(Boolean)
                          .join(" / ") || "設置場所未設定"}
                      </Text>
                    </Stack>
                  </Link>

                  <Text
                    c={row.profileName ? undefined : "dimmed"}
                    size="sm"
                    w={180}
                  >
                    {row.profileName ?? "表示内容 未割当"}
                  </Text>

                  <Badge color={s.color} size="sm" variant="light" w={90}>
                    {s.label}
                  </Badge>

                  {/* 次にすべき 1 手だけを出す（端末管理と同じ考え方） */}
                  <Group gap="xs" justify="flex-end" w={130} wrap="nowrap">
                    {row.status === "PENDING" && (
                      <SecondaryButton
                        disabled={pending}
                        onClick={() => setLinkTarget(row)}
                      >
                        リンク
                      </SecondaryButton>
                    )}
                    {row.status === "LINKED" && (
                      <PrimaryButton
                        disabled={pending}
                        onClick={() =>
                          run(() => activateDisplay(row.id), "有効化しました")
                        }
                      >
                        有効化
                      </PrimaryButton>
                    )}
                    {row.status === "ACTIVE" && (
                      <Text c="dimmed" size="xs" ta="right">
                        {row.lastSeenAt ? fmt.dateTime(row.lastSeenAt) : "—"}
                      </Text>
                    )}
                  </Group>
                </Group>
              );
            })}
          </Stack>
        )}
      </ListShell>

      <CreateDisplayModal
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) =>
          run(() => createDisplayDevice(values), "作成しました")
        }
        opened={createOpen}
        pending={pending}
        plantOptions={plantOptions}
        profiles={profiles}
      />

      <LinkDisplayModal
        display={linkTarget}
        onClose={() => setLinkTarget(null)}
        onSubmit={(code) => {
          if (linkTarget) {
            run(
              () => linkDisplayToProfile(linkTarget.id, code),
              "リンクしました",
            );
          }
        }}
        pending={pending}
      />
    </>
  );
}

// ── 追加（プロファイルを先に作る） ──────────────────────────────────────────

function CreateDisplayModal({
  opened,
  onClose,
  onSubmit,
  pending,
  profiles,
  plantOptions,
}: {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: {
    nameJa: string;
    location?: string;
    plantId?: number | null;
    profileId?: string | null;
  }) => void;
  pending: boolean;
  profiles: Array<{ id: string; name: string }>;
  plantOptions: Array<{ value: string; label: string }>;
}) {
  const [nameJa, setNameJa] = useState("");
  const [location, setLocation] = useState("");
  const [plantId, setPlantId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  return (
    <Modal
      onClose={onClose}
      opened={opened}
      title="ディスプレイを追加"
      withinPortal
    >
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          先にここで作ってから、画面に出るリンクコードで結びます（共有端末と
          同じ手順です）。
        </Text>
        <TextInput
          description="現場の人が呼ぶ名前（例: A ライン 入口）"
          label="名前"
          onChange={(e) => setNameJa(e.currentTarget.value)}
          placeholder="A ライン 入口"
          value={nameJa}
          withAsterisk
        />
        <TextInput
          label="設置場所"
          onChange={(e) => setLocation(e.currentTarget.value)}
          placeholder="1F 加工エリア"
          value={location}
        />
        <Select
          clearable
          data={plantOptions}
          label="拠点"
          onChange={setPlantId}
          placeholder="選択してください"
          searchable
          value={plantId}
        />
        <Select
          clearable
          data={profiles.map((p) => ({ value: p.id, label: p.name }))}
          description="あとから変更できます"
          label="表示内容"
          onChange={setProfileId}
          placeholder="選択してください"
          searchable
          value={profileId}
        />
        <Group justify="flex-end">
          <SecondaryButton disabled={pending} onClick={onClose}>
            キャンセル
          </SecondaryButton>
          <PrimaryButton
            disabled={!nameJa.trim()}
            loading={pending}
            onClick={() =>
              onSubmit({
                nameJa,
                location: location || undefined,
                plantId: plantId ? Number(plantId) : null,
                profileId,
              })
            }
          >
            作成
          </PrimaryButton>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── リンク（画面のコードを入力） ────────────────────────────────────────────

function LinkDisplayModal({
  display,
  onClose,
  onSubmit,
  pending,
}: {
  display: DisplayRow | null;
  onClose: () => void;
  onSubmit: (code: string) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState("");

  return (
    <Modal
      onClose={onClose}
      opened={display !== null}
      title={`リンク: ${display?.name ?? ""}`}
      withinPortal
    >
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          ディスプレイの画面に出ている 12 文字のリンクコードを入力してください。
          共有端末と同じ形式です。
        </Text>
        <TextInput
          label="リンクコード"
          onChange={(e) =>
            setCode(normalizeCode(e.currentTarget.value).slice(0, 12))
          }
          placeholder="ABCD-EFGH-JKLM"
          styles={{ input: { fontFamily: "monospace", fontSize: 18 } }}
          value={formatCode(code)}
        />
        <Group justify="flex-end">
          <SecondaryButton disabled={pending} onClick={onClose}>
            キャンセル
          </SecondaryButton>
          <PrimaryButton
            disabled={code.length !== 12}
            loading={pending}
            onClick={() => onSubmit(code)}
          >
            リンク
          </PrimaryButton>
        </Group>
      </Stack>
    </Modal>
  );
}
