/**
 * ExampleCard — drop-in demo showing Mantine v9 + Tailwind CSS side by side.
 * Delete this file once you add your own designs.
 */
import { Card, Text, Badge, Button, Group, Stack, Title } from '@mantine/core';
import { IconBrandMantine } from '@tabler/icons-react';

export default function ExampleCard() {
  return (
    <Stack p="xl" gap="xl" maw={560}>
      <Title order={4}>Example design</Title>

      {/* Mantine component */}
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <IconBrandMantine size={18} />
            <Text fw={500}>Mantine v9 component</Text>
          </Group>
          <Badge color="blue">Mantine</Badge>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          This card is built with <code>@mantine/core</code>. All Mantine
          components and hooks are available in every design file.
        </Text>
        <Button fullWidth radius="md">Mantine Button</Button>
      </Card>

      {/* Tailwind component */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-700">
            Tailwind
          </span>
          <p className="font-medium text-emerald-900">Tailwind CSS component</p>
        </div>
        <p className="text-sm text-emerald-700">
          Utility classes from <code className="font-mono">tailwindcss</code> are
          also available. Both libraries coexist — use whichever the LLM output
          happens to use.
        </p>
      </div>
    </Stack>
  );
}
