"use client";

/**
 * DeletePriceListModal — destructive confirm (design.md §10.4 / §16.2).
 * Controlled; opened from the list row action or detail menu. Deletes the
 * entry (tiers + 値引きルール含む) via Server Action.
 */

import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import { deletePriceEntries } from "@/app/(dashboard)/sales/price-lists/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";
import { entryKeyParts, type PriceListEntry } from "./model";

export function DeletePriceListModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: PriceListEntry | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `「${target.productName}」の価格表を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deletePriceEntries([entryKeyParts(target)]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `「${target.productName}」の価格表を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title="価格表の削除"
      warning="この価格表を参照中の見積書がある場合、単価の自動入力ができなくなります。"
    />
  );
}
