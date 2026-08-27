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
 * **役割ごとに直接ファイルを選べる。** 以前は「先に添付してから、どれがどれか
 * を選び直す」の 2 段だった。役割が 3 つと決まっているのだから、枠に入れる
 * だけで済むほうが手数が少ない。作業中にファイルタブへ上げた添付も同じ枠から
 * 選べるので、同じものを 2 回上げなくてよい。
 *
 * アップロードは Server Action ではなく `/api/attachments/upload`
 * （Server Action のボディは 1MB で頭打ちになるため — app CLAUDE.md）。
 * **確定を押すまで送らない** — 途中でやめたときに使われない添付が残らない。
 */

import { Alert, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { SecondaryButton } from "@/components/ui/buttons";
import {
  DesignFileSlot,
  type SlotValue,
  slotLabel,
} from "@/components/ui/DesignFileSlot";
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
  const [preview, setPreview] = useState<SlotValue>(null);
  const [blueprint, setBlueprint] = useState<SlotValue>(null);
  const [references, setReferences] = useState<SlotValue[]>([]);
  const [uploading, setUploading] = useState(false);

  // 開くたびに引き直す。既に添付があるときだけ、それらを既定に置く
  // （3D として読めるものをプレビューへ、そうでない最新を図面データへ）。
  // 添付が無ければ全部空 = そのままファイルを選んでもらう。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 添付一覧と開閉が変わったときだけ引き直す
  useEffect(() => {
    if (!opened) return;
    const three = attachments.find(
      (a) => designFileKind(a.filename, a.mimeType) === "model3d",
    );
    const rest = attachments.find((a) => a.id !== three?.id);
    const asSlot = (a?: AttachmentView): SlotValue =>
      a ? { kind: "attachment", id: a.id, filename: a.filename } : null;
    setPreview(asSlot(three));
    setBlueprint(asSlot(rest ?? attachments[0]));
    setReferences([]);
  }, [opened, attachments.map((a) => a.id).join(",")]);

  // 添付の選択肢（どの枠からも同じ一覧を選べる）。
  const attachmentOptions = attachments.map((a) => ({
    value: a.id,
    label: `${a.filename}（${fmt.date(a.createdAt)}）`,
  }));

  /** 枠 1 つを添付 id に解決する。新しいファイルはここで初めて送る。 */
  const resolve = async (v: SlotValue): Promise<string | null> => {
    if (!v) return null;
    if (v.kind === "attachment") return v.id;
    const body = new FormData();
    body.set("ownerType", ownerType);
    body.set("ownerId", requestNumber);
    body.set("file", v.file);
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
        json?.error ?? `${v.file.name} のアップロードに失敗しました`,
      );
    }
    return json.id;
  };

  const submit = async () => {
    if (!blueprint) return;
    setUploading(true);
    try {
      // 図面データ → プレビュー → 参考資料 の順に送る。途中で失敗したら
      // そこで止める（それまでに上がったものは添付として残り、ファイルタブ
      // から消せる）。
      const blueprintId = await resolve(blueprint);
      if (!blueprintId) throw new Error("図面データを選択してください");
      const previewId = await resolve(preview);
      const referenceIds: string[] = [];
      for (const r of references) {
        const id = await resolve(r);
        if (id) referenceIds.push(id);
      }
      onConfirm({
        previewAttachmentId: previewId,
        blueprintAttachmentId: blueprintId,
        referenceAttachmentIds: referenceIds,
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

  // 同じ添付を 2 つの役割に入れさせない（1 ファイル = 1 役割）。
  const usedTwice = (() => {
    const ids = [preview, blueprint, ...references]
      .map((v) => (v?.kind === "attachment" ? v.id : null))
      .filter((v): v is string => v != null);
    return new Set(ids).size !== ids.length;
  })();

  return (
    <ModalShell
      confirmColor="blue"
      confirmDisabled={!blueprint || usedTwice}
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
          設計依頼書 {requestNumber} を完了します。選んだファイルが
          <strong>ひとつの版</strong>として登録され、
          <strong>図面データ</strong>が製品マスタの最新図面になります。
        </Text>

        {usedTwice && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            同じファイルを複数の役割に指定できません。
          </Alert>
        )}

        <DesignFileSlot
          attachmentOptions={attachmentOptions}
          description="加工プログラムを起こす元データ。製品マスタの最新図面になります"
          fullWidth={isMobile}
          label="図面データ"
          onChange={setBlueprint}
          required
          value={blueprint}
        />
        <DesignFileSlot
          attachmentOptions={attachmentOptions}
          description="STL など、画面で形を確かめるためのファイル。無くても完了できます"
          fullWidth={isMobile}
          label="プレビュー用（3D）"
          onChange={setPreview}
          value={preview}
        />

        <Stack gap={4}>
          {references.map((r, i) => (
            <DesignFileSlot
              attachmentOptions={attachmentOptions}
              description="部品図・寸法表など"
              fullWidth={isMobile}
              key={`ref-${i}-${slotLabel(r) ?? "empty"}`}
              label={`参考資料 ${i + 1}`}
              onChange={(v) =>
                setReferences((prev) =>
                  v == null
                    ? prev.filter((_, j) => j !== i)
                    : prev.map((x, j) => (j === i ? v : x)),
                )
              }
              value={r}
            />
          ))}
          <Group>
            <SecondaryButton
              fullWidth={isMobile}
              leftSection={<IconPlus size={14} />}
              onClick={() => setReferences((prev) => [...prev, null])}
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
