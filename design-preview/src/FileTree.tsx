import { useState } from 'react';
import { Box, Collapse, Text, UnstyledButton } from '@mantine/core';
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderOpen,
} from '@tabler/icons-react';
import type { FileTreeNode } from './file-tree';

interface FileTreeProps {
  nodes: FileTreeNode[];
  selected: string | null;
  onSelect: (modulePath: string) => void;
}

export function FileTree({ nodes, selected, onSelect }: FileTreeProps) {
  return (
    <Box component="nav" aria-label="Design files">
      {nodes.map((node) => (
        <TreeNode
          key={node.modulePath ?? node.name}
          node={node}
          selected={selected}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </Box>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  selected: string | null;
  onSelect: (modulePath: string) => void;
  depth: number;
}

function TreeNode({ node, selected, onSelect, depth }: TreeNodeProps) {
  const isFolder = Boolean(node.children?.length);
  const [open, setOpen] = useState(true);

  if (isFolder) {
    return (
      <Box>
        <UnstyledButton
          onClick={() => setOpen((value) => !value)}
          w="100%"
          py={4}
          pl={depth * 12 + 4}
          pr={8}
          style={{ borderRadius: 'var(--mantine-radius-sm)' }}
        >
          <Box
            component="span"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              minWidth: 0,
            }}
          >
            <IconChevronRight
              size={14}
              style={{
                flexShrink: 0,
                transition: 'transform 150ms ease',
                transform: open ? 'rotate(90deg)' : undefined,
              }}
            />
            {open ? (
              <IconFolderOpen size={16} style={{ flexShrink: 0 }} />
            ) : (
              <IconFolder size={16} style={{ flexShrink: 0 }} />
            )}
            <Text size="sm" fw={500} truncate>
              {node.name}
            </Text>
          </Box>
        </UnstyledButton>
        <Collapse expanded={open}>
          {node.children!.map((child) => (
            <TreeNode
              key={child.modulePath ?? child.name}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </Collapse>
      </Box>
    );
  }

  const isSelected = node.modulePath === selected;

  return (
    <UnstyledButton
      onClick={() => node.modulePath && onSelect(node.modulePath)}
      w="100%"
      py={4}
      pl={depth * 12 + 24}
      pr={8}
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        background: isSelected
          ? 'var(--mantine-color-blue-light)'
          : undefined,
      }}
    >
      <Box
        component="span"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <IconFile size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
        <Text
          size="sm"
          truncate
          c={isSelected ? 'blue' : undefined}
          fw={isSelected ? 500 : undefined}
        >
          {node.name}
        </Text>
      </Box>
    </UnstyledButton>
  );
}
