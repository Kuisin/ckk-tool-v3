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
 *   FormActions — bottom action row, sticky to the viewport on desktop
 *   FormSection — one Paper section (title + divider + fields)
 *   SummaryGrid — responsive FieldValue grid
 *   ResourceActions — edit / pdf / overflow menu (collapses to “…” on mobile)
 *   AuditTimeline   — 履歴 tab timeline
 *   LocalizedTextInput — { ja, en } paired inputs
 */

import {
  Badge,
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
  UnstyledButton,
} from "@mantine/core";
import type { GetInputPropsReturnType } from "@mantine/form";
import {
  IconDeviceTablet,
  IconDotsVertical,
  IconEdit,
  IconFileTypePdf,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { useUnsavedChanges } from "@/components/layout/NavigationGuard";
import { useIsMobile } from "@/hooks/useViewport";
import { keepInAppOnClick } from "@/lib/pwa-display";
import { AuditDetailModal } from "./AuditDetailModal";
import {
  CancelButton,
  EditButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "./buttons";
import { HelpLabel } from "./HelpLabel";
import { type Crumb, PageHeader } from "./PageHeader";
import { PdfButton } from "./PdfButton";
import { UserAvatar } from "./UserAvatar";

export interface MenuItemDef {
  label: string;
  icon?: ReactNode;
  color?: string;
  onClick?: () => void;
  /**
   * リンクとして開く項目（PDF 等）。`window.open` ではなく実アンカーを描画する
   * ので、ホーム画面に追加した PWA（standalone）でもアプリ内ブラウザで開く。
   */
  href?: string;
  divider?: boolean;
  /**
   * 状態的にいま実行できない項目。**隠さずグレーアウトで残す** — 操作が
   * 存在すること自体を見せ、なぜ押せないかを disabledReason で説明する。
   */
  disabled?: boolean;
  /** disabled のときに項目の下に出す小さな説明（例: 「確定後に実行できます」）。 */
  disabledReason?: string;
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
          {/* アイコンのみのボタンには aria-label が必須（design.md §18.2）。 */}
          <Button
            aria-label="操作メニュー"
            px="xs"
            size={isMobile ? "sm" : undefined}
            variant="default"
          >
            <IconDotsVertical size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {extra.map((m, i) => {
            const label =
              m.disabled && m.disabledReason ? (
                <Box>
                  {m.label}
                  <Text c="dimmed" size="xs">
                    {m.disabledReason}
                  </Text>
                </Box>
              ) : (
                m.label
              );
            return (
              <Box key={m.label}>
                {m.divider && i > 0 && <Menu.Divider />}
                {m.href && !m.disabled ? (
                  // 実アンカー + target="_blank"（window.open はポップアップ扱いで
                  // 塞がれる）。インストールした PWA ではアプリの中で開く —
                  // 判定と分岐は lib/pwa-display.ts に寄せてある。
                  <Menu.Item
                    color={m.color}
                    component="a"
                    href={m.href}
                    leftSection={m.icon}
                    onClick={(e) => keepInAppOnClick(e, m.href as string)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {label}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    color={m.color}
                    disabled={m.disabled}
                    leftSection={m.icon}
                    onClick={m.disabled ? undefined : m.onClick}
                  >
                    {label}
                  </Menu.Item>
                )}
              </Box>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    ) : null;

  if (isMobile) {
    const all: MenuItemDef[] = [
      ...(onEdit
        ? [{ label: editLabel, icon: <IconEdit size={14} />, onClick: onEdit }]
        : []),
      ...(pdf
        ? [
            {
              label: pdf.label ?? "PDF",
              icon: <IconFileTypePdf size={14} />,
              // モバイルにはインラインボタンが無いので、メニュー項目を別タブ
              // リンクとして描画する（PWA ではアプリ内ブラウザで開く）。
              href: pdf.href,
              onClick: pdf.href ? undefined : pdf.onClick,
            },
          ]
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
  embedded = false,
  children,
}: {
  breadcrumbs: Crumb[];
  title: string;
  action?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  onReset?: () => void;
  /** タブの中など、画面ヘッダを親が出すとき true（見出しだけ省く）。 */
  embedded?: boolean;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const hasFilters = !!(search || filters);

  return (
    <Stack gap="md">
      {embedded ? (
        action && <Group justify="flex-end">{action}</Group>
      ) : (
        <PageHeader actions={action} breadcrumbs={breadcrumbs} title={title} />
      )}
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
  isDirty = false,
  onSubmit,
  onCancel,
  submitLabel = "保存",
  children,
}: {
  breadcrumbs: Crumb[];
  title: string;
  status?: ReactNode;
  isPending?: boolean;
  /** 未保存の変更があるか（通常 `form.isDirty()`）。離脱時に確認を出す。 */
  isDirty?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  children: ReactNode;
}) {
  // 送信中は保存処理の遷移を妨げないよう、未保存ガードを解除する。
  useUnsavedChanges(isDirty && !isPending);
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={breadcrumbs} status={status} title={title} />
      <Box component="form" onSubmit={onSubmit} pos="relative">
        <LoadingOverlay visible={!!isPending} />
        <Stack gap="md">
          {children}
          <FormActions
            loading={isPending}
            onCancel={onCancel}
            submitLabel={submitLabel}
          />
        </Stack>
      </Box>
    </Stack>
  );
}

// ── FormActions ─────────────────────────────────────────────────────────────
/**
 * フォーム下部のアクション行（キャンセル / 保存）。**保存ボタンは常にここ** —
 * 画面ヘッダー（PageHeader の actions）には置かない。デスクトップでは画面下端に
 * 固定され、フォームがどれだけ長くてもボタンが常に見える（globals.css
 * `.form-actions`）。モバイルは従来どおり本文末尾に流す（ソフトキーボードが
 * 画面下を占有するため）。
 *
 * 既定でキャンセル / 保存の並び（モバイルは縦積み・全幅）を描画する:
 *
 *   <FormActions loading={isPending} onCancel={back} onSave={save} />
 *
 * `onSave` を渡さない場合は保存ボタンが `type="submit"`（`<form>` 送信）になる。
 * `FormShell` は自動でこれを使う。独自のボタン構成が要るときだけ `children` を
 * 渡す（その場合 `onCancel` / `onSave` は無視される）。
 */
export function FormActions({
  children,
  onCancel,
  onSave,
  submitLabel = "保存",
  cancelLabel,
  loading,
  disabled,
}: {
  /** 独自のボタン構成。渡すとキャンセル / 保存の既定描画を置き換える。 */
  children?: ReactNode;
  /** キャンセル（省略するとキャンセルボタンを出さない）。 */
  onCancel?: () => void;
  /** 保存ハンドラ。省略時は保存ボタンが `type="submit"` になる。 */
  onSave?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isMobile = useIsMobile();

  if (children) return <Box className="form-actions">{children}</Box>;

  const save = (
    <SaveButton
      disabled={disabled}
      fullWidth={isMobile}
      loading={loading}
      onClick={onSave}
      type={onSave ? "button" : "submit"}
    >
      {submitLabel}
    </SaveButton>
  );
  const cancel = onCancel ? (
    <CancelButton fullWidth={isMobile} onClick={onCancel}>
      {cancelLabel}
    </CancelButton>
  ) : null;

  return (
    <Box className="form-actions">
      {isMobile ? (
        // モバイルは主操作（保存）を上に、全幅で積む。
        <Stack gap="xs">
          {save}
          {cancel}
        </Stack>
      ) : (
        <Group justify="flex-end">
          {cancel}
          {save}
        </Group>
      )}
    </Box>
  );
}

// ── FormSection ─────────────────────────────────────────────────────────────
export function FormSection({
  title,
  description,
  required,
  children,
}: {
  title: string;
  description?: string;
  /** 必須セクション。タイトル直後に赤い * を表示する。 */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Paper className="form-section" p="md" radius="md" withBorder>
      <Title mb={description ? 2 : "xs"} order={4}>
        {title}
        {required && (
          <span aria-hidden className="required-asterisk">
            {" *"}
          </span>
        )}
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
  /** 操作者の顔写真（小）。未設定・システム操作なら null → イニシャル。 */
  avatarUrl?: string | null;
  /** 操作元のキオスク端末名（共有タブレット経由のみ。Web 操作は null）。 */
  device?: string | null;
  at: string;
  detail?: ReactNode;
  /** 以下は詳細ポップアップ用（一覧表示では使わない）。 */
  tableName?: string;
  tableLabel?: string;
  recordId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * 履歴タイムライン。行をクリックすると詳細ポップアップ（AuditDetailModal）を
 * 開く — 何がどう変わったかを画面遷移なしで確認できる。
 */
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  return (
    <>
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
              log.avatarUrl ? (
                <UserAvatar
                  name={log.user}
                  size={18}
                  thumbSrc={log.avatarUrl}
                />
              ) : (
                <Text fw={700} fz={10}>
                  {log.user[0]}
                </Text>
              )
            }
            key={log.id}
            lineVariant="dotted"
            title={
              <UnstyledButton
                aria-label={`${log.action} の詳細を開く`}
                onClick={() => setSelected(log)}
                style={{ display: "block", width: "100%" }}
              >
                <Group gap="xs" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {log.action}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {log.at} · {log.user}
                  </Text>
                  {log.device && (
                    <Badge
                      color="grape"
                      leftSection={<IconDeviceTablet size={11} />}
                      size="xs"
                      variant="light"
                    >
                      {log.device}
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            }
          >
            {log.detail && (
              <Text
                mt={2}
                onClick={() => setSelected(log)}
                size="xs"
                style={{ cursor: "pointer" }}
              >
                {log.detail}
              </Text>
            )}
          </Timeline.Item>
        ))}
      </Timeline>
      <AuditDetailModal entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// ── LocalizedTextInput ({ ja, en } pair) ─────────────────────────────────────
export function LocalizedTextInput({
  label,
  jaProps,
  enProps,
  required,
  placeholder,
  help,
}: {
  label: string;
  jaProps: GetInputPropsReturnType;
  enProps: GetInputPropsReturnType;
  required?: boolean;
  placeholder?: string;
  /**
   * 「?」に出す説明とマニュアルの該当箇所。ラベルは「〜（日本語）」の形に
   * 組み立てるため、`fieldHelp` ではなく `fieldHelpTip` を渡す。
   */
  help?: { help: string; manual: string };
}) {
  const isMobile = useIsMobile();
  const withHelp = (text: string) =>
    help ? <HelpLabel label={text} {...help} /> : text;
  return (
    <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
      <TextInput
        label={withHelp(`${label}（日本語）`)}
        placeholder={placeholder}
        withAsterisk={required}
        {...jaProps}
      />
      <TextInput
        label={withHelp(`${label}（English）`)}
        placeholder={placeholder}
        {...enProps}
      />
    </SimpleGrid>
  );
}
