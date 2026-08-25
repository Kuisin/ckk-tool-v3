import { notFound } from "next/navigation";
import { DocumentDetail } from "@/components/documents/DocumentDetail";
import { fetchApprovalState } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { countOpenComments, fetchPage, pageAccess } from "@/lib/internal-pages";
import { lookupShortLinkCodes } from "@/lib/link-index";
import { collectMarkdownLinks } from "@/lib/markdown-links";
import { listShareGrants } from "@/lib/share-grants";
import { fetchRoleOptions } from "../../forms/data";
import { savePageShareGrants } from "../actions";

export const dynamic = "force-dynamic";

/**
 * 公開版の閲覧。**行コメントは取得しない** — レビュー画面だけが読む。
 */
export default async function DocumentPage({
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

  const [grants, roleOptions, auditEntries, openComments, approvalState] =
    await Promise.all([
      listShareGrants("internal_pages", id),
      fetchRoleOptions(),
      fetchAuditEntries("internal_pages", id),
      countOpenComments(page.id),
      page.approvalRequired
        ? fetchApprovalState("internal_pages", id)
        : Promise.resolve(null),
    ]);

  // 本文中の外部 URL は短縮リンク経由でしか踏ませない（事後ブロックが遡って効く）。
  // 登録は保存時に済ませてあるので、ここは読むだけ。
  const links = await lookupShortLinkCodes(
    collectMarkdownLinks(page.publishedBody ?? ""),
  );

  return (
    <DocumentDetail
      auditEntries={auditEntries}
      canApprove={approvalState?.canAct ?? false}
      canEdit={access.canEdit}
      canManage={access.canManage}
      grants={grants}
      links={links}
      onSaveShare={async (next) => {
        "use server";
        const result = await savePageShareGrants(
          id,
          next as Parameters<typeof savePageShareGrants>[1],
        );
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      openComments={openComments}
      page={page}
      roleOptions={roleOptions}
    />
  );
}
