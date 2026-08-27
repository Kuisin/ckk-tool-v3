"use client";

/**
 * CompleteDesignModal — 設計依頼の完了（SA26）。
 *
 * 完了は「1 回 = 1 版」なので、その版に何を含めるかをここで決める:
 *   - この版に含める添付を選ぶ（既定は全部）
 *   - そのうち 1 枚を **主図面** にする（既定はいちばん新しいもの）
 *   - 足りなければ **この場で追加アップロード** できる
 *
 * アップロードは Server Action ではなく `/api/attachments/upload`
 * （Server Action のボディは 1MB で頭打ちになるため — app CLAUDE.md）。
 * 上げ終わったら router.refresh() でサーバー側の添付一覧を取り直す。
 */

import {
  Alert,
  Checkbox,
  FileButton,
  Group,
  Radio,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";

export function CompleteDesignModal({
  opened,
  onClose,
  onConfirm,
  loading,
  requestNumber,
  ownerType,
  attachments,
}: {
  opened: boolean;
  onClose: () => void;
  /** 選んだ内容で完了する。 */
  onConfirm: (input: {
    primaryAttachmentId: string;
    attachmentIds: string[];
  }) => void;
  loading: boolean;
  requestNumber: string;
  ownerType: string;
  attachments: AttachmentView[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 添付が増減したら選択を作り直す（既定 = 全部 / 主図面 = いちばん新しい）。
  // モーダルを開くたびにも通るので、前回の選択が残らない。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 添付一覧と開閉が変わったときだけ引き直す
  useEffect(() => {
    if (!opened) return;
    const ids = attachments.map((a) => a.id);
    setSelected(ids);
    setPrimary(ids[0] ?? null);
  }, [opened, attachments.map((a) => a.id).join(",")]);

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("ownerType", ownerType);
      body.set("ownerId", requestNumber);
      body.set("file", file);
      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        notifications.show({
          title: "追加しました",
          message: file.name,
          color: "green",
        });
        // サーバー側の添付一覧を取り直す（useEffect が選択を作り直す）。
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: json?.error ?? "アップロードに失敗しました",
          color: "red",
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = on ? [...prev, id] : prev.filter((x) => x !== id);
      // 主図面を外したら、残っているうちのいちばん上へ寄せる。
      if (!on && primary === id) setPrimary(next[0] ?? null);
      return next;
    });
  };

  const canConfirm = selected.length > 0 && primary != null;

  return (
    <ModalShell
      confirmColor="blue"
      confirmDisabled={!canConfirm}
      confirmLabel="完了"
      loading={loading}
      onClose={onClose}
      onConfirm={() =>
        primary &&
        onConfirm({ primaryAttachmentId: primary, attachmentIds: selected })
      }
      opened={opened}
      title="完了の確認"
    >
      <Stack gap="md">
        <Text size="sm">
          設計依頼書 {requestNumber} を完了します。選んだファイルが
          <strong>ひとつの版</strong>として登録され、主図面が製品マスタの
          最新図面になります。
        </Text>

        {attachments.length === 0 ? (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            図面がまだ 1 件も添付されていません。下の「ファイルを追加」から
            アップロードしてください。
          </Alert>
        ) : (
          <Radio.Group
            description="主図面は 1 枚だけ選べます。残りは参考資料として同じ版に入ります。"
            label="この版に含めるファイル"
            onChange={setPrimary}
            value={primary ?? ""}
          >
            <Stack gap="xs" mt="xs">
              {attachments.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <Group gap="sm" key={a.id} wrap="nowrap">
                    <Checkbox
                      checked={on}
                      onChange={(e) => toggle(a.id, e.currentTarget.checked)}
                    />
                    <Radio
                      disabled={!on}
                      label="主図面"
                      value={a.id}
                      // 含めないファイルは主図面にできない。
                    />
                    <Text size="sm" style={{ minWidth: 0 }} truncate>
                      {a.filename}
                    </Text>
                    <Text c="dimmed" ml="auto" size="xs">
                      {fmt.dateTime(a.createdAt)}
                    </Text>
                  </Group>
                );
              })}
            </Stack>
          </Radio.Group>
        )}

        <Group>
          <FileButton onChange={upload}>
            {(props) => (
              <SecondaryButton
                {...props}
                leftSection={<IconUpload size={14} />}
                loading={uploading}
              >
                ファイルを追加
              </SecondaryButton>
            )}
          </FileButton>
          <Text c="dimmed" size="xs">
            1 件 20MB まで
          </Text>
        </Group>
      </Stack>
    </ModalShell>
  );
}
