"use client";

/**
 * DocsMobileBar — モバイルの目次ボタン + Drawer（デスクトップは非表示）。
 */

import { Box, Burger, Drawer, Group, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { DocsNav } from "./DocsNav";
import { DocsSearch } from "./DocsSearch";

export function DocsMobileBar() {
  const [opened, { toggle, close }] = useDisclosure(false);
  return (
    <Box hiddenFrom="md" mb="sm">
      <Group align="center" gap="sm" wrap="nowrap">
        <Burger aria-label="目次" onClick={toggle} opened={opened} size="sm" />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <DocsSearch full />
        </Box>
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
