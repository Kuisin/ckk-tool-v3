"use client";

/**
 * VersionFileSlots — 版に載せるファイルの枠（PD16 と版の詳細の「ファイルを追加」）。
 *
 *   2D 原図   0..1（図脳 SXF / DXF / DWG …）— .sfc を選ぶと表題欄を読む
 *   3D 原図   0..1（STEP / IGES / CIM3D …）
 *   プレビュー 0..1（STL 等 — 画面で回して見る）
 *   参考資料   0..N（説明を付けられる）
 *
 * **どれも任意。** 仕様だけの版もあるし、原図は後から足してもよい（確定前なら）。
 * 形式では弾かない — 何が来るか分からないので、保存はするが画面で開けるのは
 * PDF・画像・3D だけ（lib/attachments.ts isInlineSafe が唯一の判定元）。
 */

import { Alert, Group, List, Stack, Text } from "@mantine/core";
import { IconFileSearch, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileSlot } from "@/components/ui/DesignFileSlot";
import { useIsMobile } from "@/hooks/useViewport";
import type { DesignFileRole } from "@/lib/design-files-core";
import {
  decodeSxfBytes,
  readSxfDrawing,
  type SxfDrawingReading,
} from "@/lib/sxf-core";

export interface VersionFileSlotState {
  blueprint: File | null;
  model: File | null;
  preview: File | null;
  references: { key: number; file: File | null; note: string }[];
}

export const EMPTY_FILE_SLOTS: VersionFileSlotState = {
  blueprint: null,
  model: null,
  preview: null,
  references: [],
};

/** 何か 1 枚でも選ばれているか。 */
export function hasAnyFile(s: VersionFileSlotState): boolean {
  return (
    s.blueprint != null ||
    s.model != null ||
    s.preview != null ||
    s.references.some((r) => r.file != null)
  );
}

/** multipart へ詰める（受け側は app/api/design-files/_uploads.ts）。 */
export function appendFileSlots(body: FormData, s: VersionFileSlotState) {
  if (s.blueprint) body.set("blueprint", s.blueprint);
  if (s.model) body.set("model", s.model);
  if (s.preview) body.set("preview", s.preview);
  // 参考資料はファイルと説明を同じ順で並べて送る（受け側で組み直す）。
  for (const r of s.references) {
    if (!r.file) continue;
    body.append("reference", r.file);
    body.append("referenceNote", r.note.trim());
  }
}

/** 図脳 SXF（.sfc）か。拡張子で見る（ブラウザは MIME を付けない）。 */
export function isSxfFile(file: File): boolean {
  return /\.sfc$/i.test(file.name);
}

/** .sfc を読む。SXF でなければ null。 */
export async function readSxfFile(
  file: File,
): Promise<SxfDrawingReading | null> {
  if (!isSxfFile(file)) return null;
  try {
    return readSxfDrawing(decodeSxfBytes(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

export function VersionFileSlots({
  value,
  onChange,
  onSxfPicked,
  taken = [],
}: {
  value: VersionFileSlotState;
  onChange: (next: VersionFileSlotState) => void;
  /** 2D 原図に .sfc が選ばれたとき（読み取りと差し込みは親がする）。 */
  onSxfPicked?: (file: File) => void;
  /** すでに版に載っている役割（原図・プレビューは 1 枚まで — 枠を出さない）。 */
  taken?: DesignFileRole[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const set = (patch: Partial<VersionFileSlotState>) =>
    onChange({ ...value, ...patch });
  const nextKey =
    value.references.reduce((max, r) => Math.max(max, r.key), 0) + 1;

  return (
    <Stack gap="md">
      {!taken.includes("BLUEPRINT") && (
        <DesignFileSlot
          description={tr("production.designVersion.blueprintSlotHint")}
          file={value.blueprint}
          fullWidth={isMobile}
          label={tr("enum.DESIGN_FILE_ROLE_LABEL.BLUEPRINT")}
          onPick={(f) => {
            set({ blueprint: f });
            if (f && isSxfFile(f)) onSxfPicked?.(f);
          }}
        />
      )}
      {!taken.includes("MODEL") && (
        <DesignFileSlot
          description={tr("production.designVersion.modelSlotHint")}
          file={value.model}
          fullWidth={isMobile}
          label={tr("enum.DESIGN_FILE_ROLE_LABEL.MODEL")}
          onPick={(f) => set({ model: f })}
        />
      )}
      {!taken.includes("PREVIEW") && (
        <DesignFileSlot
          description={tr("production.designFiles.aFileSuchAsStlFor")}
          file={value.preview}
          fullWidth={isMobile}
          label={tr("production.designFiles.forPreview3d")}
          onPick={(f) => set({ preview: f })}
        />
      )}

      <Stack gap="sm">
        {value.references.map((r, i) => (
          <DesignFileSlot
            description={
              i === 0
                ? tr("production.designVersion.referenceSlotHint")
                : undefined
            }
            file={r.file}
            fullWidth={isMobile}
            key={r.key}
            label={tr("production.designFileVersionForm.referenceWithNumber", {
              number: i + 1,
            })}
            note={r.note}
            notePlaceholder={tr(
              "production.designFiles.descriptionOptionalEGPartDrawing",
            )}
            onNoteChange={(v) =>
              set({
                references: value.references.map((x, j) =>
                  j === i ? { ...x, note: v } : x,
                ),
              })
            }
            onPick={(f) =>
              set({
                // ファイルを外したら行ごと消す（空の行が残らない）
                references:
                  f == null
                    ? value.references.filter((_, j) => j !== i)
                    : value.references.map((x, j) =>
                        j === i ? { ...x, file: f } : x,
                      ),
              })
            }
          />
        ))}
        <Group>
          <SecondaryButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              set({
                references: [
                  ...value.references,
                  { key: nextKey, file: null, note: "" },
                ],
              })
            }
          >
            {tr("production.designFiles.addAReference")}
          </SecondaryButton>
        </Group>
      </Stack>
      <Text c="dimmed" size="xs">
        {tr("production.designFiles.upTo20mbEach")}
      </Text>
    </Stack>
  );
}

/** SXF を読んだ結果の知らせ（何項目入れたか・得意先名が当たったか）。 */
export function SxfReadNotice({
  reading,
  filled,
  customerMatched,
  onClose,
}: {
  reading: SxfDrawingReading | "unreadable";
  filled: number;
  /** null = 受注元を当てる対象ではない（依頼から来た等）。 */
  customerMatched: boolean | null;
  onClose: () => void;
}) {
  const tr = useTranslations();
  if (reading === "unreadable") {
    return (
      <Alert
        color="orange"
        icon={<IconFileSearch size={16} />}
        onClose={onClose}
        title={tr("production.designVersion.sxfUnreadable")}
        withCloseButton
      >
        {tr("production.designVersion.sxfUnreadableHint")}
      </Alert>
    );
  }
  const customerName = reading.title.customerName;
  return (
    <Alert
      color="blue"
      icon={<IconFileSearch size={16} />}
      onClose={onClose}
      title={tr("production.designVersion.sxfRead", { count: filled })}
      withCloseButton
    >
      <List size="sm" spacing={2}>
        {reading.sheetNumber && (
          <List.Item>
            {tr("production.designVersion.sxfSheet", {
              sheet: reading.sheetNumber,
            })}
          </List.Item>
        )}
        {reading.diameterMm != null && reading.lengthMm != null && (
          <List.Item>
            {tr("production.designVersion.sxfDimensions", {
              diameter: reading.diameterMm,
              length: reading.lengthMm,
            })}
          </List.Item>
        )}
        {customerName && customerMatched === true && (
          <List.Item>
            {tr("production.designVersion.sxfCustomerMatched", {
              name: customerName,
            })}
          </List.Item>
        )}
        {customerName && customerMatched === false && (
          <List.Item>
            <Text c="orange" component="span" size="sm">
              {tr("production.designVersion.sxfCustomerNotMatched", {
                name: customerName,
              })}
            </Text>
          </List.Item>
        )}
      </List>
      <Text c="dimmed" mt="xs" size="xs">
        {tr("production.designVersion.sxfCheckHint")}
      </Text>
    </Alert>
  );
}
