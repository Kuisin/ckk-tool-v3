"use client";

/**
 * DesignFileVersionForm — 設計図の版を 1 つ登録する (PD16)。
 *
 * **版の登録口はここ 1 つ。** 設計依頼 (SA06) の成果物も、依頼を経ない
 * 取り込みも同じフォームを通る。以前は「依頼の完了」と「製品マスタから追加」
 * の 2 箇所に登録口があり、採番と is_latest の付け替えが二重に存在していた。
 *
 * 1 版 = プレビュー 0..1 + 図面データ 1 + 参考資料 0..N。同時に出したファイルは
 * 同じ版番号を共有する（版は図面の改訂世代で、ファイルの通し番号ではない）。
 *
 * 受注元を選ぶと、その顧客の系列に版が積まれる。空のままなら「汎用」で、
 * 顧客専用の図面が無いときのフォールバックになる。
 *
 * 送信先は Server Action ではなく `/api/design-files/upload`
 * （Server Action のボディは 1MB で頭打ちになり、図面は普通に超える）。
 */

import { Alert, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileSlot } from "@/components/ui/DesignFileSlot";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";

interface Option {
  value: string;
  label: string;
}

/** 依頼から来たときの前提（製品・受注元は依頼が決めるので動かさない）。 */
export interface DesignRequestContext {
  id: string;
  requestNumber: string;
  productId: number;
  productLabel: string;
  customerBpId: string | null;
  customerName: string | null;
}

export function DesignFileVersionForm({
  customerOptions,
  initialProduct,
  requestContext,
}: {
  /** 版を載せられる受注元。空のままなら汎用。 */
  customerOptions: Option[];
  /** `?product=` から来たときの既定値。 */
  initialProduct: Option | null;
  /** `?request=` から来たときの依頼。 */
  requestContext: DesignRequestContext | null;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 依頼から来たときは製品・受注元を依頼に合わせて固定する。ここで選び直せると
  // 「依頼の成果物なのに別製品の図面」が作れてしまう（サーバー側でも弾くが、
  // 選べる UI を出さないのが先）。
  const [productId, setProductId] = useState<string | null>(
    requestContext
      ? String(requestContext.productId)
      : (initialProduct?.value ?? null),
  );
  const [customerBpId, setCustomerBpId] = useState<string | null>(
    requestContext?.customerBpId ?? null,
  );
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [references, setReferences] = useState<
    { key: number; file: File | null; note: string }[]
  >([]);
  const [nextKey, setNextKey] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!blueprint || !productId) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("productId", productId);
      if (customerBpId) body.set("customerBpId", customerBpId);
      if (requestContext) body.set("designRequestId", requestContext.id);
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
        // 依頼から来たなら依頼へ戻す（次にやることは「完了」なので）。
        router.push(
          requestContext
            ? `/sales/design-requests/${encodeURIComponent(requestContext.requestNumber)}`
            : `/production/design-files/${productId}`,
        );
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
    <Stack gap="md">
      {requestContext && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />}>
          設計依頼 {requestContext.requestNumber} の成果物として登録します。
          製品「{requestContext.productLabel}」
          {requestContext.customerName
            ? `・受注元「${requestContext.customerName}」`
            : "・汎用"}
          は依頼で決まっているので変更できません。
        </Alert>
      )}

      <FormSection title="対象">
        {requestContext ? null : (
          <SearchSelect
            initialOption={initialProduct ?? undefined}
            label="製品"
            onChange={setProductId}
            onSearch={searchProductOptions}
            storageKey="product"
            value={productId}
            withAsterisk
          />
        )}
        <Select
          clearable
          data={customerOptions}
          description="空のままなら「汎用」— 顧客専用の図面が無いときに使われます。版番号は受注元ごとに数えます"
          disabled={requestContext != null}
          label="受注元"
          onChange={setCustomerBpId}
          placeholder="汎用（すべての顧客）"
          searchable
          value={customerBpId}
        />
      </FormSection>

      <FormSection title="ファイル">
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
      </FormSection>

      <FormActions
        disabled={!blueprint || !productId}
        loading={busy}
        onCancel={() => router.back()}
        onSave={submit}
      />
    </Stack>
  );
}
