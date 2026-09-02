"use client";

/**
 * DeletePriceListModal — destructive confirm (design.md §10.4 / §16.2).
 * Controlled; opened from the list row action or detail menu. Deletes the
 * entry (tiers + 値引きルール含む) via Server Action.
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { deletePriceEntries } from "@/app/(dashboard)/sales/price-lists/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";
import type { PriceListEntry } from "./model";

export function DeletePriceListModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: PriceListEntry | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target
          ? tr("sales.deletePriceListModal.confirmDeleteMessage", {
              productName: target.productName,
            })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deletePriceEntries([target.entryId]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("sales.deletePriceListModal.deletedMessage", {
                productName: target.productName,
              }),
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("sales.priceLists.deleteThePriceList")}
      warning={tr("sales.priceLists.ifQuotesReferenceThisPriceList")}
    />
  );
}
