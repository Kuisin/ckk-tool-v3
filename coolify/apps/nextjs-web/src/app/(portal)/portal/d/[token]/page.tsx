/**
 * /portal/d/[token] — 書類 1 件へのトークン URL。
 *
 * LINK_ONLY … URL の所持だけで開く。その場でリンク限定セッションを張って
 *             書類ページへ送る。
 * VERIFY    … **この時点では中身を一切返さない**。出すのはマスクした宛先
 *             ヒント（k***@e***.co.jp）だけで、確認コードは**リンクに束縛
 *             されたアドレスへのみ**送る。転送されたリンクは転送先では無価値。
 *
 * 失効・期限切れ・回数切れ・存在しないは**画面上すべて同じ**（区別すると
 * 「そのリンクは存在したが期限切れ」と教えてしまう）。区別は login_attempts の中だけ。
 */

import { Alert, Card, Stack, Text, Title } from "@mantine/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalLinkVerifyForm } from "@/components/portal/PortalLinkVerifyForm";
import { resolveDeviceContext } from "@/lib/device-signals";
import type { LoginFailureReason } from "@/lib/login-attempt-core";
import { recordLoginAttempt } from "@/lib/login-attempts";
import { createPortalSession } from "@/lib/portal-auth";
import { consumePortalLink, resolvePortalLink } from "@/lib/portal-links";
import { maskEmail } from "@/lib/portal-mail-core";
import { requirePortalFeature } from "@/lib/portal-page";
import {
  checkPortalLimit,
  recordPortalLimitFailure,
} from "@/lib/portal-rate-limit";

export const dynamic = "force-dynamic";

/** 利用者に見せる唯一の文言（存在しない・失効・期限切れ・回数切れ 共通）。 */
const DEAD_LINK =
  "このリンクは利用できません。お手数ですが、担当営業へご連絡ください。";

const DENY_REASON: Record<string, LoginFailureReason> = {
  NOT_FOUND: "PORTAL_LINK_NOT_FOUND",
  EXPIRED: "PORTAL_LINK_EXPIRED",
  REVOKED: "PORTAL_LINK_REVOKED",
  EXHAUSTED: "PORTAL_LINK_EXHAUSTED",
};

export default async function PortalLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  requirePortalFeature();
  const { token } = await params;

  const h = await headers();
  const device = resolveDeviceContext({ headers: h } as unknown as Request);

  // トークン単位でレート制限（総当たりを止める）。
  if ((await checkPortalLimit("LINK_RESOLVE", token)).locked) {
    return <DeadLink />;
  }

  const resolved = await resolvePortalLink(token);
  if (!resolved.ok) {
    // 形式不正も含めて 1 失敗として数える（形をタダで探らせない）。
    await recordPortalLimitFailure("LINK_RESOLVE", token);
    void recordLoginAttempt({
      outcome: "FAILURE",
      method: "PORTAL_LINK",
      reason: DENY_REASON[resolved.reason ?? "NOT_FOUND"] ?? "UNKNOWN",
      device,
    });
    return <DeadLink />;
  }

  const link = resolved.link;

  if (link.policy === "LINK_ONLY") {
    // 使用回数を条件付きで 1 つ進める。上限に達していれば通さない。
    if (!(await consumePortalLink(link.id))) {
      void recordLoginAttempt({
        outcome: "FAILURE",
        method: "PORTAL_LINK",
        reason: "PORTAL_LINK_EXHAUSTED",
        device,
      });
      return <DeadLink />;
    }
    await createPortalSession({
      linkId: link.id,
      method: "PORTAL_LINK",
      ipAddress: device.ip,
      userAgent: device.userAgent,
    });
    void recordLoginAttempt({
      outcome: "SUCCESS",
      method: "PORTAL_LINK",
      portalAccountId: link.portalAccountId,
      device,
    });
    redirect(
      `/portal/documents/${link.resourceType}/${encodeURIComponent(link.resourceId)}`,
    );
  }

  // VERIFY — 中身は返さず、宛先のヒントだけを出す。
  return (
    <Stack gap="md" maw={420} mt="xl" mx="auto">
      <Title order={3}>本人確認</Title>
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            ご登録のメールアドレス
            {link.boundEmail ? `（${maskEmail(link.boundEmail)}）` : ""}
            へ確認コードを送ります。
          </Text>
          <PortalLinkVerifyForm token={token} />
        </Stack>
      </Card>
    </Stack>
  );
}

function DeadLink() {
  return (
    <Stack gap="md" maw={420} mt="xl" mx="auto">
      <Title order={3}>リンクを開けません</Title>
      <Alert color="gray" variant="light">
        <Text size="sm">{DEAD_LINK}</Text>
      </Alert>
    </Stack>
  );
}
