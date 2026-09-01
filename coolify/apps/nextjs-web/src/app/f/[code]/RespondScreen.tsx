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
import { hasAnyApproval } from "@/lib/approvals";
import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { myDraftsOf, resolveRespondState } from "@/lib/form-respond-state";
import { fetchForm, fetchFormVersionFields, formAccess } from "@/lib/forms";
import { NO_SHARE_ACCESS } from "@/lib/share-grants";
import { getTr } from "@/lib/ui-text-server";
import { getServerFormatters } from "@/lib/user-preferences";

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
/**
 * 回答画面の本体。`/f/<code>`（新規）と `/f/<code>/<回答番号>/edit`（編集）の
 * **両方がこれを使う** — 「回答できない理由」の畳み方は 1 か所に置きたいので、
 * URL を分けても状態機械は分けない。
 */
export async function RespondScreen({
  code,
  requestedResponseNumber = null,
}: {
  code: string;
  requestedResponseNumber?: string | null;
}) {
  const tr = await getTr();
  const userId = await sessionUserId();
  // proxy.ts が未ログインを /login へ送るので、ここに来るのは基本ログイン済み。
  if (!userId) redirect("/login");

  const form = await fetchForm(code);
  const access = form ? await formAccess(form) : NO_SHARE_ACCESS;

  // 自分の回答（新しい順）。状態判定と「自分の回答を見る」リンクに使う。
  const myResponses = form
    ? await prisma.formResponse.findMany({
        where: { formId: form.id, submittedBy: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { responseNumber: true, status: true, submittedBy: true },
      })
    : [];

  const myDrafts = myDraftsOf(myResponses, userId);

  // 直しに来た回答が承認中なら、「まだ誰も承認していないか」で編集可否が
  // 変わる（フォームの設定）。必要なときだけ数える。
  const editTarget = requestedResponseNumber
    ? myResponses.find((r) => r.responseNumber === requestedResponseNumber)
    : null;
  const firstApprovalDone =
    editTarget?.status === "REQUESTED" && form
      ? await hasAnyApproval(
          "form_responses",
          editTarget.responseNumber,
          (
            await prisma.formResponse.findUnique({
              where: { responseNumber: editTarget.responseNumber },
              select: { createdAt: true },
            })
          )?.createdAt ?? new Date(0),
        )
      : false;
  const myResponsesWithApproval = myResponses.map((r) =>
    r.responseNumber === editTarget?.responseNumber
      ? { ...r, firstApprovalDone }
      : r,
  );

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
    myResponses: myResponsesWithApproval,
    requestedResponseNumber,
    now: new Date(),
  });

  // 回答者向けの URL に寄せる（/general/... は作成者用の画面で、承認・メモ・
  // 添付・操作履歴まで載っている。回答した人が見る場所ではない）。
  const responseHref = (n: string) => `/f/${code}/${encodeURIComponent(n)}`;
  const editHref = (n: string) => `${responseHref(n)}/edit`;
  // 閲覧の共有をもらっている人には、回答一覧への導線も出す。
  const listAction = access.canRead
    ? [{ label: tr("回答一覧を見る"), href: `/f/${code}/responses` }]
    : [];
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
          description={tr(
            "URL が間違っているか、このフォームがあなたに共有されていません。共有した人に URL と公開範囲を確認してください。",
          )}
          icon={<IconSearchOff size={24} />}
          title={tr("このフォームは開けません")}
        />
      );

    case "not-published":
      return (
        <FormStateScreen
          actions={[HOME]}
          color="yellow"
          description={tr(
            "作成者がまだ項目を公開していません。公開されると回答できるようになります。",
          )}
          formTitle={formTitle}
          icon={<IconProgress size={24} />}
          title={tr("準備中です")}
        />
      );

    case "scheduled":
      return (
        <FormStateScreen
          actions={[HOME]}
          color="yellow"
          description={tr("受付が始まると回答できるようになります。")}
          detail={
            state.opensAt ? (
              <Text fw={600} size="sm">
                受付開始: {fmt.dateTime(state.opensAt)}
              </Text>
            ) : undefined
          }
          formTitle={formTitle}
          icon={<IconCalendarClock size={24} />}
          title={tr("受付開始前です")}
        />
      );

    case "closed":
      return (
        <FormStateScreen
          actions={[
            ...(state.myResponseNumber
              ? [
                  {
                    label: tr("自分の回答を見る"),
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
              ? tr("受付は終了しました。提出済みの回答は引き続き読めます。")
              : tr(
                  "受付は終了しました。回答が必要な場合は作成者に連絡してください。",
                )
          }
          formTitle={formTitle}
          icon={<IconLock size={24} />}
          title={tr("受付は終了しました")}
        />
      );

    case "archived":
      return (
        <FormStateScreen
          actions={[
            ...(state.myResponseNumber
              ? [
                  {
                    label: tr("自分の回答を見る"),
                    href: responseHref(state.myResponseNumber),
                    variant: "filled" as const,
                  },
                ]
              : []),
            HOME,
          ]}
          color="gray"
          description={tr(
            "このフォームは使い終わったものとして片付けられています。",
          )}
          formTitle={formTitle}
          icon={<IconLock size={24} />}
          title={tr("終了したフォームです")}
        />
      );

    case "already-answered":
      return (
        <FormStateScreen
          actions={[
            {
              label: tr("自分の回答を見る"),
              href: responseHref(state.responseNumber),
              variant: "filled",
            },
            ...(state.canEdit
              ? [
                  {
                    label: tr("回答を編集する"),
                    href: editHref(state.responseNumber),
                  },
                ]
              : []),
            ...listAction,
            HOME,
          ]}
          color="green"
          description={
            state.canEdit
              ? tr(
                  "このフォームは 1 人 1 回までです。期限内なら内容を直せます。",
                )
              : tr("このフォームは 1 人 1 回までです。")
          }
          detail={
            <Text c="dimmed" ff="mono" size="xs">
              {state.responseNumber}
            </Text>
          }
          formTitle={formTitle}
          icon={<IconCircleCheck size={24} />}
          title={tr("回答済みです")}
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
                    label: tr("回答を見る"),
                    href: responseHref(state.responseNumber),
                    variant: "filled" as const,
                  },
                ]
              : []),
            HOME,
          ]}
          color="gray"
          description={
            !state.exists
              ? tr(
                  "編集の対象が見つかりません。URL が間違っているか、自分の回答ではありません。",
                )
              : state.reason === "in-approval"
                ? tr(
                    "承認が進んでいるため直せません。内容を変えたい場合は、承認者に差し戻してもらってください（差し戻されたら直せます）。",
                  )
                : tr(
                    "編集できる期間が終わっています。内容を直したい場合は作成者に連絡してください。",
                  )
          }
          formTitle={formTitle}
          icon={<IconPencilOff size={24} />}
          title={tr("この回答は編集できません")}
        />
      );

    default: {
      // answer / edit — フォームを描く。
      const editing =
        state.kind === "edit"
          ? await prisma.formResponse.findUnique({
              where: { responseNumber: state.responseNumber },
              select: {
                responseNumber: true,
                answers: true,
                version: true,
                status: true,
              },
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
            description={tr("作成者がまだ項目を公開していません。")}
            formTitle={formTitle}
            icon={<IconProgress size={24} />}
            title={tr("準備中です")}
          />
        );
      }

      const target = form as NonNullable<typeof form>;
      return (
        <RespondFormClient
          // 新規回答のときだけ、書きかけの下書きを続きから開けるように並べる。
          // 編集中に出すと「いま直しているもの」と紛らわしい。
          availability={target.availability}
          closesAt={target.closesAt?.toISOString() ?? null}
          code={code}
          description={target.description}
          drafts={
            state.kind === "answer"
              ? myDrafts.map((d) => ({
                  responseNumber: d.responseNumber,
                  href: editHref(d.responseNumber),
                }))
              : []
          }
          existing={
            editing
              ? {
                  responseNumber: editing.responseNumber,
                  answers: (editing.answers ?? {}) as Record<string, unknown>,
                  version: editing.version,
                  status: editing.status,
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
