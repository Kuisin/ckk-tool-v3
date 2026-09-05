"use client";

/**
 * PurchaseOrderNew — 素材発注書 新規作成 (PU12) の入れ物。
 *
 * 「AI で読み取る」パネル（任意）とフォームを縦に並べるだけの薄い層。
 * 読み取り結果を反映するとフォームを **key ごと作り直す** — @mantine/form の
 * `initialValues` は初回マウントでしか読まれないため（値を 1 つずつ
 * setFieldValue で流し込むと、明細の増減で行の対応が崩れる）。
 *
 * 読ませた原本は保存が済んでから証憑として添付する。**添付の失敗で発注書を
 * 巻き戻さない** — 紙は後からでも足せるが、作り直しは人の手間になる。
 */

import { Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { learnMaterialOrderAliases } from "@/app/(dashboard)/purchase/purchase-orders/actions";
import {
  PurchaseOrderAiImport,
  type PurchaseOrderAiPrefill,
} from "./PurchaseOrderAiImport";
import { PurchaseOrderForm } from "./PurchaseOrderForm";

interface Option {
  value: string;
  label: string;
}

export function PurchaseOrderNew({
  supplierOptions,
  plantOptions,
}: {
  supplierOptions: Option[];
  plantOptions: Option[];
}) {
  const tr = useTranslations();
  const [prefill, setPrefill] = useState<PurchaseOrderAiPrefill | null>(null);
  // 反映のたびにフォームを作り直すための鍵。
  const [formKey, setFormKey] = useState(0);
  const sourceFile = useRef<File | null>(null);

  const apply = (next: PurchaseOrderAiPrefill) => {
    setPrefill(next);
    setFormKey((k) => k + 1);
    notifications.show({
      title: tr("purchase.intake.applied"),
      message: tr("purchase.intake.appliedMessage", {
        count: next.items.length,
      }),
      color: "green",
    });
  };

  /** 作成できたあとの後始末（証憑の添付 + 学習）。どちらも best-effort。 */
  const afterCreate = async (poNumber: string) => {
    const file = sourceFile.current;
    if (file) {
      try {
        const body = new FormData();
        body.set("ownerType", "material_purchase_orders");
        body.set("ownerId", poNumber);
        body.set("label", tr("purchase.intake.attachmentLabel"));
        body.set("file", file);
        const res = await fetch("/api/attachments/upload", {
          method: "POST",
          body,
        });
        if (!res.ok) throw new Error("attach failed");
      } catch {
        notifications.show({
          title: tr("purchase.intake.attachFailed"),
          message: tr("purchase.intake.attachFailedMessage"),
          color: "orange",
        });
      }
    }
    if (prefill) {
      await learnMaterialOrderAliases({
        extractedSupplierName: prefill.extractedSupplierName,
        supplierBpId: prefill.supplierBpId,
        lines: prefill.extractedLines,
      }).catch(() => {
        /* 学習は次回を楽にするだけ — 失敗しても何も止めない */
      });
    }
  };

  return (
    <Stack gap="md">
      <PurchaseOrderAiImport
        onApply={apply}
        onFile={(f) => {
          sourceFile.current = f;
        }}
        supplierOptions={supplierOptions}
      />
      <PurchaseOrderForm
        key={formKey}
        mode="create"
        onCreated={afterCreate}
        plantOptions={plantOptions}
        prefill={prefill}
        supplierOptions={supplierOptions}
      />
    </Stack>
  );
}
