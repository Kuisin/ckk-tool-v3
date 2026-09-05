"use client";

/**
 * MaterialReceiptIntake — 納品書から素材入荷をまとめて登録する画面 (PU03)。
 *
 * 納品書は 1 枚に何行も載るが `material_receipts` は **1 行 = 1 素材**なので、
 * 1 件ずつ登録する既存フォーム（../new）では紙 1 枚に何度も往復することに
 * なる。ここは「1 枚読ませて、行を確かめて、まとめて登録する」ための面。
 *
 * 決めごと:
 *   - **単位は素材マスタの単位で固定**（読み取り専用）。台帳の単位と揃える
 *     ためで、サーバー側も不一致を拒む。紙に「kg」と刷ってあってもマスタが
 *     「本」なら本で入る（在庫が二重単位にならない）。
 *   - **素材が決まっていない行は登録できない。** 勝手に作らず、勝手に近い
 *     ものを当てもしない — 印字された文字列を出して人に選ばせる。
 *   - 行ごとに「この行を登録しない」を置く。納品書には別工場宛の行や
 *     付属品の行が混ざるので、全部入れるか全部やめるかしか無いと使えない。
 *   - 登録は **1 トランザクション**（サーバー側）。途中で落ちて半分だけ
 *     入荷済み、という状態を作らない。
 */

import {
  Alert,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { createReceiptsFromDelivery } from "@/app/(dashboard)/purchase/material-receipts/intake/actions";
import {
  CancelButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import type {
  MaterialDeliveryDraft,
  PurchaseIntakeLine,
} from "@/lib/purchase-intake-core";
import { IntakeUploader } from "../intake/IntakeUploader";
import { MaterialMatchField } from "../intake/MaterialMatchField";

const BASE_PATH = "/purchase/material-receipts";

interface Option {
  value: string;
  label: string;
}

/** 画面が編集する 1 行（抽出結果 + 入荷として決める分）。 */
interface EditableLine extends PurchaseIntakeLine {
  /** 登録するか（既定 true。素材が決まらない行は自動で false にはしない —
   *  「決められないので外した」のか「決め忘れた」のかを人に見せるため）。 */
  include: boolean;
  plantId: string | null;
  receivedAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function MaterialReceiptIntake({
  supplierOptions,
  plantOptions,
}: {
  supplierOptions: Option[];
  plantOptions: Option[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState<MaterialDeliveryDraft | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [autoMatched, setAutoMatched] = useState<boolean[]>([]);
  const [supplierBpId, setSupplierBpId] = useState<string | null>(null);
  const sourceFile = useRef<File | null>(null);

  const receive = (value: unknown) => {
    const next = value as MaterialDeliveryDraft;
    setDraft(next);
    setAutoMatched(next.lines.map((l) => l.materialId != null));
    setSupplierBpId(next.supplierBpId);
    setLines(
      next.lines.map((l) => ({
        ...l,
        include: true,
        plantId: null,
        // 入荷日の既定は**納品書の日付**（無ければ今日）。紙に書いてある日を
        // 既定にしないと、後日入力した分が入力日で記録される。
        receivedAt: next.deliveryDate ?? today(),
      })),
    );
  };

  const setLine = (index: number, patch: Partial<EditableLine>) =>
    setLines((cur) =>
      cur.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );

  /** 全行にまとめて同じ拠点・入荷日を当てる（1 枚の納品書は普通ひとつ宛先）。 */
  const applyToAll = (patch: Partial<EditableLine>) =>
    setLines((cur) => cur.map((l) => ({ ...l, ...patch })));

  const selected = lines.filter((l) => l.include);
  const blocked = selected.filter((l) => !l.materialId);

  const submit = () => {
    if (!draft) return;
    if (selected.length === 0) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("purchase.intake.selectAtLeastOneLine"),
        color: "red",
      });
      return;
    }
    if (blocked.length > 0) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("purchase.intake.unmatchedBlocks", {
          count: blocked.length,
        }),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await createReceiptsFromDelivery({
        supplierBpId,
        extractedSupplierName: draft.supplierName,
        lines: selected.map((l) => ({
          materialId: l.materialId as string,
          plantId: l.plantId,
          quantity: l.quantity,
          receivedAt: l.receivedAt,
          notes: [l.notes, l.lotNumber ? `LOT ${l.lotNumber}` : null]
            .filter((v): v is string => !!v)
            .join(" / "),
          materialText: l.materialText,
          materialCode: l.materialCode,
        })),
      });
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("common.registered"),
        message: tr("purchase.intake.registeredMessage", {
          count: result.data.ids.length,
        }),
        color: "green",
      });
      // 原本（納品書）を作った入荷それぞれに添付する。**失敗しても登録は
      // 成立している**ので、通知だけ出して先へ進む。
      const file = sourceFile.current;
      if (file) {
        let failed = 0;
        for (const id of result.data.ids) {
          try {
            const body = new FormData();
            body.set("ownerType", "material_receipts");
            body.set("ownerId", id);
            body.set("label", tr("purchase.intake.attachmentLabel"));
            body.set("file", file);
            const res = await fetch("/api/attachments/upload", {
              method: "POST",
              body,
            });
            if (!res.ok) failed += 1;
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          notifications.show({
            title: tr("purchase.intake.attachFailed"),
            message: tr("purchase.intake.attachFailedMessage"),
            color: "orange",
          });
        }
      }
      router.push(BASE_PATH);
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.purchasing"),
          { label: tr("common.materialReceipt"), href: BASE_PATH },
          tr("purchase.intake.receiptPageTitle"),
        ]}
        title={tr("purchase.intake.receiptPageTitle")}
      />

      <FormSection
        description={tr("purchase.intake.deliveryDescription")}
        title={tr("purchase.intake.title")}
      >
        <IntakeUploader
          description={tr("purchase.intake.deliveryUploadHint")}
          endpoint="/api/extract/material-delivery"
          onDraft={receive}
          onFile={(f) => {
            sourceFile.current = f;
          }}
        />
      </FormSection>

      {draft && (
        <FormSection
          description={tr("purchase.intake.receiptLinesDescription")}
          title={tr("purchase.intake.lines")}
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Select
              clearable
              data={supplierOptions}
              description={
                draft.supplierName
                  ? tr("purchase.intake.extractedAs", {
                      text: draft.supplierName,
                    })
                  : tr("purchase.intake.supplierNotRead")
              }
              label={tr("common.supplier")}
              onChange={setSupplierBpId}
              placeholder={tr(
                "purchase.materialReceipts.selectASupplierOptional",
              )}
              searchable
              value={supplierBpId}
            />
            <Select
              clearable
              data={plantOptions}
              description={tr("purchase.intake.appliesToAllLines")}
              label={tr("purchase.materialReceipts.receivingSite")}
              onChange={(v) => applyToAll({ plantId: v })}
              placeholder={tr("common.selectASiteOptional")}
              value={lines[0]?.plantId ?? null}
            />
            <DatePickerInput
              description={tr("purchase.intake.appliesToAllLines")}
              label={tr("common.receivedDate")}
              onChange={(v) => v && applyToAll({ receivedAt: v })}
              value={lines[0]?.receivedAt ?? today()}
              valueFormat="YYYY/MM/DD"
            />
          </SimpleGrid>

          {/* 仕入先が絞れなかったときの「もしかして」。 */}
          {!draft.supplierBpId && draft.supplierCandidates.length > 0 && (
            <Group gap="xs" mt="xs" wrap="wrap">
              <Text c="dimmed" size="xs">
                {tr("purchase.intake.didYouMean")}
              </Text>
              {draft.supplierCandidates.map((c) => (
                <SecondaryButton
                  key={c.id}
                  onClick={() => setSupplierBpId(c.id)}
                  size="xs"
                >
                  {c.label}
                </SecondaryButton>
              ))}
            </Group>
          )}

          <Divider my="md" />

          {lines.length === 0 ? (
            <Alert
              color="orange"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              {tr("purchase.intake.noLines")}
            </Alert>
          ) : (
            <Stack gap="sm">
              {lines.map((line, index) => (
                <Paper
                  bg={line.include ? undefined : "var(--mantine-color-gray-0)"}
                  key={`${line.materialCode ?? line.materialText ?? "line"}-${index}`}
                  p="sm"
                  radius="sm"
                  withBorder
                >
                  <Stack gap="xs">
                    <Checkbox
                      checked={!line.include}
                      label={tr("purchase.intake.skipLine")}
                      onChange={(e) =>
                        setLine(index, { include: !e.currentTarget.checked })
                      }
                      size="xs"
                    />
                    <MaterialMatchField
                      autoMatched={autoMatched[index] ?? false}
                      line={line}
                      onPick={(pick) =>
                        setLine(index, {
                          materialId: pick.materialId,
                          materialLabel: pick.materialLabel,
                        })
                      }
                    />
                    <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="xs">
                      <NumberInput
                        decimalScale={3}
                        label={tr("common.quantity")}
                        min={0}
                        onChange={(v) =>
                          setLine(index, { quantity: Number(v) || 0 })
                        }
                        value={line.quantity}
                      />
                      <TextInput
                        description={tr(
                          "purchase.materialReceipts.unitFromMaterial",
                        )}
                        label={tr("common.unit")}
                        readOnly
                        value={line.materialUnit ?? line.unit ?? ""}
                      />
                      <Select
                        clearable
                        data={plantOptions}
                        label={tr("purchase.materialReceipts.receivingSite")}
                        onChange={(v) => setLine(index, { plantId: v })}
                        placeholder={tr("common.selectASiteOptional")}
                        value={line.plantId}
                      />
                      <DatePickerInput
                        label={tr("common.receivedDate")}
                        onChange={(v) => v && setLine(index, { receivedAt: v })}
                        value={line.receivedAt}
                        valueFormat="YYYY/MM/DD"
                      />
                    </SimpleGrid>
                    {line.lotNumber && (
                      <Text c="dimmed" size="xs">
                        {tr("purchase.intake.lotNumber", {
                          lot: line.lotNumber,
                        })}
                      </Text>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

          {blocked.length > 0 && (
            <Alert
              color="yellow"
              icon={<IconInfoCircle size={16} />}
              mt="sm"
              variant="light"
            >
              {tr("purchase.intake.unmatchedBlocks", { count: blocked.length })}
            </Alert>
          )}

          <Group
            className="form-actions"
            justify="flex-end"
            mt="md"
            wrap="wrap"
          >
            <CancelButton
              disabled={isPending}
              onClick={() => router.push(BASE_PATH)}
            />
            <PrimaryButton
              disabled={selected.length === 0 || blocked.length > 0}
              loading={isPending}
              onClick={submit}
            >
              {tr("purchase.intake.registerSelected", {
                count: selected.length,
              })}
            </PrimaryButton>
          </Group>
        </FormSection>
      )}
    </Stack>
  );
}
