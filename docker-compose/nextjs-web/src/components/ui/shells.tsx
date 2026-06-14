"use client";

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
} from "@mantine/core";
import type { GetInputPropsReturnType } from "@mantine/form";
import {
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useViewport";
import {
  CancelButton,
  EditButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "./buttons";
import { type Crumb, PageHeader } from "./PageHeader";
import { PdfButton } from "./PdfButton";

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
  editLabel = "編集",
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
      <Menu position="bottom-end" shadow="sm" withinPortal>
        <Menu.Target>
          <Button px="xs" size={isMobile ? "sm" : undefined} variant="default">
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {extra.map((m, i) => (
            <Box key={m.label}>
              {m.divider && i > 0 && <Menu.Divider />}
              <Menu.Item
                color={m.color}
                leftSection={m.icon}
                onClick={m.onClick}
              >
                {m.label}
              </Menu.Item>
            </Box>
          ))}
        </Menu.Dropdown>
      </Menu>
    ) : null;

  if (isMobile) {
    const all: MenuItemDef[] = [
      ...(onEdit
        ? [{ label: editLabel, icon: <IconEdit size={14} />, onClick: onEdit }]
        : []),
      ...(pdf
        ? [{ label: pdf.label ?? "PDF", icon: <IconFileTypePdf size={14} /> }]
        : []),
      ...menuItems,
    ];
    return menu(all);
  }

  return (
    <Group className="shrink-0" gap="xs">
      {onEdit && <EditButton onClick={onEdit}>{editLabel}</EditButton>}
      {pdf &&
        (pdf.href ? (
          <PdfButton href={pdf.href} label={pdf.label} />
        ) : (
          <SecondaryButton
            leftSection={<IconFileTypePdf size={14} />}
            onClick={pdf.onClick}
          >
            {pdf.label ?? "PDF"}
          </SecondaryButton>
        ))}
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
  breadcrumbs: Crumb[];
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
      <PageHeader actions={action} breadcrumbs={breadcrumbs} title={title} />
      <Paper p="sm" shadow="xs">
        {hasFilters &&
          (isMobile ? (
            <Stack gap="xs" mb="sm">
              {search}
              <Group align="flex-end" gap="xs">
                {filters}
                {onReset && (
                  <GhostButton onClick={onReset}>リセット</GhostButton>
                )}
              </Group>
            </Stack>
          ) : (
            <Group align="flex-end" mb="sm">
              {search && <Box className="flex-1">{search}</Box>}
              {filters}
              {onReset && <GhostButton onClick={onReset}>リセット</GhostButton>}
            </Group>
          ))}
        {children}
      </Paper>
    </Stack>
  );
}

// ── SummaryGrid ─────────────────────────────────────────────────────────────
export function SummaryGrid({
  cols = 3,
  children,
}: {
  cols?: number;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Paper p="md" radius="md" withBorder>
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
  breadcrumbs: Crumb[];
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
      <PageHeader
        actions={actions}
        align="flex-start"
        breadcrumbs={breadcrumbs}
        status={status}
        title={title}
      />
      {children}
      {!isMobile && (createdAt || updatedAt) && (
        <>
          <Divider />
          <Group gap="xl">
            {createdAt && (
              <Text c="dimmed" size="xs">
                作成: {createdAt}
              </Text>
            )}
            {updatedAt && (
              <Text c="dimmed" size="xs">
                更新: {updatedAt}
              </Text>
            )}
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
  submitLabel = "保存",
  children,
}: {
  breadcrumbs: Crumb[];
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
      <PageHeader breadcrumbs={breadcrumbs} status={status} title={title} />
      <Box component="form" onSubmit={onSubmit} pos="relative">
        <LoadingOverlay visible={!!isPending} />
        <Stack gap="md">
          {children}
          {isMobile ? (
            <Stack gap="xs">
              <SaveButton fullWidth loading={isPending}>
                {submitLabel}
              </SaveButton>
              <CancelButton fullWidth onClick={onCancel} />
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <CancelButton onClick={onCancel} />
              <SaveButton loading={isPending}>{submitLabel}</SaveButton>
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
    <Paper className="form-section" p="md" radius="md" withBorder>
      <Title mb={description ? 2 : "xs"} order={4}>
        {title}
      </Title>
      {description && (
        <Text c="dimmed" mb="xs" size="xs">
          {description}
        </Text>
      )}
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
    <Timeline
      active={-1}
      bulletSize={18}
      classNames={{
        item: "audit-timeline-item",
      }}
      lineWidth={1}
    >
      {entries.map((log) => (
        <Timeline.Item
          bullet={
            <Text fw={700} fz={10}>
              {log.user[0]}
            </Text>
          }
          key={log.id}
          lineVariant="dotted"
          title={
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm">
                {log.action}
              </Text>
              <Text c="dimmed" size="xs">
                {log.at} · {log.user}
              </Text>
            </Group>
          }
        >
          {log.detail && (
            <Text mt={2} size="xs">
              {log.detail}
            </Text>
          )}
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
      <TextInput
        label={`${label}（日本語）`}
        placeholder={placeholder}
        withAsterisk={required}
        {...jaProps}
      />
      <TextInput
        label={`${label}（English）`}
        placeholder={placeholder}
        {...enProps}
      />
    </SimpleGrid>
  );
}
