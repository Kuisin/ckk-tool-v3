import { Alert, Anchor, Group, Paper, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DOC_LANG_LABEL,
  DOCS_LANGS,
  type DocLang,
  isDocLang,
  readDoc,
} from "@/lib/docs";
import styles from "../docs.module.css";

export const dynamic = "force-dynamic";

const DOCS_LABEL: Record<DocLang, string> = {
  ja: "マニュアル",
  en: "Manuals",
  zh: "手册",
};
const FALLBACK_NOTE: Record<DocLang, (l: string) => string> = {
  ja: (l) => `この言語の翻訳が未整備のため ${l} 版を表示しています。`,
  en: (l) => `Translation unavailable; showing the ${l} version.`,
  zh: (l) => `该语言暂无翻译，显示 ${l} 版本。`,
};

/** /docs/[...slug] — 1 マニュアルを表示。?lang= で言語切替（無ければ ja）。 */
export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const requested: DocLang = isDocLang(sp.lang) ? sp.lang : "ja";
  const doc = await readDoc(slug.join("/"), requested);
  if (!doc) notFound();

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <Group gap="xs">
            {DOCS_LANGS.map((l) => (
              <Anchor
                component={Link}
                fw={l === requested ? 700 : 400}
                href={`/docs/${slug.join("/")}?lang=${l}`}
                key={l}
                size="sm"
              >
                {DOC_LANG_LABEL[l]}
              </Anchor>
            ))}
          </Group>
        }
        breadcrumbs={[
          DOCS_LABEL[requested],
          doc.page.title[requested] ?? doc.page.title.ja,
        ]}
        title={doc.page.title[requested] ?? doc.page.title.ja}
      />

      {doc.lang !== requested && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          {FALLBACK_NOTE[requested](DOC_LANG_LABEL[doc.lang])}
        </Alert>
      )}

      <Paper p="lg" radius="md" withBorder>
        <div
          className={styles.doc}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: in-repo manuals rendered by our own escaping Markdown renderer (lib/markdown.ts)
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </Paper>
    </Stack>
  );
}
