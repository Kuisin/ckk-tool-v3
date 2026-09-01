"use client";

/**
 * InspectionTemplateImagePanel — 検査表テンプレートの参考画像 (MS29).
 *
 * 測定位置の図解・現物写真など、テンプレート 1 件につき 1 枚。設定すると
 * 空欄シート・記入済みシートの PDF にも印刷される
 * （lib/inspection-sheet-pdf.ts templateImageHtml）。既にテンプレートが
 * 存在する画面なので、選んだら即アップロード（フォーム保存を待たない —
 * DesignFileSlot と違いここは新規作成フォームの一部ではない）。
 *
 * アップロード / 削除は /api/inspection-templates/[id]/image
 * （lib/inspection-template-image.ts）。ロック中のバージョンでも変更可 —
 * 参考画像は測定定義そのものではない。
 */

import { FileButton, Image, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

const ACCEPT = ".png,.jpg,.jpeg,.webp";
// lib/inspection-template-image.ts の TEMPLATE_IMAGE_EXT_LABEL と同じ文言。
// server-only モジュールなのでクライアント側では値を複製する
// （import type だけなら許されるが、これは文字列の値なので不可）。
const TEMPLATE_IMAGE_EXT_LABEL = "PNG / JPG / WEBP";

export function InspectionTemplateImagePanel({
  templateId,
  filename,
}: {
  templateId: number;
  /** null = 未設定。 */
  filename: string | null;
}) {
  const tr = useTr();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // 差し替え直後も同じ URL のまま更新されて見えるよう、キャッシュ破棄用に
  // タイムスタンプを付ける。
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  const src = `/api/inspection-templates/${templateId}/image?v=${cacheBust}`;

  const upload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/inspection-templates/${templateId}/image`, {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        notifications.show({
          title: tr("設定しました"),
          message: tr("参考画像を設定しました"),
          color: "green",
        });
        setCacheBust(Date.now());
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: json?.error ?? tr("アップロードに失敗しました"),
          color: "red",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    openConfirm({
      title: tr("参考画像の削除"),
      message: tr("参考画像を削除します。この操作は取り消せません。"),
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        setBusy(true);
        fetch(`/api/inspection-templates/${templateId}/image`, {
          method: "DELETE",
        })
          .then(async (res) => {
            const json = (await res.json().catch(() => null)) as {
              ok?: boolean;
              error?: string;
            } | null;
            if (res.ok && json?.ok) {
              notifications.show({
                title: tr("削除しました"),
                message: tr("参考画像を削除しました"),
                color: "green",
              });
              router.refresh();
            } else {
              notifications.show({
                title: tr("エラー"),
                message: json?.error ?? tr("削除に失敗しました"),
                color: "red",
              });
            }
          })
          .finally(() => setBusy(false));
      },
    });
  };

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        {tr("参考画像")}
      </Text>
      <Text c="dimmed" size="xs">
        測定位置の図解・現物写真など。設定すると空欄シート・記入済みシートの PDF
        にも印刷されます（{TEMPLATE_IMAGE_EXT_LABEL} / 5MB まで）。
      </Text>
      {filename ? (
        <Image
          alt={filename}
          fit="contain"
          mah={240}
          radius="sm"
          src={src}
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
          w="auto"
        />
      ) : (
        <Stack
          align="center"
          gap={4}
          justify="center"
          py="lg"
          style={{
            border: "1px dashed var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-sm)",
          }}
        >
          <IconPhoto color="var(--mantine-color-dimmed)" size={24} />
          <Text c="dimmed" size="xs">
            {tr("画像は未設定です")}
          </Text>
        </Stack>
      )}
      <div>
        <FileButton accept={ACCEPT} onChange={upload}>
          {(props) => (
            <SecondaryButton
              {...props}
              leftSection={<IconUpload size={14} />}
              loading={busy}
              mr="xs"
            >
              {filename ? "選び直す" : tr("アップロード")}
            </SecondaryButton>
          )}
        </FileButton>
        {filename && (
          <GhostButton
            leftSection={<IconTrash size={14} />}
            loading={busy}
            onClick={remove}
          >
            削除
          </GhostButton>
        )}
      </div>
    </Stack>
  );
}
