"use client";

/**
 * CompleteDesignModal — 設計依頼の完了（SA26）。
 *
 * 完了は「1 回 = 1 版」で、その版は 3 つの役割で構成する:
 *   プレビュー 0..1 … 人が形を確かめるためのもの（STL 等。画面で回して見る）
 *   図面データ 1    … 加工プログラムを起こす元データ（成果物の本体）
 *   参考資料 0..N   … 部品図・寸法表など
 *
 * **プレビューと図面データを別枠にしている**のは用途が違うから。同じ形状でも
 * STL は見るため・CAD は作るためのもので、片方で代用できない。1 枠にすると
 * どちらか一方しか登録できず、製品マスタの「最新図面」も曖昧になる。
 *
 * アップロードは Server Action ではなく `/api/attachments/upload`
 * （Server Action のボディは 1MB で頭打ちになるため — app CLAUDE.md）。
 */

import { Alert, FileButton, Group, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import { designFileKind } from "@/lib/design-file-kind";

export interface CompleteDesignInput {
  previewAttachmentId: string | null;
  blueprintAttachmentId: string;
  referenceAttachmentIds: string[];
}

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
  onConfirm: (input: CompleteDesignInput) => void;
  loading: boolean;
  requestNumber: string;
  ownerType: string;
  attachments: AttachmentView[];
}) {
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 添付が増減したら選び直す。開くたびにも通るので前回の選択が残らない。
  // 既定: 3D として読めるものをプレビューへ、そうでない最新を図面データへ。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 添付一覧と開閉が変わったときだけ引き直す
  useEffect(() => {
    if (!opened) return;
    const three = attachments.find(
      (a) => designFileKind(a.filename, a.mimeType) === "model3d",
    );
    const rest = attachments.find((a) => a.id !== three?.id);
    setPreview(three?.id ?? null);
    setBlueprint(rest?.id ?? attachments[0]?.id ?? null);
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

  // 参考資料は「選ばれなかった残り全部」。個別に外したいことは稀なので、
  // 3 つ目の選択 UI は置かず結果だけ見せる。
  const references = attachments.filter(
    (a) => a.id !== preview && a.id !== blueprint,
  );

  // 選択肢のラベルは**ファイル名だけ**。日付まで 1 行に入れると 375px の
  // 入力欄では肝心のファイル名が押し出されて、どれを選んだのか判らない。
  // 日付は候補一覧の 2 行目（renderOption）に回す。
  const options = attachments.map((a) => ({
    value: a.id,
    label: a.filename,
    date: fmt.date(a.createdAt),
  }));

  // 候補は 2 行（ファイル名 / 追加日）。長い名前は折り返さず truncate する。
  const renderOption = ({
    option,
  }: {
    option: { value: string; label: string; date?: string };
  }) => (
    <Stack gap={0} style={{ minWidth: 0 }}>
      <Text size="sm" truncate>
        {option.label}
      </Text>
      {option.date && (
        <Text c="dimmed" size="xs">
          {option.date}
        </Text>
      )}
    </Stack>
  );
  const canConfirm = blueprint != null && blueprint !== preview;

  return (
    <ModalShell
      confirmColor="blue"
      confirmDisabled={!canConfirm}
      confirmLabel="完了"
      loading={loading}
      onClose={onClose}
      onConfirm={() =>
        blueprint &&
        onConfirm({
          previewAttachmentId: preview,
          blueprintAttachmentId: blueprint,
          referenceAttachmentIds: references.map((a) => a.id),
        })
      }
      opened={opened}
      title="完了の確認"
    >
      <Stack gap="md">
        <Text size="sm">
          設計依頼書 {requestNumber} を完了します。選んだファイルが
          <strong>ひとつの版</strong>として登録され、
          <strong>図面データ</strong>が製品マスタの最新図面になります。
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
          <>
            <Select
              clearable
              data={options}
              description="STL など、画面で形を確かめるためのファイル。無くても完了できます"
              label="プレビュー用（3D）"
              onChange={setPreview}
              placeholder="選択しない"
              renderOption={renderOption}
              value={preview}
            />
            <Select
              data={options}
              description="加工プログラムを起こす元データ。製品マスタの最新図面になります"
              error={
                blueprint && blueprint === preview
                  ? "プレビューと同じファイルは選べません"
                  : undefined
              }
              label="図面データ"
              onChange={setBlueprint}
              placeholder="選択してください"
              renderOption={renderOption}
              value={blueprint}
              withAsterisk
            />
            <Stack gap={4}>
              <Text fw={500} size="sm">
                参考資料
              </Text>
              {references.length === 0 ? (
                <Text c="dimmed" size="xs">
                  —（残りのファイルが自動でここに入ります）
                </Text>
              ) : (
                references.map((a) => (
                  <Text c="dimmed" key={a.id} size="xs" truncate>
                    {a.filename}
                  </Text>
                ))
              )}
            </Stack>
          </>
        )}

        {/* モバイルは縦積み + 全幅（44px の当たり判定）。横並びのままだと
            「1 件 20MB まで」に押されてボタンが極端に細くなる。 */}
        <Group gap="xs" wrap="wrap">
          <FileButton onChange={upload}>
            {(props) => (
              <SecondaryButton
                {...props}
                fullWidth={isMobile}
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
