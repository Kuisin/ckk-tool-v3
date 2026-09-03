import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/page-title";
import { RespondScreen } from "./RespondScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getTranslations();
  return {
    title: `${tr("f.page.formPageTitle")} | ${APP_NAME}`,
    // 共有 URL を検索エンジンに拾わせない。
    robots: { index: false, follow: false },
  };
}

/**
 * 共有 URL（`/f/<code>`）= **新規回答**。
 *
 * `(dashboard)` の外に置いてあるのは、短くてアプリ配下でない URL にするため
 * （`/l/<code>` の外部リンク確認ページと同じ構え）。**いまはログイン必須** —
 * `proxy.ts` の matcher は触っていない。
 *
 * 役割ごとに URL を分けてある:
 *   /f/<code>                    新規に回答する
 *   /f/<code>/<回答番号>         自分の回答を見る
 *   /f/<code>/<回答番号>/edit    自分の回答・下書きを直す
 *
 * 以前の `?response=<回答番号>`（編集）は配った URL が残っているので、
 * 新しい編集 URL へ 1 回だけ転送する。
 */
export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ response?: string }>;
}) {
  const { code } = await params;
  const { response } = await searchParams;
  if (response) {
    redirect(`/f/${code}/${encodeURIComponent(response)}/edit`);
  }
  return <RespondScreen code={code} />;
}
