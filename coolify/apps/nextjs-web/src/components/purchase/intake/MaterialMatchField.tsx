"use client";

/**
 * MaterialMatchField — 読み取った 1 行の「どの素材か」を決める欄。
 *
 * 購買側の取込（素材発注書の下書き / 納品書からの入荷）で共通に使う。
 *
 * **素材は決して勝手に作らない。** 突合が 1 件に絞れなかった行は空のまま
 * 出し、書類に印字されていた文字列（品名・品番・メーカー・材質・寸法）を
 * すぐ下に残す — それが無いと、人はどの行を直しているのか分からないまま
 * ピッカーを開くことになる（突合が外れているのは、まさにマスタの表記と
 * 印字がずれているときなので）。
 *
 * 状態は 4 つ。色ではなく**言葉**で言い切る（色だけだと白黒印刷・色覚の
 * 条件で読めない）:
 *   一致   … 自動で 1 件に決まった
 *   推定   … 候補はあるが絞れなかった（押して選ぶ）
 *   未特定 … 候補すら出なかった（探して選ぶ）
 *   選択済 … 人が選んだ
 */

import { Badge, Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import { SecondaryButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { PurchaseIntakeLine } from "@/lib/purchase-intake-core";

export interface MaterialPick {
  materialId: string | null;
  materialLabel: string | null;
}

/** 読み取った行が「いま」どういう状態か。 */
export function matchState(
  line: Pick<PurchaseIntakeLine, "materialId" | "candidates">,
  autoMatched: boolean,
): "matched" | "picked" | "guess" | "unmatched" {
  if (line.materialId) return autoMatched ? "matched" : "picked";
  return line.candidates.length > 0 ? "guess" : "unmatched";
}

const STATE_COLOR = {
  matched: "green",
  picked: "blue",
  guess: "yellow",
  unmatched: "gray",
} as const;

/** 書類に印字されていた内容を 1 行にまとめる（人が原本と突き合わせるため）。 */
export function extractedSummary(line: PurchaseIntakeLine): string {
  const dims = [
    line.diameterMm != null ? `φ${line.diameterMm}` : null,
    line.lengthMm != null ? `${line.lengthMm}mm` : null,
  ]
    .filter(Boolean)
    .join("×");
  return [line.materialCode, line.materialText, line.maker, line.grade, dims]
    .filter((v): v is string => !!v)
    .join(" / ");
}

export function MaterialMatchField({
  line,
  autoMatched,
  onPick,
}: {
  line: PurchaseIntakeLine;
  /** 抽出時点で自動確定していたか（人が選んだ分と区別するため）。 */
  autoMatched: boolean;
  onPick: (pick: MaterialPick) => void;
}) {
  const tr = useTranslations();
  const state = matchState(line, autoMatched);
  const summary = extractedSummary(line);

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <SearchSelect
          error={
            line.materialId ? undefined : tr("purchase.intake.pickMaterial")
          }
          flex={1}
          initialOption={
            line.materialId
              ? {
                  value: line.materialId,
                  label: line.materialLabel ?? line.materialId,
                }
              : null
          }
          onChange={(value, option) =>
            onPick({
              materialId: value,
              materialLabel: option?.label ?? null,
            })
          }
          onSearch={searchMaterialOptions}
          placeholder={tr("common.searchMaterials")}
          storageKey="material"
          value={line.materialId}
        />
        <Badge
          className="shrink-0"
          color={STATE_COLOR[state]}
          variant={state === "unmatched" ? "outline" : "light"}
        >
          {tr(`purchase.intake.state.${state}`)}
        </Badge>
      </Group>

      {/* 印字されていた内容。突合できていても残す（原本と見比べる材料）。 */}
      {summary && (
        <Text c="dimmed" size="xs">
          {tr("purchase.intake.extractedAs", { text: summary })}
        </Text>
      )}

      {/* 絞れなかったときの「もしかして」。押すとその場で入る。 */}
      {!line.materialId && line.candidates.length > 0 && (
        <Group gap="xs" wrap="wrap">
          <Text c="dimmed" size="xs">
            {tr("purchase.intake.didYouMean")}
          </Text>
          {line.candidates.map((c) => (
            <SecondaryButton
              key={c.id}
              onClick={() =>
                onPick({ materialId: c.id, materialLabel: c.label })
              }
              size="xs"
            >
              {c.label}
            </SecondaryButton>
          ))}
        </Group>
      )}
    </Stack>
  );
}
