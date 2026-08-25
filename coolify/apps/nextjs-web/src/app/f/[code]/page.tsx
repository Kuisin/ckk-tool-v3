import { Text } from "@mantine/core";
import {
  IconCalendarClock,
  IconCircleCheck,
  IconLock,
  IconPencilOff,
  IconProgress,
  IconSearchOff,
} from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { FormStateScreen } from "@/components/forms/FormStateScreen";
import { RespondFormClient } from "@/components/forms/RespondFormClient";
import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { resolveRespondState } from "@/lib/form-respond-state";
import { fetchForm, fetchFormVersionFields, formAccess } from "@/lib/forms";
import { getServerFormatters } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "フォーム | CKK 業務管理システム",
  // 共有 URL を検索エンジンに拾わせない。
  robots: { index: false, follow: false },
};

const HOME = { label: "ホームへ戻る", href: "/" };

/**
 * 共有 URL の回答画面（`/f/<code>`）。
 *
 * `(dashboard)` の外に置いてあるのは、短くてアプリ配下でない URL にするため
 * （`/l/<code>` の外部リンク確認ページと同じ構え）。**いまはログイン必須** —
 * `proxy.ts` の matcher は触っていない。将来社外へ開くときは matcher に
 * `f(?:$|/)` を足せばよく、データ側は共有設定で既に表現できている。
 *
 * 回答できないときは 404 ではなく理由を出す（lib/form-respond-state.ts）。
 * ただし **「存在しない」と「共有されていない」は区別しない** — 分けると
 * コードの総当たりでフォームの実在を確かめられてしまう。
 */
export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ response?: string }>;
}) {
  const { code } = await params;
  const { response: requestedResponseNumber } = await searchParams;

  const userId = await sessionUserId();
  // proxy.ts が未ログインを /login へ送るので、ここに来るのは基本ログイン済み。
  if (!userId) redirect("/login");

  const form = await fetchForm(code);
  const access = form
    ? await formAccess(form)
    : { canRespond: false, canRead: false, canEdit: false, canManage: false };

  // 自分の回答（新しい順）。状態判定と「自分の回答を見る」リンクに使う。
  const myResponses = form
    ? await prisma.formResponse.findMany({
        where: { formId: form.id, submittedBy: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { responseNumber: true, status: true, submittedBy: true },
      })
    : [];

  const state = resolveRespondState({
    canRespond: access.canRespond,
    form: form ?? {
      status: "DRAFT",
      opensAt: null,
      closesAt: null,
      responseEditMode: "NONE",
      responseEditableUntil: null,
      currentVersion: 0,
      allowMultiple: true,
    },
    userId,
    myResponses,
    requestedResponseNumber,
    now: new Date(),
  });

  const responseHref = (n: string) =>
    `/general/forms/${code}/responses/${encodeURIComponent(n)}`;
  // 共有されている相手にだけタイトルを出す（未共有では実在を明かさない）。
  const formTitle = access.canRespond ? (form?.title ?? null) : null;
  // 日時は本人の表示設定（タイムゾーン・書式）で読む。
  const fmt = await getServerFormatters();

  switch (state.kind) {
    case "unavailable":
      return (
        <FormStateScreen
          actions={[{ ...HOME, variant: "filled" }]}
          color="gray"
          description="URL が間違っているか、このフォームがあなたに共有されていません。共有した人に URL と公開範囲を確認してください。"
          icon={<IconSearchOff size={24} />}
          title="このフォームは開けません"
        />
      );

    case "not-published":
      return (
        <FormStateScreen
          actions={[HOME]}
          color="yellow"
          description="作成者がまだ項目を公開していません。公開されると回答できるようになります。"
          formTitle={formTitle}
          icon={<IconProgress size={24} />}
          title="準備中です"
        />
      );

    case "scheduled":
      return (
        <FormStateScreen
          actions={[HOME]}
          color="yellow"
          description="受付が始まると回答できるようになります。"
          detail={
            state.opensAt ? (
              <Text fw={600} size="sm">
                受付開始: {fmt.dateTime(state.opensAt)}
              </Text>
            ) : undefined
          }
          formTitle={formTitle}
          icon={<IconCalendarClock size={24} />}
          title="受付開始前です"
        />
      );

    case "closed":
      return (
        <FormStateScreen
          actions={[
            ...(state.myResponseNumber
              ? [
                  {
                    label: "自分の回答を見る",
                    href: responseHref(state.myResponseNumber),
                    variant: "filled" as const,
                  },
                ]
              : []),
            HOME,
          ]}
          color="gray"
          description={
            state.myResponseNumber
              ? "受付は終了しました。提出済みの回答は引き続き読めます。"
              : "受付は終了しました。回答が必要な場合は作成者に連絡してください。"
          }
          formTitle={formTitle}
          icon={<IconLock size={24} />}
          title="受付は終了しました"
        />
      );

    case "archived":
      return (
        <FormStateScreen
          actions={[
            ...(state.myResponseNumber
              ? [
                  {
                    label: "自分の回答を見る",
                    href: responseHref(state.myResponseNumber),
                    variant: "filled" as const,
                  },
                ]
              : []),
            HOME,
          ]}
          color="gray"
          description="このフォームは使い終わったものとして片付けられています。"
          formTitle={formTitle}
          icon={<IconLock size={24} />}
          title="終了したフォームです"
        />
      );

    case "already-answered":
      return (
        <FormStateScreen
          actions={[
            {
              label: "自分の回答を見る",
              href: responseHref(state.responseNumber),
              variant: "filled",
            },
            ...(state.canEdit
              ? [
                  {
                    label: "回答を編集する",
                    href: `/f/${code}?response=${encodeURIComponent(state.responseNumber)}`,
                  },
                ]
              : []),
            HOME,
          ]}
          color="green"
          description={
            state.canEdit
              ? "このフォームは 1 人 1 回までです。期限内なら内容を直せます。"
              : "このフォームは 1 人 1 回までです。"
          }
          detail={
            <Text c="dimmed" ff="mono" size="xs">
              {state.responseNumber}
            </Text>
          }
          formTitle={formTitle}
          icon={<IconCircleCheck size={24} />}
          title="回答済みです"
        />
      );

    case "edit-unavailable":
      return (
        <FormStateScreen
          actions={[
            // 自分の回答だと分かっているときだけ、詳細への導線を出す。
            ...(state.exists
              ? [
                  {
                    label: "回答を見る",
                    href: responseHref(state.responseNumber),
                    variant: "filled" as const,
                  },
                ]
              : []),
            HOME,
          ]}
          color="gray"
          description={
            state.exists
              ? "編集できる期間が終わっています。内容を直したい場合は作成者に連絡してください。"
              : "編集の対象が見つかりません。URL が間違っているか、自分の回答ではありません。"
          }
          formTitle={formTitle}
          icon={<IconPencilOff size={24} />}
          title="この回答は編集できません"
        />
      );

    default: {
      // answer / edit — フォームを描く。
      const editing =
        state.kind === "edit"
          ? await prisma.formResponse.findUnique({
              where: { responseNumber: state.responseNumber },
              select: { responseNumber: true, answers: true, version: true },
            })
          : null;

      // 回答は「回答した時点の版」で描く。新規は公開中の最新版。
      const fields = editing
        ? await fetchFormVersionFields(
            (form as NonNullable<typeof form>).id,
            editing.version,
          )
        : ((form as NonNullable<typeof form>).fields ?? []);

      if (fields.length === 0) {
        return (
          <FormStateScreen
            actions={[HOME]}
            color="yellow"
            description="作成者がまだ項目を公開していません。"
            formTitle={formTitle}
            icon={<IconProgress size={24} />}
            title="準備中です"
          />
        );
      }

      const target = form as NonNullable<typeof form>;
      return (
        <RespondFormClient
          availability={target.availability}
          closesAt={target.closesAt?.toISOString() ?? null}
          code={code}
          description={target.description}
          existing={
            editing
              ? {
                  responseNumber: editing.responseNumber,
                  answers: (editing.answers ?? {}) as Record<string, unknown>,
                  version: editing.version,
                }
              : null
          }
          fields={fields}
          title={target.title}
        />
      );
    }
  }
}
