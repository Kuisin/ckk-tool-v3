"use client";

/**
 * DocsMobileBar — モバイルの目次ボタン + Drawer（デスクトップは非表示）。
 */

import { Box, Burger, Drawer, Group, ScrollArea, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { DocsNav } from "./DocsNav";

export function DocsMobileBar() {
  const [opened, { toggle, close }] = useDisclosure(false);
  return (
    <Box hiddenFrom="md" mb="sm">
      <Group gap="xs">
        <Burger aria-label="目次" onClick={toggle} opened={opened} size="sm" />
        <Text fw={600} size="sm">
          目次
        </Text>
      </Group>
      <Drawer
        onClose={close}
        opened={opened}
        padding="md"
        size="80%"
        title="マニュアル"
      >
        <ScrollArea.Autosize mah="80vh">
          <DocsNav onNavigate={close} />
        </ScrollArea.Autosize>
      </Drawer>
    </Box>
  );
}
