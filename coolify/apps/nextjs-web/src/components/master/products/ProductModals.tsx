"use client";

/**
 * ProductModals.tsx — 製品の削除 / 有効・無効切替 / 複製ポップアップ (MS04).
 *
 * Ported from design-preview (designs/master/products/_modals) and wired to
 * the Server Actions. 複製は新コードを自動採番して作成する。
 *
 * **設計図の差し替えモーダルはここには作らない。** 差し替えは設計依頼 (SA06)
 * の「完了」経由だけ — 版採番と、依頼側・製品側 両方の is_latest クリアは
 * completeDesign の 1 トランザクションが唯一の管理者で、マスタ側に第 2 の
 * 書き込み口を作ると is_latest が 2 行立つ。図面が変わった理由も追えなくなる。
 * 製品詳細の「関連」タブからは読むだけ + 起票への導線を出す。
 */

import { Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import {
  createProduct,
  deleteProducts,
  setProductsActive,
} from "@/app/(dashboard)/master/products/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { LocalizedTextInput } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { unitOptions } from "@/lib/enum-labels";
import type { Translate } from "@/lib/ui-text";

export interface ProductModalTarget {
  id: number;
  code: string | null;
  name: string;
  isActive: boolean;
  /** 素材仕様（材種 + 直径 + 全長）。複製時にそのまま引き継ぐ。 */
  materialTypeId: string | null;
  materialTypeLabel: string;
  diameterMm: number | null;
  lengthMm: number | null;
  unit: string;
}

// フックを使えない素の関数なので、解決済みの `tr` を引数で受ける。
function label(t: ProductModalTarget, tr: Translate) {
  const code = t.code ?? tr("未採番");
  return t.name !== "—" ? `${t.name}（${code}）` : code;
}

export function DeleteProductModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProductModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
      loading={isPending}
      message={
        target
          ? `製品「${label(target, tr)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteProducts([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `製品「${label(target, tr)}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("製品の削除")}
      warning={tr(
        tr(
          "この製品を参照する価格試算・価格表・見積書が存在する場合は削除できません。無効化をご検討ください。",
        ),
      )}
    />
  );
}

export function ToggleProductActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProductModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : tr("有効化する")}
      loading={isPending}
      message={
        target
          ? isActive
            ? `製品「${label(target, tr)}」を無効化します。新規の価格試算・価格表・見積書で選択できなくなります。`
            : `製品「${label(target, tr)}」を有効化します。再び価格試算・価格表・見積書で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setProductsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: `製品「${label(target, tr)}」を${isActive ? "無効化" : "有効化"}しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={isActive ? "製品の無効化" : tr("製品の有効化")}
    />
  );
}

export function DuplicateProductModal({
  opened,
  onClose,
  source,
}: ModalBaseProps & {
  source: ProductModalTarget | null;
}) {
  const tr = useTr();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [unit, setUnit] = useState<string | null>(null);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // Seed the fields from the copy source each time a new source opens.
  if (opened && source && seededFrom !== source.id) {
    setSeededFrom(source.id);
    setNameJa(source.name !== "—" ? `${source.name}（コピー）` : "");
    setNameTranslations({});
    setUnit(source.unit);
  }

  const materialSpecText = source?.materialTypeId
    ? `${source.materialTypeLabel || "材種"} ／ φ${source.diameterMm ?? "—"} × ${source.lengthMm ?? "—"}mm`
    : "—";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nameJa.trim() || !unit) return;
    startTransition(async () => {
      const result = await createProduct({
        nameJa,
        nameTranslations,
        materialTypeId: source?.materialTypeId ?? null,
        diameterMm: source?.diameterMm ?? null,
        lengthMm: source?.lengthMm ?? null,
        unit,
        // キーワードは複製しない — 同じ語が 2 つの製品を指すと、AI 突合が
        // どちらか決められなくなる。複製先で改めて付ける。
        matchNames: [],
        isActive: true,
        notes: "",
        spec: [],
      });
      if (result.ok) {
        notifications.show({
          title: tr("複製しました"),
          message: `製品「${result.data.code}」を作成しました`,
          color: "green",
        });
        setSeededFrom(null);
        onClose();
        router.push(`/master/products/${result.data.id}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={() => {
        setSeededFrom(null);
        onClose();
      }}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel={tr("複製して新規作成")}
      title={tr("製品の複製")}
    >
      <Stack gap="sm">
        {/* 内部 ID ではなく製品名と採番済みコードを見せる */}
        <TextInput
          disabled
          label={tr("複製元")}
          readOnly
          value={
            source
              ? source.code
                ? `${source.name}（${source.code}）`
                : source.name
              : ""
          }
        />
        <LocalizedTextInput
          jaProps={{
            description: tr(
              tr("製品コードは保存時に自動採番されます（PRD-YYYYMM-NNNN）"),
            ),
            value: nameJa,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setNameJa(e.currentTarget.value),
          }}
          label={tr("名称")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <TextInput
          description={tr(
            tr(
              "複製元の材種・直径・全長を引き継ぎます（作成後に編集できます）",
            ),
          )}
          disabled
          label={tr("素材仕様")}
          readOnly
          value={materialSpecText}
        />
        <Select
          data={unitOptions(locale)}
          label={tr("単位")}
          onChange={setUnit}
          value={unit}
          withAsterisk
        />
      </Stack>
    </FormModal>
  );
}
