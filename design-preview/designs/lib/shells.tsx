/**
 * shells.tsx — Unified page scaffolds (list / detail / form) for maintainability.
 *
 * Encapsulates the §8 page patterns from _specs/design.md so every screen shares
 * one responsive header / filter-bar / summary / tabs / footer implementation.
 *
 *   ListShell   — header + NewButton + filter bar + <DataTable> (children)
 *   DetailShell — header + status + edit/pdf/menu actions + summary + panels + footer
 *   FormShell   — header + <form> + LoadingOverlay + sectioned body + actions
 *   FormSection — one Paper section (title + divider + fields)
 *   SummaryGrid — responsive FieldValue grid
 *   ResourceActions — edit / pdf / overflow menu (collapses to “…” on mobile)
 *   AuditTimeline   — 履歴 tab timeline
 *   LocalizedTextInput — { ja, en } paired inputs
 */

import { type ReactNode } from 'react';
import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import type { GetInputPropsReturnType } from '@mantine/form';
import {
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
} from '@tabler/icons-react';
import { useIsMobile } from './viewport-context';
import { PageHeader } from './ui';

export interface MenuItemDef {
  label: string;
  icon?: ReactNode;
  color?: string;
  onClick?: () => void;
  divider?: boolean;
}

// ── ResourceActions (detail header actions) ─────────────────────────────────
export function ResourceActions({
  onEdit,
  editLabel = '編集',
  pdf,
  menuItems = [],
}: {
  onEdit?: () => void;
  editLabel?: string;
  pdf?: { href?: string; onClick?: () => void; label?: string };
  menuItems?: MenuItemDef[];
}) {
  const isMobile = useIsMobile();

  const menu = (extra: MenuItemDef[]) =>
    extra.length > 0 ? (
      <Menu shadow="sm" position="bottom-end" withinPortal>
        <Menu.Target>
          <Button variant="default" px="xs" size={isMobile ? 'sm' : undefined}>
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {extra.map((m, i) => (
            <Box key={m.label}>
              {m.divider && i > 0 && <Menu.Divider />}
              <Menu.Item leftSection={m.icon} color={m.color} onClick={m.onClick}>
                {m.label}
              </Menu.Item>
            </Box>
          ))}
        </Menu.Dropdown>
      </Menu>
    ) : null;

  if (isMobile) {
    const all: MenuItemDef[] = [
      ...(onEdit ? [{ label: editLabel, icon: <IconEdit size={14} />, onClick: onEdit }] : []),
      ...(pdf ? [{ label: pdf.label ?? 'PDF', icon: <IconFileTypePdf size={14} /> }] : []),
      ...menuItems,
    ];
    return menu(all);
  }

  return (
    <Group gap="xs" style={{ flexShrink: 0 }}>
      {onEdit && (
        <Button variant="default" leftSection={<IconEdit size={14} />} onClick={onEdit}>
          {editLabel}
        </Button>
      )}
      {pdf && (
        <Button
          variant="default"
          leftSection={<IconFileTypePdf size={14} />}
          component={pdf.href ? 'a' : 'button'}
          href={pdf.href}
          target={pdf.href ? '_blank' : undefined}
          onClick={pdf.onClick}
        >
          {pdf.label ?? 'PDF'}
        </Button>
      )}
      {menu(menuItems)}
    </Group>
  );
}

// ── ListShell ───────────────────────────────────────────────────────────────
export function ListShell({
  breadcrumbs,
  title,
  action,
  search,
  filters,
  onReset,
  children,
}: {
  breadcrumbs: string[];
  title: string;
  action?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const hasFilters = !!(search || filters);

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={breadcrumbs} title={title} actions={action} />
      <Paper shadow="xs" p="sm">
        {hasFilters && (
          isMobile ? (
            <Stack gap="xs" mb="sm">
              {search}
              <Group gap="xs" align="flex-end">
                {filters}
                {onReset && <Button variant="subtle" size="sm" onClick={onReset}>リセット</Button>}
              </Group>
            </Stack>
          ) : (
            <Group mb="sm" align="flex-end">
              {search && <Box style={{ flex: 1 }}>{search}</Box>}
              {filters}
              {onReset && <Button variant="subtle" onClick={onReset}>リセット</Button>}
            </Group>
          )
        )}
        {children}
      </Paper>
    </Stack>
  );
}

// ── SummaryGrid ─────────────────────────────────────────────────────────────
export function SummaryGrid({ cols = 3, children }: { cols?: number; children: ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <Paper withBorder p="md" radius="md">
      <SimpleGrid cols={isMobile ? 1 : cols} spacing="md">
        {children}
      </SimpleGrid>
    </Paper>
  );
}

// ── DetailShell ─────────────────────────────────────────────────────────────
export function DetailShell({
  breadcrumbs,
  title,
  status,
  actions,
  children,
  createdAt,
  updatedAt,
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  createdAt?: string;
  updatedAt?: string;
}) {
  const isMobile = useIsMobile();
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={breadcrumbs} title={title} status={status} actions={actions} align="flex-start" />
      {children}
      {!isMobile && (createdAt || updatedAt) && (
        <>
          <Divider />
          <Group gap="xl">
            {createdAt && <Text size="xs" c="dimmed">作成: {createdAt}</Text>}
            {updatedAt && <Text size="xs" c="dimmed">更新: {updatedAt}</Text>}
          </Group>
        </>
      )}
    </Stack>
  );
}

// ── FormShell ───────────────────────────────────────────────────────────────
export function FormShell({
  breadcrumbs,
  title,
  status,
  isPending,
  onSubmit,
  onCancel,
  submitLabel = '保存',
  children,
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  isPending?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={breadcrumbs} title={title} status={status} />
      <Box component="form" onSubmit={onSubmit} pos="relative">
        <LoadingOverlay visible={!!isPending} />
        <Stack gap="md">
          {children}
          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>{submitLabel}</Button>
              <Button variant="default" fullWidth onClick={onCancel}>キャンセル</Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={onCancel}>キャンセル</Button>
              <Button type="submit" loading={isPending}>{submitLabel}</Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

// ── FormSection ─────────────────────────────────────────────────────────────
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder p="md" radius="md">
      <Title order={4} mb={description ? 2 : 'xs'}>{title}</Title>
      {description && <Text size="xs" c="dimmed" mb="xs">{description}</Text>}
      <Divider mb="md" />
      {children}
    </Paper>
  );
}

// ── AuditTimeline (履歴) ─────────────────────────────────────────────────────
export interface AuditEntry {
  id: string | number;
  action: string;
  user: string;
  at: string;
  detail?: ReactNode;
}

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <Timeline active={-1} bulletSize={28} lineWidth={2}>
      {entries.map((log) => (
        <Timeline.Item
          key={log.id}
          bullet={<Text size="xs" fw={700}>{log.user[0]}</Text>}
          title={log.action}
        >
          <Text size="xs" c="dimmed">{log.at} · {log.user}</Text>
          {log.detail && <Text size="sm" mt={4}>{log.detail}</Text>}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

// ── LocalizedTextInput ({ ja, en } pair) ─────────────────────────────────────
export function LocalizedTextInput({
  label,
  jaProps,
  enProps,
  required,
  placeholder,
}: {
  label: string;
  jaProps: GetInputPropsReturnType;
  enProps: GetInputPropsReturnType;
  required?: boolean;
  placeholder?: string;
}) {
  const isMobile = useIsMobile();
  return (
    <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
      <TextInput label={`${label}（日本語）`} withAsterisk={required} placeholder={placeholder} {...jaProps} />
      <TextInput label={`${label}（English）`} placeholder={placeholder} {...enProps} />
    </SimpleGrid>
  );
}
