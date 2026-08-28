"use client";

/**
 * CompleteDesignModal — 設計依頼の完了（SA26）。
 *
 * 完了は「1 回 = 1 版」で、その版は 3 つの役割で構成する:
 *   プレビュー 0..1 … 人が形を確かめるためのもの（STL 等。画面で回して見る）
 *   図面データ 1    … 加工プログラムを起こす元データ（成果物の本体）
 *   参考資料 0..N   … 部品図・寸法表など。1 枚ずつ説明を付けられる
 *
 * **プレビューと図面データを別枠にしている**のは用途が違うから。同じ形状でも
 * STL は見るため・CAD は作るためのもので、片方で代用できない。1 枠にすると
 * どちらか一方しか登録できず、製品マスタの「最新図面」も曖昧になる。
 *
 * **入口はアップロードだけ。** 上げたファイルは必ずどれか 1 つの役割に入る。
 * 「添付済みから選ぶ」は無い — 同じことをする道が 2 本あると、どちらを使うか
 * 迷ううえ片方だけ直したときに挙動がずれる。
 *
 * アップロードは Server Action ではなく `/api/attachments/upload`
 * （Server Action のボディは 1MB で頭打ちになるため — app CLAUDE.md）。
 * **確定を押すまで送らない** — 途中でやめたときに使われない添付が残らない。
 */

import { Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileSlot } from "@/components/ui/DesignFileSlot";
import { ModalShell } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";

/** 参考資料 1 枚（ファイル + 説明）。 */
interface ReferenceRow {
  key: number;
  file: File | null;
  note: string;
}

export interface CompleteDesignInput {
  previewAttachmentId: string | null;
  blueprintAttachmentId: string;
  /** 参考資料（説明つき）。 */
  references: { attachmentId: string; description: string | null }[];
}

export function CompleteDesignModal({
  opened,
  onClose,
  onConfirm,
  loading,
  requestNumber,
  ownerType,
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: (input: CompleteDesignInput) => void;
  loading: boolean;
  requestNumber: string;
  ownerType: string;
}) {
  const isMobile = useIsMobile();
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [references, setReferences] = useState<ReferenceRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [uploading, setUploading] = useState(false);

  // 開くたびに空から始める（前回の選択が残っていると、閉じて開き直した
  // ときに何を入れたのか判らなくなる）。
  useEffect(() => {
    if (!opened) return;
    setBlueprint(null);
    setPreview(null);
    setReferences([]);
  }, [opened]);

  /** ファイル 1 枚を添付として送り、その id を返す。 */
  const upload = async (file: File): Promise<string> => {
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
      id?: string;
      error?: string;
    } | null;
    if (!res.ok || !json?.ok || !json.id) {
      throw new Error(
        json?.error ?? `${file.name} のアップロードに失敗しました`,
      );
    }
    return json.id;
  };

  const submit = async () => {
    if (!blueprint) return;
    setUploading(true);
    try {
      // 図面データ → プレビュー → 参考資料 の順に送る。途中で失敗したら
      // そこで止める（それまでに上がったものは添付として残り、ファイル
      // タブから消せる）。
      const blueprintId = await upload(blueprint);
      const previewId = preview ? await upload(preview) : null;
      const refs: CompleteDesignInput["references"] = [];
      for (const r of references) {
        if (!r.file) continue;
        refs.push({
          attachmentId: await upload(r.file),
          description: r.note.trim() || null,
        });
      }
      onConfirm({
        previewAttachmentId: previewId,
        blueprintAttachmentId: blueprintId,
        references: refs,
      });
    } catch (e) {
      notifications.show({
        title: "エラー",
        message: e instanceof Error ? e.message : "アップロードに失敗しました",
        color: "red",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalShell
      confirmColor="blue"
      confirmDisabled={!blueprint}
      confirmLabel="完了"
      loading={loading || uploading}
      onClose={onClose}
      onConfirm={submit}
      opened={opened}
      size="lg"
      title="完了の確認"
    >
      <Stack gap="md">
        <Text size="sm">
          設計依頼書 {requestNumber} を完了します。ここで上げたファイルが
          <strong>ひとつの版</strong>として登録され、
          <strong>図面データ</strong>が製品マスタの最新図面になります。
        </Text>

        <DesignFileSlot
          description="加工プログラムを起こす元データ。製品マスタの最新図面になります"
          file={blueprint}
          fullWidth={isMobile}
          label="図面データ"
          onPick={setBlueprint}
          required
        />
        <DesignFileSlot
          description="STL など、画面で形を確かめるためのファイル。無くても完了できます"
          file={preview}
          fullWidth={isMobile}
          label="プレビュー用（3D）"
          onPick={setPreview}
        />

        <Stack gap="sm">
          {references.map((r, i) => (
            <DesignFileSlot
              description={
                i === 0 ? "部品図・寸法表など。何枚でも追加できます" : undefined
              }
              file={r.file}
              fullWidth={isMobile}
              key={r.key}
              label={`参考資料 ${i + 1}`}
              note={r.note}
              notePlaceholder="説明（任意）— 例: 部品図、寸法表"
              onNoteChange={(v) =>
                setReferences((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, note: v } : x)),
                )
              }
              onPick={(f) =>
                setReferences((prev) =>
                  // ファイルを外したら行ごと消す（空の行が残らない）
                  f == null
                    ? prev.filter((_, j) => j !== i)
                    : prev.map((x, j) => (j === i ? { ...x, file: f } : x)),
                )
              }
            />
          ))}
          <Group>
            <SecondaryButton
              fullWidth={isMobile}
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setReferences((prev) => [
                  ...prev,
                  { key: nextKey, file: null, note: "" },
                ]);
                setNextKey((k) => k + 1);
              }}
            >
              参考資料を追加
            </SecondaryButton>
          </Group>
        </Stack>

        <Text c="dimmed" size="xs">
          1 件 20MB まで。確定するまでアップロードは始まりません
        </Text>
      </Stack>
    </ModalShell>
  );
}
