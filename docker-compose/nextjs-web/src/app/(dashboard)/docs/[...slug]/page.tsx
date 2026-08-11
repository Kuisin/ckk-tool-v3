import { Alert, Anchor, Paper, Stack, Title } from "@mantine/core";
import { IconArrowLeft, IconInfoCircle } from "@tabler/icons-react";
import { notFound, redirect } from "next/navigation";
import { DOC_LANG_LABEL, type DocLang, isDocLang, readDoc } from "@/lib/docs";
import { DOCS_TREE } from "@/lib/docs-tree";
import styles from "../docs.module.css";

export const dynamic = "force-dynamic";

const FALLBACK_NOTE: Record<DocLang, (l: string) => string> = {
  ja: (l) => `この言語の翻訳が未整備のため ${l} 版を表示しています。`,
  en: (l) => `Translation unavailable; showing the ${l} version.`,
  zh: (l) => `该语言暂无翻译，显示 ${l} 版本。`,
};

const BACK_LABEL: Record<DocLang, string> = {
  ja: "マニュアル一覧",
  en: "All manuals",
  zh: "手册目录",
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
  const path = slug.join("/");
  const doc = await readDoc(path, requested);
  if (!doc) {
    // 中間パス（/docs/system 等 — セクション途中の URL）は 404 にせず一覧へ戻す
    const isPrefix = DOCS_TREE.some((s) =>
      s.pages.some((p) => p.slug.startsWith(`${path}/`)),
    );
    if (isPrefix) redirect(`/docs?lang=${requested}`);
    notFound();
  }

  return (
    <Stack gap="md">
      {/* Server Component のため component={Link}（関数 prop）は渡せない —
          component="a"（通常遷移）にする。docs 一覧のカードと同じ扱い。 */}
      <Anchor
        c="dimmed"
        component="a"
        href={`/docs?lang=${requested}`}
        size="sm"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <IconArrowLeft size={14} />
        {BACK_LABEL[requested]}
      </Anchor>
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
