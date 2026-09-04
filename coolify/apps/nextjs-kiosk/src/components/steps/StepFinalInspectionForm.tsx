"use client";

/**
 * StepFinalInspectionForm.tsx — 最終検査・出荷前確認（キオスク版）。
 *
 * nextjs-web の WorkOrderFinalInspectionPanel と同じ業務規則。記録は
 * **指示書 1 件に 1 行**で、記入口は最終検査工程（カタログの印）の実行画面だけ。
 * 3 項目チェック（○ / × + 確認者スタンプ）+ 予備在庫（単純トグル）+
 * 出荷前チェーン（棚包 → 納品書発行 → 出荷許可。紙の記入順のまま前段が済むまで
 * 次段は押せない）+ 出荷時不良内容確認者印（任意メモ）。
 *
 * タブレット向け縦積み・size="lg"。書けるのは作業中／一時停止中だけで、
 * それ以外は読み取り専用（押せないボタンを並べず、記録済みの印だけを出す）。
 */

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  FinalCheckField,
  FinalInspectionView,
  FinalShipmentStage,
  FinalSpareStockField,
  FinalStamp,
} from "@/lib/final-inspection";
import { fillMessage } from "@/lib/i18n";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

type Props = {
  stepId: string;
  finalInspection: FinalInspectionView;
  /** 作業中／一時停止中のみ true（それ以外は読み取り専用）。 */
  canRecord: boolean;
};

export function StepFinalInspectionForm({
  stepId,
  finalInspection: fi,
  canRecord,
}: Props) {
  const router = useRouter();
  const { m, locale } = useI18n();
  const t = m.steps.finalInspection;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState(fi.shipDefectNotes ?? "");

  const run = async (body: Parameters<typeof callStepAction>[1]) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callStepAction(stepId, body);
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      router.refresh(); // 競合（他端末が先に押した等）は最新状態を出し直す
      return;
    }
    setSaved(true);
    router.refresh();
  };

  /** 確認者スタンプの表示（未記録は空文字）。 */
  const stampText = (s: FinalStamp): string =>
    s.at == null
      ? ""
      : fillMessage(t.checkedMeta, {
          at: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
            timeZone: "Asia/Tokyo",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(s.at)),
          by: s.byName ?? "",
        });

  const CHECKS: {
    field: FinalCheckField;
    label: string;
    ok: boolean | null;
    stamp: FinalStamp;
  }[] = [
    {
      field: "drawingLabel",
      label: t.checkDrawingLabel,
      ok: fi.drawingLabelOk,
      stamp: fi.drawingLabel,
    },
    {
      field: "protectiveCap",
      label: t.checkProtectiveCap,
      ok: fi.protectiveCapOk,
      stamp: fi.protectiveCap,
    },
    {
      field: "finishedQuantity",
      label: t.checkFinishedQuantity,
      ok: fi.finishedQuantityOk,
      stamp: fi.finishedQuantity,
    },
  ];

  const STAGES: {
    stage: FinalShipmentStage;
    label: string;
    stamp: FinalStamp;
  }[] = [
    { stage: "shelved", label: t.shelvedBy, stamp: fi.shelved },
    {
      stage: "deliveryNoteIssued",
      label: t.deliveryNoteIssuedBy,
      stamp: fi.deliveryNoteIssued,
    },
    {
      stage: "shipmentAuthorized",
      label: t.shipmentAuthorizedBy,
      stamp: fi.shipmentAuthorized,
    },
  ];

  const SPARE: {
    field: FinalSpareStockField;
    label: string;
    value: boolean;
  }[] = [
    {
      field: "spareStockUsed",
      label: t.useSpareStock,
      value: fi.spareStockUsed,
    },
    {
      field: "spareStockReceived",
      label: t.receiveIntoSpareStock,
      value: fi.spareStockReceived,
    },
  ];

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={4}>{t.title}</Title>
          <Text c="dimmed" size="sm">
            {canRecord ? t.subtitle : t.readOnly}
          </Text>
        </Stack>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}
        {saved && (
          <Alert color="green" icon={<IconCheck size={20} />}>
            {t.saved}
          </Alert>
        )}

        {/* ■最終検査（3 項目 — ○ / × と押した人） */}
        <Stack gap="sm">
          {CHECKS.map(({ field, label, ok, stamp }) => (
            <Stack gap={4} key={field}>
              <Text fw={600}>{label}</Text>
              <Group gap="sm" wrap="wrap">
                {canRecord ? (
                  <Button.Group>
                    {([true, false] as const).map((value) => (
                      <Button
                        // ○ / × だけでは読み上げがどの項目か分からない。
                        aria-label={fillMessage(value ? t.markOk : t.markNg, {
                          item: label,
                        })}
                        color={value ? "green" : "red"}
                        disabled={busy}
                        key={String(value)}
                        onClick={() =>
                          run({
                            action: "FINAL_CHECK",
                            checkField: field,
                            checkOk: value,
                          })
                        }
                        size="lg"
                        variant={ok === value ? "filled" : "default"}
                      >
                        {value ? "○" : "×"}
                      </Button>
                    ))}
                  </Button.Group>
                ) : (
                  <Badge
                    color={
                      ok === true ? "green" : ok === false ? "red" : "gray"
                    }
                    size="lg"
                    variant="light"
                  >
                    {ok === true ? "○" : ok === false ? "×" : t.notChecked}
                  </Badge>
                )}
                {stamp.at && (
                  <Text c="dimmed" size="sm">
                    {stampText(stamp)}
                  </Text>
                )}
              </Group>
            </Stack>
          ))}
        </Stack>

        {/* 予備在庫（単純トグル — 確認者スタンプなし） */}
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            {t.spareStockTitle}
          </Text>
          <Group gap="xl" wrap="wrap">
            {SPARE.map(({ field, label, value }) => (
              <Checkbox
                checked={value}
                disabled={!canRecord || busy}
                key={field}
                label={label}
                onChange={(e) =>
                  run({
                    action: "FINAL_SPARE_STOCK",
                    spareStockField: field,
                    spareStockValue: e.currentTarget.checked,
                  })
                }
                size="md"
              />
            ))}
          </Group>
        </Stack>

        {/* 出荷前チェーン — 前段が済むまで次段は押せない（紙の記入順） */}
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            {t.shipmentTitle}
          </Text>
          {STAGES.map(({ stage, label, stamp }, idx) => {
            const priorDone = idx === 0 || STAGES[idx - 1].stamp.at != null;
            return (
              <Group gap="sm" justify="space-between" key={stage} wrap="wrap">
                <Text>{label}</Text>
                {stamp.at ? (
                  <Badge color="green" size="lg" variant="light">
                    {stampText(stamp)}
                  </Badge>
                ) : !canRecord ? (
                  <Text c="dimmed">—</Text>
                ) : (
                  <Button
                    disabled={busy || !priorDone}
                    onClick={() =>
                      run({
                        action: "FINAL_SHIPMENT_STAGE",
                        shipmentStage: stage,
                      })
                    }
                    variant="light"
                  >
                    {priorDone ? t.record : t.waitingPriorStage}
                  </Button>
                )}
              </Group>
            );
          })}
        </Stack>

        {/* 出荷時不良内容確認者印（任意メモ + 確認スタンプ） */}
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            {t.shipDefectTitle}
          </Text>
          {fi.shipDefectReviewed.at && (
            <Text c="dimmed" size="sm">
              {stampText(fi.shipDefectReviewed)}
            </Text>
          )}
          {canRecord ? (
            <>
              <Textarea
                minRows={2}
                onChange={(e) => setNotes(e.currentTarget.value)}
                placeholder={t.shipDefectPlaceholder}
                size="lg"
                value={notes}
              />
              <Button
                fullWidth
                loading={busy}
                onClick={() =>
                  run({ action: "FINAL_SHIP_DEFECT", shipDefectNotes: notes })
                }
                variant="default"
              >
                {t.shipDefectConfirm}
              </Button>
            </>
          ) : (
            <Text style={{ whiteSpace: "pre-wrap" }}>
              {fi.shipDefectNotes || "—"}
            </Text>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
