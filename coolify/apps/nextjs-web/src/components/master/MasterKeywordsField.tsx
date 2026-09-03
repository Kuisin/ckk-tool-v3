"use client";

/**
 * MasterKeywordsField — 製品・素材の「キーワード」入力（match_names）。
 *
 * 取引先の AI 照合名（bp/MatchNameSuggestions）と同じ役割を製品・素材に置く。
 * 違いは候補の作り方 — 社名は法人格の言い換えやフリガナから機械的に作れるが、
 * 製品名の読みや別称は機械では作れない。そこで **AI（po-extract の
 * /generate/keywords）に候補を出させ、採用するかは人が決める**。
 *
 * 生成された語はその場では保存しない。押した語がフォームの値に入り、
 * 保存で初めて match_names になる（誤った候補が黙って入らないように）。
 */

import { Alert, Badge, Group, Stack, TagsInput, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSparkles } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { KEYWORD_MAX_COUNT, normalizeKeywords } from "@/lib/master-keywords";

/** 詳細画面などでの読み取り表示（取引先の AI 照合名と同じ見た目）。 */
export function KeywordBadges({ values }: { values: readonly string[] }) {
  if (values.length === 0) return "—";
  return (
    <Group gap={4} wrap="wrap">
      {values.map((v) => (
        <Badge color="gray" key={v} size="sm" variant="light">
          {v}
        </Badge>
      ))}
    </Group>
  );
}

/** 生成の材料になる、画面に出ている値。 */
export interface KeywordSubject {
  /** 名称（必須 — 空だと生成できない）。 */
  name: string;
  code?: string | null;
  /** 材種・寸法・単位・備考など。空の項目は呼び出し側で落としておく。 */
  attributes: { label: string; value: string }[];
}

interface KeywordsResponse {
  ok?: boolean;
  keywords?: string[];
  error?: string;
}

export function MasterKeywordsField({
  kind,
  label,
  value,
  onChange,
  subject,
}: {
  kind: "product" | "material";
  /** HelpLabel を含むラベル（マニュアルの「?」を出すため呼び出し側で組む）。 */
  label: ReactNode;
  value: string[];
  onChange: (values: string[]) => void;
  subject: KeywordSubject;
}) {
  const tr = useTranslations();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const canGenerate = subject.name.trim().length > 0 && !loading;

  const add = (values: string[]) => {
    onChange(normalizeKeywords([...value, ...values]));
    setSuggestions((s) => s.filter((v) => !values.includes(v)));
  };

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: subject.name,
          code: subject.code ?? null,
          attributes: subject.attributes,
          existing: value,
        }),
      });
      const json = (await res
        .json()
        .catch(() => null)) as KeywordsResponse | null;
      if (!res.ok || !json?.ok) {
        notifications.show({
          title: tr("master.masterKeywordsField.couldNotProduceAnySuggestions"),
          message:
            json?.error ??
            tr("master.masterKeywordsField.theCallToTheAiService"),
          color: "red",
        });
        return;
      }
      const fresh = json.keywords ?? [];
      setSuggestions(fresh);
      if (fresh.length === 0) {
        notifications.show({
          title: tr("master.masterKeywordsField.thereAreNoNewSuggestions"),
          message: tr(
            "master.masterKeywordsField.theRegisteredKeywordsAppearToBe",
          ),
          color: "blue",
        });
      }
    } catch {
      notifications.show({
        title: tr("master.masterKeywordsField.couldNotProduceAnySuggestions"),
        message: tr("master.masterKeywordsField.aCommunicationErrorOccurred"),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="xs" mt="sm">
      <TagsInput
        description={tr("master.masterKeywordsField.fieldDescription", {
          max: KEYWORD_MAX_COUNT,
        })}
        label={label}
        maxTags={KEYWORD_MAX_COUNT}
        onChange={onChange}
        placeholder={tr("master.masterKeywordsField.typeAKeywordAndPressEnter")}
        splitChars={[",", "、"]}
        value={value}
      />
      <Group gap="xs">
        <SecondaryButton
          disabled={!canGenerate}
          leftSection={<IconSparkles size={14} />}
          loading={loading}
          onClick={generate}
        >
          {tr("master.masterKeywordsField.suggestWithAi")}
        </SecondaryButton>
        {subject.name.trim().length === 0 && (
          <Text c="dimmed" size="xs">
            {tr("master.masterKeywordsField.enterANameAndItCan")}
          </Text>
        )}
      </Group>

      {suggestions.length > 0 && (
        <Alert
          color="blue"
          icon={<IconSparkles size={16} />}
          title={tr(
            "master.masterKeywordsField.keywordSuggestionsProducedByAi",
          )}
          variant="light"
        >
          <Stack gap={6}>
            <Text size="sm">
              {tr("master.masterKeywordsField.pickOnlyTheOnesYouWant")}
            </Text>
            <Group gap="xs" wrap="wrap">
              {suggestions.map((s) => (
                <SecondaryButton
                  key={s}
                  leftSection={<IconPlus size={12} />}
                  onClick={() => add([s])}
                  size="xs"
                >
                  {s}
                </SecondaryButton>
              ))}
            </Group>
            <Group>
              <GhostButton onClick={() => add(suggestions)} size="xs">
                {tr("master.masterKeywordsField.addAllCount", {
                  count: suggestions.length,
                })}
              </GhostButton>
              <GhostButton onClick={() => setSuggestions([])} size="xs">
                {tr("common.close2")}
              </GhostButton>
            </Group>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
