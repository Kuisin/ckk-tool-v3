/**
 * ui.tsx — Shared presentational helpers for design pages.
 *
 * Mirrors the production components in `src/components/ui/` (see _specs/design.md §10):
 *   FieldValue, MoneyText, JsonLocalizedText, EmptyState, PageHeader.
 *
 * These are preview stand-ins — no Next.js routing, links are inert.
 */

import type { ReactNode } from 'react';
import {
  Breadcrumbs,
  Button,
  Center,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useIsMobile } from './viewport-context';

/** { ja, en } DB field — renders ja (preview locale), falls back per design.md §10.6. */
export type LocalizedText = { ja: string; en: string };

export function localized(value: LocalizedText | null | undefined): string {
  return value?.ja ?? value?.en ?? '—';
}

// ── FieldValue (design.md §10.1) ────────────────────────────────────────────
export function FieldValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} component="div">{value ?? '—'}</Text>
    </Stack>
  );
}

// ── MoneyText (design.md §10.7) ─────────────────────────────────────────────
const JPY = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

export function formatMoney(value: number | null | undefined, currency = 'JPY'): string {
  if (value == null) return '—';
  if (currency === 'JPY') return JPY.format(value);
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(value);
}

export function MoneyText({
  value,
  currency,
  ta = 'right',
}: {
  value: number | null | undefined;
  currency?: string;
  ta?: 'left' | 'right';
}) {
  return (
    <Text size="sm" ta={ta} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(value, currency)}
    </Text>
  );
}

// ── Mono document number ────────────────────────────────────────────────────
export function DocNumber({ children, c }: { children: ReactNode; c?: string }) {
  return (
    <Text size="sm" ff="mono" c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </Text>
  );
}

// ── EmptyState (design.md §10.3) ────────────────────────────────────────────
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Center py="xl">
      <Stack align="center" gap="sm">
        <ThemeIcon size="xl" variant="light" color="gray">
          {icon}
        </ThemeIcon>
        <Text c="dimmed" size="sm">{message}</Text>
        {action}
      </Stack>
    </Center>
  );
}

// ── PageHeader (design.md §10.2 / §8) ───────────────────────────────────────
/**
 * Standard list/detail/form header: breadcrumbs (desktop) + title (+ status) + actions.
 * Breadcrumbs hide on mobile; title drops to order 3.
 */
export function PageHeader({
  breadcrumbs,
  title,
  status,
  actions,
  align = 'flex-end',
}: {
  breadcrumbs: string[];
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  align?: 'flex-end' | 'flex-start';
}) {
  const isMobile = useIsMobile();
  return (
    <Group justify="space-between" align={align} wrap="nowrap">
      <Stack gap={status ? 4 : 2} style={{ minWidth: 0 }}>
        {!isMobile && (
          <Breadcrumbs>
            {breadcrumbs.map((b, i) => (
              <Text key={i} size="sm" c={i === breadcrumbs.length - 1 ? undefined : 'dimmed'}>
                {b}
              </Text>
            ))}
          </Breadcrumbs>
        )}
        <Group gap="sm" align="center" wrap="nowrap">
          <Title order={isMobile ? 3 : 2} style={{ whiteSpace: 'nowrap' }}>{title}</Title>
          {status}
        </Group>
      </Stack>
      {actions}
    </Group>
  );
}

// ── Boolean active/inactive badge (design.md §14) ───────────────────────────
import { Badge } from '@mantine/core';

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge color={active ? 'green' : 'gray'} variant="light">
      {active ? '有効' : '無効'}
    </Badge>
  );
}

// ── Date formatting (design.md §17.3) ───────────────────────────────────────
export function formatDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).replace(/-/g, '/') : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [d, t = ''] = iso.split(/[ T]/);
  return `${d.replace(/-/g, '/')} ${t.slice(0, 5)}`.trim();
}

// ── New button (list pages) ─────────────────────────────────────────────────
import { IconPlus } from '@tabler/icons-react';

export function NewButton({ label = '新規作成' }: { label?: string }) {
  const isMobile = useIsMobile();
  return (
    <Button leftSection={<IconPlus size={16} />} size={isMobile ? 'sm' : 'md'} style={{ flexShrink: 0 }}>
      {isMobile ? '新規' : label}
    </Button>
  );
}
