import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 加工プログラムの変更申請（承認対象）→ 所属する図面の版へ送るだけのページ。
 *
 * 承認依頼は「申請」の uuid を指すが、人が見たいのは図面の版（保留中の申請は
 * その詳細の加工プログラム欄にカードで出る）。未処理一覧 (CM01) の行から
 * 1 クリックで着けるよう、ここで版の uuid に読み替えて 302 する
 * （指示書の打ち切りと同じ）。
 */
export default async function DesignProgramChangeRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("design-files");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const change = await prisma.designProgramChange.findUnique({
    where: { id },
    select: { designVersionId: true },
  });
  if (!change) notFound();
  redirect(`/production/design-files/versions/${change.designVersionId}`);
}
