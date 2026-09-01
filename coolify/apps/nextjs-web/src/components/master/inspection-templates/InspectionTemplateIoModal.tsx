"use client";

/**
 * InspectionTemplateIoModal — 検査表テンプレートの書き出し / 取込（MS09）。
 *
 * 環境をまたいで持ち出す（dev で作って本番へ）ためと、現場・管理者が Excel で
 * 作った検査表をそのまま持ち込むための入口。
 *
 * 形は 2 つあり、役割が違う:
 *   JSON  … 書き出しと取込の両方。往復が正確で、入れ子（選択肢・目標値）も運べる
 *   Excel … 取込のみ。表計算で作る人のための入口
 *
 * ★ **雛形を配る**のが要点。列名を当てさせない。
 * ★ 取込の結果は**1 件ずつ**見せる（何が入って何が入らなかったか）。まとめて
 *   「成功しました」と出すと、飛ばされた検査表に誰も気づかない。
 */

import { Alert, Anchor, Group, List, Stack, Text } from "@mantine/core";
import {
  IconDownload,
  IconFileSpreadsheet,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

const API = "/api/master/inspection-templates";

type ImportOutcome = {
  created: Array<{ code: string; version: number; items: number }>;
  skipped: Array<{ code: string; reason: string }>;
  rowErrors: Array<{ row: number; message: string }>;
};

export function InspectionTemplateIoModal({
  opened,
  onClose,
  /** 選択中の検査表 id（空なら有効なもの全部を書き出す）。 */
  selectedIds,
}: {
  opened: boolean;
  onClose: () => void;
  selectedIds: number[];
}) {
  const tr = useTr();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportHref =
    selectedIds.length > 0
      ? `${API}/export?ids=${selectedIds.join(",")}`
      : `${API}/export`;

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API}/import`, { method: "POST", body });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        data?: ImportOutcome;
      } | null;
      if (!json?.ok) {
        setError(json?.error ?? tr("取込に失敗しました"));
        // 行の誤りだけは、失敗時でも見せる（直す場所が分かる）
        if (json?.data) setOutcome(json.data);
        return;
      }
      setOutcome(json.data ?? null);
      router.refresh();
    } catch {
      setError(tr("通信に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      confirmLabel={tr("閉じる")}
      onClose={onClose}
      onConfirm={onClose}
      opened={opened}
      size="lg"
      title={tr("検査表の書き出し / 取込")}
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("書き出し（JSON）")}
          </Text>
          <Text c="dimmed" size="xs">
            {selectedIds.length > 0
              ? tr("選択中の {v0} 件を書き出します。", {
                  v0: selectedIds.length,
                })
              : tr(
                  tr(
                    tr(
                      "有効な検査表をすべて書き出します（一覧で選ぶと、その分だけになります）。",
                    ),
                  ),
                )}
            別の環境へ持っていくときや、控えを取るときに使います。
          </Text>
          <Group>
            <SecondaryButton
              external
              href={exportHref}
              leftSection={<IconDownload size={14} />}
            >
              {tr("JSON で書き出す")}
            </SecondaryButton>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("取込（JSON / Excel）")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "書き出した JSON か、Excel の雛形に書いたファイルを取り込みます。",
                ),
              ),
            )}
            <b>
              {tr("同じコードの検査表があるときは、新しいバージョンとして追加")}
            </b>
            {tr(
              tr(
                tr(
                  "します（既存の版は書き換えません —\n            過去の検査記録が指しているためです）。",
                ),
              ),
            )}
          </Text>
          <Group gap="xs">
            <Anchor href={`${API}/excel-template`} size="xs">
              <Group gap={4}>
                <IconFileSpreadsheet size={14} />
                {tr("Excel の雛形を落とす")}
              </Group>
            </Anchor>
          </Group>
          <Group>
            <PrimaryButton
              leftSection={<IconUpload size={14} />}
              loading={busy}
              onClick={() => fileRef.current?.click()}
            >
              {tr("ファイルを選ぶ")}
            </PrimaryButton>
            <input
              accept=".json,.xlsx"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = ""; // 同じファイルを続けて選べるように
                if (f) void upload(f);
              }}
              ref={fileRef}
              style={{ display: "none" }}
              type="file"
            />
          </Group>
        </Stack>

        {error && <Alert color="red">{error}</Alert>}

        {outcome && (
          <Stack gap="xs">
            {outcome.created.length > 0 && (
              <Alert
                color="green"
                title={tr("{v0} 件を取り込みました", {
                  v0: outcome.created.length,
                })}
              >
                <List size="sm">
                  {outcome.created.map((c) => (
                    <List.Item key={`${c.code}-${c.version}`}>
                      {c.code}（v{c.version}・項目 {c.items} 件）
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {outcome.skipped.length > 0 && (
              <Alert
                color="orange"
                title={tr("{v0} 件は取り込めませんでした", {
                  v0: outcome.skipped.length,
                })}
              >
                <List size="sm">
                  {outcome.skipped.map((s) => (
                    <List.Item key={s.code}>
                      {s.code}: {s.reason}
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {outcome.rowErrors.length > 0 && (
              <Alert color="orange" title={tr("読めなかった行")}>
                <List size="sm">
                  {outcome.rowErrors.map((e) => (
                    <List.Item key={`${e.row}-${e.message}`}>
                      {e.row} 行目: {e.message}
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}
          </Stack>
        )}
      </Stack>
    </ModalShell>
  );
}
