"use client";

/**
 * ResponseActionRow — 回答者向けの画面（/f/<code>/<回答番号>）の操作行。
 *
 * 置き場所を Server Component から分けたのは `useIsMobile` を使うため。
 * スマホでは横に並べず全幅で積む（design.md §20.2）— 3 つ並ぶと日本語の
 * ラベルが折り返して、どれが主操作なのか分からなくなる。
 *
 * この行は **アプリ内へ転送されなかった人にだけ出る**（フォームアプリが
 * その環境で無効・権限外のとき）。社内利用者は /general/forms/... の
 * 濃い画面へ送られるので、ここには来ない。
 */

import { Group, Stack } from "@mantine/core";
import { useTranslations } from "next-intl";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";

export function ResponseActionRow({
  code,
  responseNumber,
  editable,
  isDraft,
  canAnswerAgain,
  canSeeAll,
}: {
  code: string;
  responseNumber: string;
  editable: boolean;
  isDraft: boolean;
  canAnswerAgain: boolean;
  canSeeAll: boolean;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const edit = `/f/${code}/${encodeURIComponent(responseNumber)}/edit`;

  const buttons = [
    editable && (
      <PrimaryButton fullWidth={isMobile} href={edit} key="edit">
        {isDraft ? "下書きの続きを書く" : tr("common.editTheResponse")}
      </PrimaryButton>
    ),
    canAnswerAgain && (
      <SecondaryButton fullWidth={isMobile} href={`/f/${code}`} key="again">
        {tr("forms.responseActionRow.respondOnceMore")}
      </SecondaryButton>
    ),
    canSeeAll && (
      <SecondaryButton
        fullWidth={isMobile}
        href={`/f/${code}/responses`}
        key="all"
      >
        {tr("common.viewResponses")}
      </SecondaryButton>
    ),
  ].filter(Boolean);

  if (buttons.length === 0) return null;

  return isMobile ? (
    <Stack gap="xs">{buttons}</Stack>
  ) : (
    <Group gap="xs">{buttons}</Group>
  );
}
