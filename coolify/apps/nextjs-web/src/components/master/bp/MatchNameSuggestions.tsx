"use client";

/**
 * MatchNameSuggestions — AI 照合名の「推奨」パネル。
 *
 * 注文書に書かれる社名は形式が揺れる（(株)/㈱/株式会社、全角英字、かな、ローマ字）。
 * 記号・全角半角・法人格の位置・かな⇄かな は突合側（lib/bp-match）が吸収するが、
 * **別名そのもの**（旧社名・通称・ローマ字表記）は登録しておくしかない。
 * 登録が増えるほど突合の当たりも具体的になる。
 *
 * ここでは 2 つを出す:
 *   1. 機械的に作れる候補（法人格の言い換え・全角半角・かな⇄かな・ローマ字）→ 1 クリックで追加
 *   2. **足りない字種**（ひらがな / カタカナ / ローマ字）の指摘。漢字社名は読みが
 *      分からないと作れないので、その場合はフリガナの入力を促す
 *      — フリガナを入れた瞬間に 1 の候補が増える。
 *
 * 判定は lib/company-aliases（純ロジック・テスト付き）。ここは表示だけ。
 */

import { Alert, Badge, Group, Stack, Text } from "@mantine/core";
import { IconBulb, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { generateAliases, missingKeywordFormats } from "@/lib/company-aliases";

export function MatchNameSuggestions({
  nameJa,
  nameEn,
  nameKana,
  shortName,
  matchNames,
  onAdd,
}: {
  nameJa: string;
  nameEn?: string | null;
  nameKana?: string | null;
  shortName?: string | null;
  /** 現在の照合名（フォームの値）。 */
  matchNames: string[];
  /** 候補を採用したときに呼ばれる（複数まとめて渡すこともある）。 */
  onAdd: (values: string[]) => void;
}) {
  const tr = useTranslations();
  const FORMAT_LABEL: Record<string, string> = {
    hiragana: tr("master.bp.hiragana"),
    katakana: tr("master.bp.katakana"),
    romaji: tr("master.bp.romaji"),
  };
  const src = {
    nameJa,
    nameEn,
    nameKana,
    shortName,
    existing: matchNames,
  };
  if (!nameJa.trim()) return null;

  const suggestions = generateAliases(src);
  const missing = missingKeywordFormats(src);
  const missingLabels = (["hiragana", "katakana", "romaji"] as const)
    .filter((k) => missing[k])
    .map((k) => FORMAT_LABEL[k]);

  if (suggestions.length === 0 && missingLabels.length === 0) return null;

  return (
    <Alert
      color="blue"
      icon={<IconBulb size={16} />}
      title={tr("master.bp.suggestedAiMatchNames")}
      variant="light"
    >
      <Stack gap="sm">
        {missingLabels.length > 0 && (
          <Text size="sm">
            {tr("master.bp.missingFormatsNotice", {
              formats: missingLabels.join(tr("common.s1")),
            })}
            {missing.needsReading && tr("master.bp.needsReadingNote")}
          </Text>
        )}

        {suggestions.length > 0 && (
          <Stack gap={6}>
            <Group gap="xs" wrap="wrap">
              {suggestions.map((s) => (
                <SecondaryButton
                  key={s}
                  leftSection={<IconPlus size={12} />}
                  onClick={() => onAdd([s])}
                  size="xs"
                >
                  {s}
                </SecondaryButton>
              ))}
            </Group>
            <Group>
              <GhostButton onClick={() => onAdd(suggestions)} size="xs">
                {tr("master.bp.addAllCount", { count: suggestions.length })}
              </GhostButton>
            </Group>
          </Stack>
        )}

        {suggestions.length === 0 && missing.needsReading && (
          <Badge color="orange" size="sm" variant="light">
            {tr("master.bp.noKanaEntered")}
          </Badge>
        )}
      </Stack>
    </Alert>
  );
}
