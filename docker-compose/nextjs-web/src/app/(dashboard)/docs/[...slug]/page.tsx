import { Alert, Paper, Stack, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { notFound } from "next/navigation";
import { DOC_LANG_LABEL, type DocLang, isDocLang, readDoc } from "@/lib/docs";
import styles from "../docs.module.css";

export const dynamic = "force-dynamic";

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
      <Title order={2}>{doc.page.title[requested] ?? doc.page.title.ja}</Title>

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
