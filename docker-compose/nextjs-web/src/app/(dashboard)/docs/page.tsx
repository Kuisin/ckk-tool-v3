import { Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { DOCS_TREE, type DocLang, isDocLang } from "@/lib/docs-tree";
import styles from "./docs.module.css";

export const dynamic = "force-dynamic";

const HERO: Record<DocLang, { title: string; lead: string }> = {
  ja: {
    title: "マニュアル",
    lead: "CKK 業務管理システムの使い方。左のメニューから項目を選ぶか、下のカードから始めてください。はじめての方は「スタートマニュアル」がおすすめです。",
  },
  en: {
    title: "Manuals",
    lead: "How to use the CKK Business Management System. Pick a topic from the sidebar, or start from a card below. New here? Start with the Start Manual.",
  },
  zh: {
    title: "手册",
    lead: "CKK 业务管理系统的使用方法。从左侧菜单选择项目，或从下方卡片开始。初次使用推荐“开始手册”。",
  },
};

/** /docs — マニュアルのトップ（概要 + 各マニュアルへのカード）。 */
export default async function DocsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang: DocLang = isDocLang(sp.lang) ? sp.lang : "ja";
  const hero = HERO[lang];

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{hero.title}</Title>
        <Text c="dimmed" maw={640} size="sm">
          {hero.lead}
        </Text>
      </Stack>

      {DOCS_TREE.map((section) => (
        <Stack gap="xs" key={section.title.en}>
          <Title c="dimmed" order={5}>
            {section.title[lang]}
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {section.pages.map((page) => (
              <Card
                className={styles.card}
                component="a"
                href={`/docs/${page.slug}?lang=${lang}`}
                key={page.slug}
                padding="md"
                radius="md"
                withBorder
              >
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {page.title[lang]}
                  </Text>
                  <IconArrowRight size={16} />
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}
