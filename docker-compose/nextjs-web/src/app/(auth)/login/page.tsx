import {
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

/**
 * ログイン — TODO(auth): wire to Auth.js v5 (Samba AD LDAP/OAuth).
 * Static stub: fields are present but submission is not implemented.
 */
export default function LoginPage() {
  return (
    <Center bg="var(--mantine-color-gray-0)" mih="100dvh">
      <Paper p="xl" radius="md" shadow="sm" w={360} withBorder>
        <Stack gap="md">
          <Stack align="center" gap={4}>
            {/* biome-ignore lint/performance/noImgElement: static SVG logo — next/image adds no value */}
            <img
              alt="CKK"
              className="h-16"
              src="/design-assets/logo-with-label.svg"
            />
            <Title order={3}>業務管理システム</Title>
            <Text c="dimmed" size="xs">
              社内アカウントでログイン
            </Text>
          </Stack>
          <TextInput label="ユーザー名" placeholder="username" withAsterisk />
          <PasswordInput
            label="パスワード"
            placeholder="••••••••"
            withAsterisk
          />
          <Button fullWidth mt="xs">
            ログイン
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
