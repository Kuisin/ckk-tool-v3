import { Group, Stack, Text, Title } from "@mantine/core";
import { IconSearchOff } from "@tabler/icons-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FormStateScreen } from "@/components/forms/FormStateScreen";
import { PublicResponsesTable } from "@/components/forms/PublicResponsesTable";
import { SecondaryButton } from "@/components/ui/buttons";
import { sessionUserId } from "@/lib/authz";
import {
  fetchForm,
  formAccess,
  formsAppAvailable,
  listResponses,
} from "@/lib/forms";
import { NO_SHARE_ACCESS } from "@/lib/share-grants";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "回答一覧 | CKK 業務管理システム",
  robots: { index: false, follow: false },
};

/**
 * 回答の一覧（`/f/<code>/responses`）。
 *
 * 作成者用の `/general/forms/<code>` と違い、**共有で「閲覧」をもらった人が
 * 見る場所**。フォームの設定・共有・履歴は出さず、回答だけを出す。
 *
 * 共有に条件が付いていれば、当てはまる回答だけが並ぶ（絞り込みは
 * `listResponses` がサーバ側で行う。ここへ来る前に落としてある）。
 */
export default async function PublicResponsesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const tr = await getTranslations();
  const { code } = await params;

  const userId = await sessionUserId();
  const form = await fetchForm(code);
  const access = form ? await formAccess(form) : NO_SHARE_ACCESS;

  // 「共有されていない」と「存在しない」を区別しない（コードの総当たりで
  // フォームの実在を確かめられないようにするため）。
  if (!form || !access.canRead) {
    return (
      <FormStateScreen
        actions={[
          { label: tr("common.backToHome"), href: "/", variant: "filled" },
        ]}
        color="gray"
        description={tr("f.responses.theUrlIsWrongOrYou")}
        formTitle={null}
        icon={<IconSearchOff size={24} />}
        title={tr("f.responses.youCannotViewTheResponses")}
      />
    );
  }

  // 閲覧できると決まったあとで転送する（判定より前に出すと実在を明かす）。
  // 転送先 /general/forms/<code> の門も access.canRead で、ここと同じ。
  if (await formsAppAvailable()) redirect(`/general/forms/${code}`);

  const responses = await listResponses(form, access.responseScope, userId);
  const limited = !access.responseScope.all;

  return (
    <Stack gap="md" maw={1080} mx="auto" p="md">
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Stack gap={4}>
          <Title order={3}>{form.title}</Title>
          <Text c="dimmed" size="sm">
            回答 {responses.length} 件
            {limited && tr("f.responses.onlyThoseMatchingTheSharingConditions")}
          </Text>
        </Stack>
        <Group gap="xs">
          {access.canRespond && form.availability === "OPEN" && (
            <SecondaryButton href={`/f/${code}`}>
              {tr("f.responses.respond")}
            </SecondaryButton>
          )}
        </Group>
      </Group>

      <PublicResponsesTable
        code={code}
        respondentShown={form.respondentVisibility === "SHOWN"}
        responses={responses}
      />
    </Stack>
  );
}
