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
        title: "エラー",
        message: "書き出しに失敗しました",
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
      title="回答を書き出す"
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
            状態
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
            選ばなければすべての状態。下書きは書き出せません。
          </Text>
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Text fw={600} size="sm">
            提出日
          </Text>
          <Group gap="sm" grow={!isMobile}>
            <DatePickerInput
              clearable
              label="開始"
              maxDate={to ?? undefined}
              onChange={setFrom as never}
              placeholder="指定なし"
              value={from}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label="終了"
              minDate={from ?? undefined}
              onChange={setTo as never}
              placeholder="指定なし"
              value={to}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            指定した日に提出されたものを含みます。日付で絞ると、まだ提出していない
            回答は外れます。
          </Text>
        </Stack>

        <Divider />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              書き出す項目
            </Text>
            {!allFieldsChecked && (
              <GhostButton onClick={() => setFieldKeys([])}>
                すべてに戻す
              </GhostButton>
            )}
          </Group>
          <Text c="dimmed" size="xs">
            {allFieldsChecked
              ? "すべての項目を列にします。減らしたいものだけ外してください。"
              : `${fieldKeys.length} 項目を選択中`}
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
              Excel でダウンロード
            </PrimaryButton>
            <SecondaryButton
              fullWidth
              leftSection={<IconFileTypePdf size={14} />}
              loading={busy}
              onClick={() => run("pdf")}
            >
              PDF でまとめて印刷
            </SecondaryButton>
          </Stack>
        ) : (
          <Group justify="flex-end">
            <SecondaryButton
              leftSection={<IconFileTypePdf size={14} />}
              loading={busy}
              onClick={() => run("pdf")}
            >
              PDF でまとめて印刷
            </SecondaryButton>
            <PrimaryButton
              leftSection={<IconTableExport size={14} />}
              loading={busy}
              onClick={() => run("xlsx")}
            >
              Excel でダウンロード
            </PrimaryButton>
          </Group>
        )}
      </Stack>
    </ModalShell>
  );
}
