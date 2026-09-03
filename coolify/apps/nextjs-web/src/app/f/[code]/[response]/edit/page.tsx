import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/page-title";
import { RespondScreen } from "../../RespondScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getTranslations();
  return {
    title: `${tr("f.editResponsePage.title")} | ${APP_NAME}`,
    robots: { index: false, follow: false },
  };
}

/**
 * 自分の回答・下書きを直す（`/f/<code>/<回答番号>/edit`）。
 *
 * 「直せない」判定（期限切れ・他人の回答・存在しない）は `RespondScreen` が
 * 新規回答と同じ状態機械で出す — URL は分けても、理由の畳み方は 1 か所。
 */
export default async function EditResponsePage({
  params,
}: {
  params: Promise<{ code: string; response: string }>;
}) {
  const { code, response } = await params;
  return <RespondScreen code={code} requestedResponseNumber={response} />;
}
