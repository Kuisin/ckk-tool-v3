import {
  Anchor,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBook2, IconChevronRight } from "@tabler/icons-react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DOC_LANG_LABEL,
  DOCS_LANGS,
  DOCS_TREE,
  type DocLang,
  isDocLang,
} from "@/lib/docs";

export const dynamic = "force-dynamic";

const HOME_TITLE: Record<DocLang, string> = {
  ja: "マニュアル",
  en: "Manuals",
  zh: "手册",
};

/** /docs — マニュアル目次（フォルダ構造をそのまま表示）。 */
export default async function DocsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang: DocLang = isDocLang(sp.lang) ? sp.lang : "ja";

  return (
    <Stack gap="lg">
      <PageHeader
        actions={
          <Group gap="xs">
            {DOCS_LANGS.map((l) => (
              <Anchor
                fw={l === lang ? 700 : 400}
                href={`/docs?lang=${l}`}
                key={l}
                size="sm"
              >
                {DOC_LANG_LABEL[l]}
              </Anchor>
            ))}
          </Group>
        }
        breadcrumbs={[HOME_TITLE[lang]]}
        title={HOME_TITLE[lang]}
      />

      {DOCS_TREE.map((section) => (
        <Stack gap="xs" key={section.title.en}>
          <Group gap="xs">
            <IconBook2 size={16} />
            <Title c="dimmed" order={5}>
              {section.title[lang]}
            </Title>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {section.pages.map((page) => (
              <Card
                component="a"
                href={`/docs/${page.slug}?lang=${lang}`}
                key={page.slug}
                padding="md"
                radius="md"
                withBorder
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm">
                      {page.title[lang]}
                    </Text>
                    <Text c="dimmed" ff="mono" size="xs" truncate>
                      /docs/{page.slug}
                    </Text>
                  </Stack>
                  <IconChevronRight size={16} />
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}
