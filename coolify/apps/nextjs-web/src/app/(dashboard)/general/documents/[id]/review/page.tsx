import { Stack } from "@mantine/core";
import { notFound } from "next/navigation";
import { ReviewView } from "@/components/documents/ReviewView";
import { PageHeader } from "@/components/ui/PageHeader";
import { sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchBlame,
  fetchPage,
  listLineComments,
  pageAccess,
} from "@/lib/internal-pages";

export const dynamic = "force-dynamic";

/**
 * レビュー画面 — **行単位コメントが出るのはここだけ**。公開版の閲覧
 * （../page.tsx）はコメントを取得すらしない。
 */
export default async function ReviewPage({
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

  const [comments, blame, userId] = await Promise.all([
    listLineComments(page.id),
    fetchBlame(page.id),
    sessionUserId(),
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          { label: "一般" },
          { label: "社内文書", href: "/general/documents" },
          { label: page.title, href: `/general/documents/${page.pageNumber}` },
          { label: "レビュー" },
        ]}
        title={`レビュー — ${page.title}`}
      />
      <ReviewView
        blame={blame}
        body={page.draftBody}
        comments={comments}
        currentUserId={userId}
        pageNumber={page.pageNumber}
      />
    </Stack>
  );
}
