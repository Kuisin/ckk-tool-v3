"use client";

/**
 * PurchaseOrderAiImport — 素材発注書 (PU12) の「仕入先の書類から作る」入口。
 *
 * 仕入先の見積書 / 注文請書 / 発注書控え（PDF・画像）を po-extract に読ませ、
 * 仕入先と素材まで突合したうえで、下の発注書フォームへ流し込む。
 *
 * **フォームへ入れる前に 1 枚挟むのが肝。** 読み取り結果を直接フォームへ
 * 書き込むと、突合できなかった行が「素材が空の明細」として並ぶだけになり、
 * 印字されていた品名がどこにも残らない（＝どの行を直しているのか分からなく
 * なる）。ここで行ごとに 一致 / 推定 / 未特定 を出し、印字された文字列を
 * 添えて選ばせてから反映する。
 *
 * 未特定のまま反映してもよい — 素材が空の明細はフォームの検証が止めるので、
 * **勝手に素材を作ることも、当てずっぽうで埋めることもしない**。
 */

import {
  Alert,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconInfoCircle } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { FormSection } from "@/components/ui/shells";
import { unitOptions } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import type {
  MaterialOrderDraft,
  PurchaseIntakeLine,
} from "@/lib/purchase-intake-core";
import { IntakeUploader } from "../intake/IntakeUploader";
import { MaterialMatchField } from "../intake/MaterialMatchField";

interface Option {
  value: string;
  label: string;
}

/** 発注書フォームへ渡す初期値（+ 学習に使う「印字されていた表記」）。 */
export interface PurchaseOrderAiPrefill {
  supplierBpId: string;
  purchaseDate: string | null;
  notes: string;
  items: {
    materialId: string;
    materialLabel: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    expectedAt: string | null;
    notes: string;
  }[];
  /** 学習用（保存に成功したあとに `match_aliases` へ貯める）。 */
  extractedSupplierName: string | null;
  extractedLines: {
    materialText: string | null;
    materialCode: string | null;
    materialId: string | null;
  }[];
}

/** 抽出された単位を、フォームの選択肢に収まる形へ寄せる。 */
function normalizeUnit(raw: string | null, allowed: Option[]): string {
  const t = raw?.trim();
  if (t && allowed.some((o) => o.value === t)) return t;
  return allowed[0]?.value ?? "本"; // i18n-ignore — DB データの既定値（単位）
}

export function PurchaseOrderAiImport({
  onApply,
  onFile,
  supplierOptions,
}: {
  onApply: (prefill: PurchaseOrderAiPrefill) => void;
  /** 読ませた原本（作成後に証憑として添付する）。 */
  onFile: (file: File | null) => void;
  supplierOptions: Option[];
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const units = unitOptions(locale);

  const [draft, setDraft] = useState<MaterialOrderDraft | null>(null);
  /** 抽出時点で自動確定していた行（人が選んだ分と区別して色を出す）。 */
  const [autoMatched, setAutoMatched] = useState<boolean[]>([]);
  const [supplierBpId, setSupplierBpId] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);

  const receive = (value: unknown) => {
    const next = value as MaterialOrderDraft;
    setDraft(next);
    setAutoMatched(next.lines.map((l) => l.materialId != null));
    setSupplierBpId(next.supplierBpId);
    setPurchaseDate(next.orderDate);
  };

  const setLine = (index: number, patch: Partial<PurchaseIntakeLine>) =>
    setDraft((cur) =>
      cur
        ? {
            ...cur,
            lines: cur.lines.map((l, i) =>
              i === index ? { ...l, ...patch } : l,
            ),
          }
        : cur,
    );

  const unmatched = draft?.lines.filter((l) => !l.materialId).length ?? 0;

  const apply = () => {
    if (!draft || !supplierBpId) return;
    onApply({
      supplierBpId,
      purchaseDate,
      notes: draft.notes ?? "",
      // 未突合の行も**落とさずに**渡す（素材だけ空。印字された品名は備考へ
      // 逃がしてあるので、フォーム上でも何の行なのかが読める）。
      items: draft.lines.map((l) => ({
        materialId: l.materialId ?? "",
        materialLabel: l.materialLabel ?? "",
        quantity: l.quantity,
        unit: normalizeUnit(l.materialUnit ?? l.unit, units),
        unitPrice: l.unitPrice ?? 0,
        expectedAt: l.expectedDate,
        notes: [
          l.notes,
          l.materialId ? null : (l.materialText ?? l.materialCode),
        ]
          .filter((v): v is string => !!v)
          .join(" / "),
      })),
      extractedSupplierName: draft.supplierName,
      extractedLines: draft.lines.map((l) => ({
        materialText: l.materialText,
        materialCode: l.materialCode,
        materialId: l.materialId,
      })),
    });
  };

  return (
    <FormSection
      description={tr("purchase.intake.orderDescription")}
      title={tr("purchase.intake.title")}
    >
      <IntakeUploader
        description={tr("purchase.intake.orderUploadHint")}
        endpoint="/api/extract/material-order"
        onDraft={receive}
        onFile={onFile}
      />

      {draft && (
        <>
          <Divider my="md" />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
              placeholder={tr("common.selectASupplier")}
              searchable
              value={supplierBpId}
              withAsterisk
            />
            <DatePickerInput
              clearable
              label={tr("common.orderDate")}
              onChange={setPurchaseDate}
              placeholder={tr("common.pickADate")}
              value={purchaseDate}
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

          <Text fw={600} mt="md" size="sm">
            {tr("purchase.intake.lines")}
          </Text>

          {draft.lines.length === 0 ? (
            <Alert
              color="orange"
              icon={<IconInfoCircle size={16} />}
              mt="xs"
              variant="light"
            >
              {tr("purchase.intake.noLines")}
            </Alert>
          ) : (
            <Stack gap="sm" mt="xs">
              {draft.lines.map((line, index) => (
                <Paper
                  key={`${line.materialCode ?? line.materialText ?? "line"}-${index}`}
                  p="sm"
                  radius="sm"
                  withBorder
                >
                  <Stack gap="xs">
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
                    {/* モバイルでは 1 列に積む（design.md §20.2 — 編集可能な表は
                        カードにする。3 列に割ると 1 列 40px になり読めない）。 */}
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
                      <Select
                        data={units}
                        label={tr("common.unit")}
                        onChange={(v) => setLine(index, { unit: v })}
                        value={normalizeUnit(
                          line.materialUnit ?? line.unit,
                          units,
                        )}
                      />
                      <NumberInput
                        decimalScale={2}
                        label={tr("common.unitPrice")}
                        min={0}
                        onChange={(v) =>
                          setLine(index, { unitPrice: Number(v) || 0 })
                        }
                        prefix="¥"
                        thousandSeparator=","
                        value={line.unitPrice ?? 0}
                      />
                      <DatePickerInput
                        clearable
                        label={tr("purchase.intake.expectedDate")}
                        onChange={(v) => setLine(index, { expectedDate: v })}
                        placeholder={tr("common.pickADate")}
                        value={line.expectedDate}
                        valueFormat="YYYY/MM/DD"
                      />
                    </SimpleGrid>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

          {unmatched > 0 && (
            <Alert
              color="yellow"
              icon={<IconInfoCircle size={16} />}
              mt="sm"
              variant="light"
            >
              {tr("purchase.intake.unmatchedWarning", { count: unmatched })}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <PrimaryButton
              disabled={!supplierBpId || draft.lines.length === 0}
              onClick={apply}
            >
              {tr("purchase.intake.applyToForm")}
            </PrimaryButton>
          </Group>
        </>
      )}
    </FormSection>
  );
}
