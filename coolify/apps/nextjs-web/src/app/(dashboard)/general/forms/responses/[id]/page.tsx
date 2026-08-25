import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { fetchResponse } from "@/lib/forms";

export const dynamic = "force-dynamic";

/**
 * 回答番号だけを持っている入口（承認待ち一覧 CM01 と 操作履歴 SY07）から、
 * 実際の回答ページへ送る中継。業務キー FRM-… には所属フォームが入っていない
 * ので、ここで引いてから飛ばす。
 */
export default async function ResponseRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { id } = await params;
  const response = await fetchResponse(id);
  if (!response) notFound();

  redirect(`/general/forms/${response.form.code}/responses/${id}`);
}
