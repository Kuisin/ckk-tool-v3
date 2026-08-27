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

import {
  FileButton,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconUpload, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { DesignFileSlot, type SlotValue } from "@/components/ui/DesignFileSlot";
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
  const [blueprint, setBlueprint] = useState<SlotValue>(null);
  const [preview, setPreview] = useState<SlotValue>(null);
  const [references, setReferences] = useState<File[]>([]);
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
      // 製品マスタからの登録は必ず新しいファイル（添付という概念が無い）。
      if (blueprint.kind !== "file") return;
      body.set("blueprint", blueprint.file);
      if (preview?.kind === "file") body.set("preview", preview.file);
      for (const r of references) body.append("reference", r);

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
          fullWidth={isMobile}
          label="図面データ"
          onChange={setBlueprint}
          required
          value={blueprint}
        />
        <DesignFileSlot
          description="STL など、画面で形を確かめるためのファイル。無くても登録できます"
          fullWidth={isMobile}
          label="プレビュー用（3D）"
          onChange={setPreview}
          value={preview}
        />

        <Stack gap={4}>
          <Text fw={500} size="sm">
            参考資料
          </Text>
          <Text c="dimmed" size="xs">
            部品図・寸法表など。何枚でも追加できます
          </Text>
          <Group gap="xs" wrap="wrap">
            <FileButton
              onChange={(f) => f && setReferences((prev) => [...prev, f])}
            >
              {(props) => (
                <SecondaryButton
                  {...props}
                  fullWidth={isMobile}
                  leftSection={<IconUpload size={14} />}
                >
                  参考資料を追加
                </SecondaryButton>
              )}
            </FileButton>
          </Group>
          {references.map((r, i) => (
            <Group gap={4} key={`${r.name}-${r.size}-${i}`} wrap="nowrap">
              <Text c="dimmed" size="xs" style={{ overflowWrap: "anywhere" }}>
                {r.name}
              </Text>
              <GhostButton
                leftSection={<IconX size={12} />}
                onClick={() =>
                  setReferences((prev) => prev.filter((_, j) => j !== i))
                }
              >
                取消
              </GhostButton>
            </Group>
          ))}
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
