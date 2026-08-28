"use client";

/**
 * AddDesignVersionModal — 設計図の版を手で 1 つ足す (MS24 関連タブ)。
 *
 * 設計依頼を通さない登録口。図面だけ先に出来ている・既存の図面を取り込む、
 * といった場合に使う。出来た版は一覧で「手動」と出る。
 *
 * 1 版 = プレビュー 0..1 + 図面データ 1 + 参考資料 0..N。設計依頼の完了
 * （CompleteDesignModal）と**同じ組み立て**にしてあるので、どちらの入口から
 * 入れても後の扱いは変わらない。
 *
 * 受注元を選ぶと、その顧客の系列に版が積まれる。空のままなら「汎用」で、
 * 顧客専用の図面が無いときのフォールバックになる。
 *
 * 送信先は Server Action ではなく `/api/design-files/upload`
 * （Server Action のボディは 1MB で頭打ちになり、図面は普通に超える）。
 */

import { Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileSlot } from "@/components/ui/DesignFileSlot";
import { ModalShell } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";

interface Option {
  value: string;
  label: string;
}

export function AddDesignVersionModal({
  opened,
  onClose,
  productId,
  customerOptions,
}: {
  opened: boolean;
  onClose: () => void;
  productId: number;
  /** 版を載せられる受注元。空のままなら汎用。 */
  customerOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [customerBpId, setCustomerBpId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [references, setReferences] = useState<
    { key: number; file: File | null; note: string }[]
  >([]);
  const [nextKey, setNextKey] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCustomerBpId(null);
    setBlueprint(null);
    setPreview(null);
    setReferences([]);
    setNotes("");
  };

  const submit = async () => {
    if (!blueprint) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("productId", String(productId));
      if (customerBpId) body.set("customerBpId", customerBpId);
      if (notes.trim()) body.set("notes", notes.trim());
      body.set("blueprint", blueprint);
      if (preview) body.set("preview", preview);
      // 参考資料はファイルと説明を同じ順で並べて送る（受け側で組み直す）。
      for (const r of references) {
        if (!r.file) continue;
        body.append("reference", r.file);
        body.append("referenceNote", r.note.trim());
      }

      const res = await fetch("/api/design-files/upload", {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        version?: number;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        notifications.show({
          title: "登録しました",
          message: `設計図 v${json.version} を追加しました`,
          color: "green",
        });
        reset();
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: json?.error ?? "登録に失敗しました",
          color: "red",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      confirmDisabled={!blueprint}
      confirmLabel="登録"
      loading={busy}
      onClose={onClose}
      onConfirm={submit}
      opened={opened}
      size="lg"
      title="設計図を追加"
    >
      <Stack gap="md">
        <Text size="sm">
          設計依頼を通さずに版を 1 つ足します。
          <strong>図面データ</strong>がその系列の最新図面になります。
        </Text>

        <Select
          clearable
          data={customerOptions}
          description="空のままなら「汎用」— 顧客専用の図面が無いときに使われます。版番号は受注元ごとに数えます"
          label="受注元"
          onChange={setCustomerBpId}
          placeholder="汎用（すべての顧客）"
          searchable
          value={customerBpId}
        />

        <DesignFileSlot
          description="加工プログラムを起こす元データ。この系列の最新図面になります"
          file={blueprint}
          fullWidth={isMobile}
          label="図面データ"
          onPick={setBlueprint}
          required
        />
        <DesignFileSlot
          description="STL など、画面で形を確かめるためのファイル。無くても登録できます"
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

        <Textarea
          autosize
          label="メモ"
          minRows={2}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="この版で何が変わったか（任意）"
          value={notes}
        />
        <Text c="dimmed" size="xs">
          1 件 20MB まで
        </Text>
      </Stack>
    </ModalShell>
  );
}
