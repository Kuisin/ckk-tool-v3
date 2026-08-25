/**
 * FormStateScreen — 共有 URL（/f/<code>）で「いま回答できない」ときの画面。
 *
 * 生の 404 だと、受け取った人は打つ手が分からない（URL を間違えたのか、まだ
 * 始まっていないのか、もう出したのか）。理由と次の一手をここで出す。
 *
 * `(dashboard)` の外なので、外部リンク確認ページ（/l/<code>）と同じ
 * 「中央のカード 1 枚」の形に合わせてある。サーバーコンポーネント。
 */

import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import type { ReactNode } from "react";

export interface FormStateAction {
  label: string;
  href: string;
  variant?: "filled" | "default";
}

export function FormStateScreen({
  icon,
  color,
  title,
  description,
  formTitle,
  detail,
  actions = [],
}: {
  icon: ReactNode;
  color: string;
  title: string;
  description: string;
  /** 共有されている相手にだけ渡す（未共有では実在を明かさないので出さない）。 */
  formTitle?: string | null;
  /** 開始日時・回答番号など、状態ごとの補足。 */
  detail?: ReactNode;
  actions?: FormStateAction[];
}) {
  return (
    <Stack align="center" p="md">
      <Card maw={560} p="lg" radius="md" shadow="xs" w="100%" withBorder>
        <Stack align="center" gap="sm" py="md">
          <ThemeIcon color={color} radius="xl" size="xl" variant="light">
            {icon}
          </ThemeIcon>

          {formTitle && (
            <Text c="dimmed" size="sm" ta="center">
              {formTitle}
            </Text>
          )}

          <Title order={3} ta="center">
            {title}
          </Title>

          <Text c="dimmed" size="sm" ta="center">
            {description}
          </Text>

          {detail}

          {actions.length > 0 && (
            <Group justify="center" mt="xs" wrap="wrap">
              {actions.map((a) => (
                <Button
                  component="a"
                  href={a.href}
                  key={a.href + a.label}
                  variant={a.variant ?? "default"}
                >
                  {a.label}
                </Button>
              ))}
            </Group>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
