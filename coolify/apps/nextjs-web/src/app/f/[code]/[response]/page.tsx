import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconPencilOff, IconSearchOff } from "@tabler/icons-react";
import { redirect } from "next/navigation";
import {
  FormResponseView,
  type RelatedTable,
} from "@/components/forms/FormResponseView";
import { FormStateScreen } from "@/components/forms/FormStateScreen";
import { ResponseActionRow } from "@/components/forms/ResponseActionRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { hasAnyApproval } from "@/lib/approvals";
import { sessionUserId } from "@/lib/authz";
import { canEditResponse, formAvailability } from "@/lib/form-schema";
import {
  fetchResponse,
  formAccess,
  formsAppAvailable,
  resolveRelatedRecords,
} from "@/lib/forms";
import { NO_SHARE_ACCESS } from "@/lib/share-grants";
import { responseInScope } from "@/lib/share-grants-core";
import { getTr } from "@/lib/ui-text-server";
import { getServerFormatters } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "自分の回答 | CKK 業務管理システム",
  robots: { index: false, follow: false },
};

const HOME = { label: "ホームへ戻る", href: "/" };

/**
 * 自分の回答を見る（`/f/<code>/<回答番号>`）。
 *
 * 作成者用の `/general/forms/.../responses/...` とは**別の画面**。あちらは
 * 承認・メモ・添付・操作履歴まで載る管理画面で、回答した本人が自分の控えを
 * 見るには重い。ここは中身と状態、そして「直す／もう 1 件出す」だけを出す。
 *
 * **本人だけ**が対象。他人の回答をここから覗けてはいけないので、作成者や
 * 管理者であっても本人でなければ「見つからない」に畳む（作成者は管理画面で
 * 見る）。存在しない回答番号と同じ結末にするのは、番号の総当たりで回答の
 * 実在を確かめられないようにするため。
 */
export default async function MyResponsePage({
  params,
}: {
  params: Promise<{ code: string; response: string }>;
}) {
  const tr = await getTr();
  const { code, response: responseNumber } = await params;

  const userId = await sessionUserId();
  const row = await fetchResponse(responseNumber);
  const isOwner = !!userId && !!row && row.submittedBy === userId;

  // 本人以外は「閲覧」の共有が要る。共有に条件が付いていれば、その条件に
  // 当てはまる回答だけ。判定は一覧・作成者用画面と同じ規則を使う。
  const access = row ? await formAccess(row.form) : NO_SHARE_ACCESS;
  const visible =
    isOwner ||
    (!!row &&
      access.canRead &&
      responseInScope(access.responseScope, row.answers));

  // フォームのコードが URL と食い違う場合も同じ結末（URL の組み替えを許さない）。
  if (!row || !visible || row.form.code !== code) {
    return (
      <FormStateScreen
        actions={[{ ...HOME, variant: "filled" }]}
        color="gray"
        description={tr(
          tr("URL が間違っているか、この回答を見る権限がありません。"),
        )}
        formTitle={null}
        icon={<IconSearchOff size={24} />}
        title={tr("回答が見つかりません")}
      />
    );
  }

  // ここまで来た = この人にこの回答を見せてよい。**判定より後ろに置くこと** —
  // 前に出すと、見えない回答でも転送が起きて「実在するか」を教えてしまう。
  // アプリ内の回答詳細は承認・添付・コメント・履歴まで載る濃い画面で、門は
  // こちら（本人 or 閲覧共有）の上位集合（+ 承認者）なので 404 にはならない。
  if (await formsAppAvailable()) {
    redirect(
      `/general/forms/${row.form.code}/responses/${encodeURIComponent(
        row.responseNumber,
      )}`,
    );
  }

  const now = new Date();
  const firstApprovalDone =
    row.status === "REQUESTED" &&
    (await hasAnyApproval("form_responses", row.responseNumber, row.createdAt));
  const editable =
    isOwner && canEditResponse(row.form, row, userId, now, firstApprovalDone);
  const isDraft = row.status === "DRAFT";
  const canAnswerAgain =
    row.form.allowMultiple && formAvailability(row.form, now) === "OPEN";

  // 関連レコード一覧はサーバ側で解決する（参照先を読む権限もここで見る）。
  const related: Record<string, RelatedTable> = {};
  for (const field of row.fields) {
    if (field.type !== "related") continue;
    related[field.key] = await resolveRelatedRecords(
      field,
      row.answers[field.related?.thisFieldKey ?? ""],
      isOwner ? undefined : access.responseScope,
    );
  }

  const fmt = await getServerFormatters();

  return (
    <Stack gap="md" maw={840} mx="auto" p="md">
      <Stack gap={4}>
        <Group gap="sm" wrap="nowrap">
          <Title order={3}>{row.form.title}</Title>
          <StatusBadge entity="FormResponse" status={row.status} />
        </Group>
        <Group gap="md">
          <Text c="dimmed" ff="mono" size="xs">
            {row.responseNumber}
          </Text>
          {!isOwner && row.respondent && (
            <Text c="dimmed" size="xs">
              回答者 {row.respondent}
            </Text>
          )}
          <Text c="dimmed" size="xs">
            {isDraft
              ? tr("まだ提出していません")
              : row.submittedAt
                ? `提出 ${fmt.dateTime(row.submittedAt)}`
                : ""}
          </Text>
        </Group>
      </Stack>

      {row.status === "REJECTED" && row.rejectReason && (
        <Paper
          bg="var(--mantine-color-red-light)"
          p="md"
          radius="md"
          withBorder
        >
          <Text fw={600} size="sm">
            {tr("差し戻されました")}
          </Text>
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {row.rejectReason}
          </Text>
        </Paper>
      )}

      <Paper p="md" radius="md" withBorder>
        <FormResponseView
          answers={row.answers}
          fields={row.fields}
          related={related}
        />
      </Paper>

      <ResponseActionRow
        canAnswerAgain={canAnswerAgain}
        canSeeAll={access.canRead}
        code={code}
        editable={editable}
        isDraft={isDraft}
        responseNumber={row.responseNumber}
      />

      {!editable && !isDraft && (
        <Group gap="xs">
          <IconPencilOff size={14} />
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                "編集できる期間が終わっています。直したい場合は作成者に連絡してください。",
              ),
            )}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
