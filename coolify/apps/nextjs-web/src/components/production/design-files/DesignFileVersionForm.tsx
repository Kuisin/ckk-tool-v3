"use client";

/**
 * DesignFileVersionForm — 設計図の版を 1 つ**下書きで**作る (PD16)。
 *
 * **版の登録口はここ 1 つ。** 設計依頼 (SA06) の成果物も、依頼を経ない
 * 取り込みも同じフォームを通る。保存すると下書きの版ができ、版の詳細で
 * 確定する（承認設定 MS0B に段があれば承認依頼）。確定するまでは指示書・
 * 製品マスタから見えない。
 *
 * 1 版 = 2D 原図 + 3D 原図 + プレビュー + 参考資料 + 仕様（どれも任意）。
 * 2D 原図に図脳 SXF (.sfc) を選ぶと、表題欄（品名・材質・刃数 …）と寸法
 * （外径・全長）を読んで仕様欄を埋める。得意先名が受注元の 1 社に決まれば
 * 受注元も選ぶ（決まらなければ選ばない — 違う顧客の系列に版を積むのが
 * 最悪の誤り）。
 *
 * 送信先は Server Action ではなく `/api/design-files/upload`
 * （Server Action のボディは 1MB で頭打ちになり、図面は普通に超える）。
 */

import { Alert, Select, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { searchProductItemOptions } from "@/app/(dashboard)/_shared/option-search";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions, FormSection } from "@/components/ui/shells";
import type { ProductItemDef, ResolvedProductType } from "@/lib/product-types";
import { matchCustomerOption, type SxfDrawingReading } from "@/lib/sxf-core";
import {
  applySxfReading,
  type DesignSpecErrors,
  DesignSpecFields,
  type DesignSpecFormState,
  initialDesignSpecState,
  toVersionSpecPayload,
  validateDesignSpec,
} from "./DesignSpecFields";
import {
  appendFileSlots,
  EMPTY_FILE_SLOTS,
  readSxfFile,
  SxfReadNotice,
  type VersionFileSlotState,
  VersionFileSlots,
} from "./VersionFileSlots";

interface Option {
  value: string;
  label: string;
}

/** 依頼から来たときの前提（製品・受注元は依頼が決めるので動かさない）。 */
export interface DesignRequestContext {
  id: string;
  requestNumber: string;
  /** 対象製品（品目, items.id）。 */
  itemId: number;
  productLabel: string;
  customerBpId: string | null;
  customerName: string | null;
}

export function DesignFileVersionForm({
  customerOptions,
  initialProduct,
  requestContext,
  productTypes,
  itemDefs,
}: {
  /** 版を載せられる受注元。空のままなら汎用。 */
  customerOptions: Option[];
  /** `?item=` から来たときの既定値。 */
  initialProduct: Option | null;
  /** `?request=` から来たときの依頼。 */
  requestContext: DesignRequestContext | null;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
}) {
  const tr = useTranslations();
  const router = useRouter();

  // 依頼から来たときは製品・受注元を依頼に合わせて固定する。ここで選び直せると
  // 「依頼の成果物なのに別製品の図面」が作れてしまう（サーバー側でも弾くが、
  // 選べる UI を出さないのが先）。
  const [itemId, setItemId] = useState<string | null>(
    requestContext
      ? String(requestContext.itemId)
      : (initialProduct?.value ?? null),
  );
  const [customerBpId, setCustomerBpId] = useState<string | null>(
    requestContext?.customerBpId ?? null,
  );
  const [spec, setSpec] = useState<DesignSpecFormState>(() =>
    initialDesignSpecState(null, productTypes, itemDefs),
  );
  const [specErrors, setSpecErrors] = useState<DesignSpecErrors | null>(null);
  const [files, setFiles] = useState<VersionFileSlotState>(EMPTY_FILE_SLOTS);
  const [sxf, setSxf] = useState<{
    reading: SxfDrawingReading | "unreadable";
    filled: number;
    customerMatched: boolean | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const onSxfPicked = async (file: File) => {
    const reading = await readSxfFile(file);
    if (!reading) {
      setSxf({ reading: "unreadable", filled: 0, customerMatched: null });
      return;
    }
    const { state, filled } = applySxfReading(
      spec,
      reading,
      productTypes,
      itemDefs,
      file.name,
    );
    setSpec(state);
    // 受注元は、依頼から来ていない・まだ選んでいないときだけ当てる。
    let customerMatched: boolean | null = null;
    if (!requestContext && customerBpId == null && reading.title.customerName) {
      const hit = matchCustomerOption(
        reading.title.customerName,
        customerOptions,
      );
      if (hit) setCustomerBpId(hit.value);
      customerMatched = hit != null;
    }
    setSxf({ reading, filled, customerMatched });
  };

  const submit = async () => {
    if (!itemId) return;
    const errors = validateDesignSpec(spec, productTypes, itemDefs, tr);
    setSpecErrors(errors);
    if (errors) {
      notifications.show({
        title: tr("common.inputError"),
        message: tr("production.designVersion.checkTheSpec"),
        color: "red",
      });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("itemId", itemId);
      if (customerBpId) body.set("customerBpId", customerBpId);
      if (requestContext) body.set("designRequestId", requestContext.id);
      body.set(
        "spec",
        JSON.stringify(toVersionSpecPayload(spec, productTypes)),
      );
      appendFileSlots(body, files);

      const res = await fetch("/api/design-files/upload", {
        method: "POST",
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        versionId?: string;
        version?: number;
        error?: string;
      } | null;
      if (res.ok && json?.ok && json.versionId) {
        notifications.show({
          title: tr("common.registered"),
          message: tr("production.designVersion.draftCreated", {
            version: json.version ?? 1,
          }),
          color: "green",
        });
        router.push(`/production/design-files/versions/${json.versionId}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            json?.error ?? tr("production.designFiles.couldNotRegisterIt"),
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
          {tr("production.designFileVersionForm.registeringAsResultOfRequest", {
            requestNumber: requestContext.requestNumber,
            productLabel: requestContext.productLabel,
            customerPart: requestContext.customerName
              ? tr("production.designFileVersionForm.andCustomerWithName", {
                  name: requestContext.customerName,
                })
              : tr("production.designFiles.generic"),
          })}
        </Alert>
      )}

      <FormSection title={tr("common.target")}>
        {requestContext ? null : (
          <SearchSelect
            initialOption={initialProduct ?? undefined}
            label={tr("common.product")}
            onChange={setItemId}
            onSearch={searchProductItemOptions}
            storageKey="design-file-product-item"
            value={itemId}
            withAsterisk
          />
        )}
        <Select
          clearable
          data={customerOptions}
          description={tr("production.designFiles.leaveItBlankForGenericUsed")}
          disabled={requestContext != null}
          label={tr("common.orderingCustomer")}
          onChange={setCustomerBpId}
          placeholder={tr("common.genericAllCustomers2")}
          searchable
          value={customerBpId}
        />
      </FormSection>

      <FormSection
        description={tr("production.designVersion.filesHint")}
        title={tr("common.file")}
      >
        {sxf && (
          <SxfReadNotice
            customerMatched={sxf.customerMatched}
            filled={sxf.filled}
            onClose={() => setSxf(null)}
            reading={sxf.reading}
          />
        )}
        <VersionFileSlots
          onChange={setFiles}
          onSxfPicked={onSxfPicked}
          value={files}
        />
      </FormSection>

      <DesignSpecFields
        errors={specErrors}
        itemDefs={itemDefs}
        onChange={setSpec}
        productTypes={productTypes}
        value={spec}
      />

      <FormActions
        disabled={!itemId}
        loading={busy}
        onCancel={() => router.back()}
        onSave={submit}
        submitLabel={tr("production.designVersion.saveDraft")}
      />
    </Stack>
  );
}
