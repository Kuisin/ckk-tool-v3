import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconLinkOff,
  IconShieldCheck,
} from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { resolveShortLink } from "@/lib/link-index";
import { APP_NAME } from "@/lib/page-title";
import { followShortLinkAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getTranslations();
  return {
    title: `${tr("l.page.goToAnExternalSite")} | ${APP_NAME}`,
    // 短縮リンクは索引されたくない。
    robots: { index: false, follow: false },
  };
}

/**
 * 外部リンク確認ページ（`/l/<code>`）。
 *
 * メモ / コメント中の外部 URL は保存時に短縮リンクへ置き換えられ、閲覧者は
 * 必ずこのページを経由する。遷移先を明示してから「続行」で外部へ送り出す。
 * ブロック判定は**このページの表示時**と**続行アクション内**の両方で行うので、
 * 後から追加したブロック指定も既存リンクに遡って効く。
 */
export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const tr = await getTranslations();
  const { code } = await params;
  const resolved = await resolveShortLink(decodeURIComponent(code));

  return (
    <Box p="md" style={{ display: "flex", justifyContent: "center" }}>
      <Card maw={640} p="lg" radius="md" shadow="xs" w="100%" withBorder>
        {resolved.status === "not-found" && (
          <Stack align="center" gap="sm" py="md">
            <ThemeIcon color="gray" radius="xl" size="xl" variant="light">
              <IconLinkOff size={24} />
            </ThemeIcon>
            <Title order={3}>{tr("l.page.linkNotFound")}</Title>
            <Text c="dimmed" size="sm" ta="center">
              {tr("l.page.thisLinkWasDeletedOrThe")}
            </Text>
            <Button component="a" href="/" variant="default">
              {tr("common.backToHome")}
            </Button>
          </Stack>
        )}

        {resolved.status === "blocked" && (
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="red" radius="xl" size="lg" variant="light">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
              <Title order={3}>{tr("l.page.thisLinkIsBlocked")}</Title>
            </Group>
            <Alert color="red" variant="light">
              <Stack gap={4}>
                <Text size="sm">
                  {tr("l.page.anAdministrator")}{" "}
                  <strong>{resolved.hostname}</strong>{" "}
                  への移動を禁止しています。
                </Text>
                {resolved.reason && (
                  <Text size="sm">理由: {resolved.reason}</Text>
                )}
              </Stack>
            </Alert>
            <Text c="dimmed" size="xs">
              {tr("l.page.ifThisWasNotYouContact")}
            </Text>
            <Group justify="flex-end">
              <Button component="a" href="/" variant="default">
                {tr("common.backToHome")}
              </Button>
            </Group>
          </Stack>
        )}

        {resolved.status === "ok" && (
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="blue" radius="xl" size="lg" variant="light">
                <IconShieldCheck size={20} />
              </ThemeIcon>
              <Title order={3}>{tr("l.page.youAreLeavingForAnExternal")}</Title>
            </Group>

            <Text size="sm">
              {tr("l.page.thisLinkLeavesTheInternalSystem")}
            </Text>

            <Card bg="var(--mantine-color-default-hover)" p="sm" radius="sm">
              <Stack gap={4}>
                <Text c="dimmed" size="xs">
                  {tr("l.page.destination")}
                </Text>
                <Text fw={600} size="sm">
                  {resolved.hostname}
                </Text>
                <Code
                  block
                  style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
                >
                  {resolved.url}
                </Code>
              </Stack>
            </Card>

            <Alert color="yellow" variant="light">
              <Text size="xs">
                {tr("l.page.doNotEnterInternalPasswordsOr")}
              </Text>
            </Alert>

            <form action={followShortLinkAction}>
              <input name="code" type="hidden" value={code} />
              <Group justify="space-between">
                <Anchor c="dimmed" href="/" size="sm">
                  {tr("common.cancel")}
                </Anchor>
                <Button
                  rightSection={<IconExternalLink size={16} />}
                  type="submit"
                >
                  {tr("l.page.continueAndLeave")}
                </Button>
              </Group>
            </form>
          </Stack>
        )}
      </Card>
    </Box>
  );
}
