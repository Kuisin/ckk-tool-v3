import { RespondScreen } from "../../RespondScreen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "回答の編集 | CKK 業務管理システム",
  robots: { index: false, follow: false },
};

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
