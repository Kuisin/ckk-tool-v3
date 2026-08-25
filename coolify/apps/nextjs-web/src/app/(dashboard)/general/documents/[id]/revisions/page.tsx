import { notFound } from "next/navigation";
import { RevisionsView } from "@/components/documents/RevisionsView";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { fetchPage, listRevisions, pageAccess } from "@/lib/internal-pages";

export const dynamic = "force-dynamic";

/** 版一覧と、任意の 2 版の行差分。 */
export default async function RevisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  const { id } = await params;
  const page = await fetchPage(id);
  if (!page) notFound();

  const access = await pageAccess(page);
  if (!access.canRead) notFound();

  const revisions = await listRevisions(page.id);

  // 差分はクライアントで取る（版を切り替えるたびに往復させない）。直近 30 版に
  // 絞るのは、古い文書で本文を何十本も送らないため。
  const bodyRows = await prisma.internalPageRevision.findMany({
    where: { pageId: page.id },
    orderBy: { revision: "desc" },
    take: 30,
    select: { revision: true, body: true },
  });
  const bodies: Record<string, string> = {};
  for (const row of bodyRows) bodies[String(row.revision)] = row.body;

  return (
    <RevisionsView
      bodies={bodies}
      canEdit={access.canEdit}
      pageNumber={page.pageNumber}
      pageTitle={page.title}
      revisions={revisions.slice(0, 30)}
    />
  );
}
