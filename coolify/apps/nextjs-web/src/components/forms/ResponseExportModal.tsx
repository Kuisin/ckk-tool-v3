"use client";

/**
 * ResponseExportModal — 回答を Excel で落とす / PDF でまとめて印刷する。
 *
 * **絞り込みはダウンロードの直前に選ぶ。** 一覧に絞り込み欄を常設しなかったのは、
 * 回答を「見る」ときと「配る・保管する」ときで欲しい範囲が違うため — 画面では
 * 全部を眺めておいて、渡すときだけ「3 月の承認済みだけ」に絞る、という使い方に
 * なる。
 *
 * 組み立てた条件は URL のクエリにして route handler へ渡す。規約は
 * lib/form-export-core.ts が画面と route の**両方**に対して 1 つだけ持つ。
 */

import {
  Checkbox,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconFileTypePdf, IconTableExport } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import { downloadFile } from "@/lib/download";
import {
  EXPORTABLE_STATUSES,
  exportFilterToParams,
} from "@/lib/form-export-core";
import type { FormFieldDef } from "@/lib/form-schema";
import { statusLabel as statusMapLabel } from "@/lib/status-map";

export function ResponseExportModal({
  opened,
  onClose,
  code,
  formTitle,
  fields,
  responseCount,
}: {
  opened: boolean;
  onClose: () => void;
  code: string;
  formTitle: string;
  /** 選べる項目（related は値を持たないので呼び出し側で除いておく）。 */
  fields: FormFieldDef[];
  responseCount: number;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const params = exportFilterToParams({ statuses, from, to, fieldKeys });

  const run = async (kind: "xlsx" | "pdf") => {
    setBusy(true);
    try {
      const qs = params.toString();
      const url =
        kind === "xlsx"
          ? `/api/forms/${code}/responses/export${qs ? `?${qs}` : ""}`
          : `/api/pdf/form-response?code=${encodeURIComponent(code)}${qs ? `&${qs}` : ""}&download=1`;
      // 上限に当たったときは、サーバがファイル名の末尾に「_一部」を付けて返す。
      // 表の中に「以下略」の行を混ぜるとデータが汚れるし、応答ヘッダは
      // 通常のダウンロード（<a download>）では読めないため、**名前で伝える**。
      await downloadFile(url, `${formTitle}.${kind}`);
      onClose();
    } catch {
      notifications.show({
        title: tr("common.error2"),
        message: tr("forms.responseExportModal.couldNotExport"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  const allFieldsChecked = fieldKeys.length === 0;

  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={opened}
      size="lg"
      title={tr("forms.responseExportModal.exportTheResponses")}
    >
      <Stack gap="md">
        {/* 件数を「一覧に出ている数」と結び付けない — 一覧は 500 件までしか
            出さないが、書き出しはもっと多くを含む。数を約束すると食い違う。 */}
        <Text c="dimmed" size="sm">
          条件を指定しなければ、あなたが見られる回答をすべて書き出します
          （一覧には {responseCount} 件を表示中）。
        </Text>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("common.status")}
          </Text>
          <Checkbox.Group onChange={setStatuses} value={statuses}>
            <Group gap="md">
              {EXPORTABLE_STATUSES.map((s) => (
                <Checkbox
                  key={s}
                  label={statusMapLabel("FormResponse", s)}
                  value={s}
                />
              ))}
            </Group>
          </Checkbox.Group>
          <Text c="dimmed" size="xs">
            {tr("forms.responseExportModal.ifNoneIsChosenEveryStatus")}
          </Text>
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("common.submittedOn")}
          </Text>
          <Group gap="sm" grow={!isMobile}>
            <DatePickerInput
              clearable
              label={tr("common.start")}
              maxDate={to ?? undefined}
              onChange={setFrom as never}
              placeholder={tr("forms.responseExportModal.notSpecified")}
              value={from}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label={tr("forms.responseExportModal.end")}
              minDate={from ?? undefined}
              onChange={setTo as never}
              placeholder={tr("forms.responseExportModal.notSpecified")}
              value={to}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            {tr("forms.responseExportModal.includesWhatWasSubmittedOnThe")}
          </Text>
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              {tr("forms.responseExportModal.fieldsToExport")}
            </Text>
            {!allFieldsChecked && (
              <GhostButton onClick={() => setFieldKeys([])}>
                {tr("forms.responseExportModal.resetAll")}
              </GhostButton>
            )}
          </Group>
          <Text c="dimmed" size="xs">
            {allFieldsChecked
              ? tr("forms.responseExportModal.everyFieldBecomesAColumnUncheck")
              : tr("forms.responseExportModal.fieldsSelectedCount", {
                  count: fieldKeys.length,
                })}
          </Text>
          <ScrollArea.Autosize mah={180}>
            <Checkbox.Group
              onChange={setFieldKeys}
              // 「すべて」の状態では全部にチェックが入って見えるようにする
              // （空 = すべて、という内部表現をそのまま見せない）。
              value={allFieldsChecked ? fields.map((f) => f.key) : fieldKeys}
            >
              <Stack gap={6}>
                {fields.map((f) => (
                  <Checkbox
                    key={f.key}
                    label={f.label.ja || f.label.en || f.key}
                    value={f.key}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
          </ScrollArea.Autosize>
        </Stack>

        <Divider />

        {isMobile ? (
          <Stack gap="xs">
            <PrimaryButton
              fullWidth
              leftSection={<IconTableExport size={14} />}
              loading={busy}
              onClick={() => run("xlsx")}
            >
              {tr("forms.responseExportModal.downloadAsExcel")}
            </PrimaryButton>
            <SecondaryButton
              fullWidth
              leftSection={<IconFileTypePdf size={14} />}
              loading={busy}
              onClick={() => run("pdf")}
            >
              {tr("forms.responseExportModal.printThemTogetherAsAPdf")}
            </SecondaryButton>
          </Stack>
        ) : (
          <Group justify="flex-end">
            <SecondaryButton
              leftSection={<IconFileTypePdf size={14} />}
              loading={busy}
              onClick={() => run("pdf")}
            >
              {tr("forms.responseExportModal.printThemTogetherAsAPdf")}
            </SecondaryButton>
            <PrimaryButton
              leftSection={<IconTableExport size={14} />}
              loading={busy}
              onClick={() => run("xlsx")}
            >
              {tr("forms.responseExportModal.downloadAsExcel")}
            </PrimaryButton>
          </Group>
        )}
      </Stack>
    </ModalShell>
  );
}
