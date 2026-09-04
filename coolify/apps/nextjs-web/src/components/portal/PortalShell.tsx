"use client";

/**
 * PortalShell — 取引先ポータルの外枠。
 *
 * 社内の AppShell とは別物にしてある。ランチャー・操作コード・通知・
 * プロフィールメニューは社内の道具で、社外の人には出さない。出すのは
 * 会社名・行き先・ログアウトだけ。
 *
 * ■ 行き先をここに置く理由
 * 以前はホーム（/portal）のリンク一覧が唯一の入口だったので、書類の一覧を
 * 開いたあと注文の進捗へ移るには**ブラウザの戻る**しかなかった。1 画面
 * ぶんの深さしかない面で戻るを強いるのは、道具として成立していない。
 *
 * ■ 幅で畳む（端末では決めない）
 * 広ければ横並び、狭ければハンバーガー → Drawer。判定は `useIsMobile()` では
 * なく **CSS の `visibleFrom` / `hiddenFrom`** で行う —— ここはレイアウトの
 * 骨で、サーバーとクライアントで DOM が食い違うと最初の描画で行き先が消える
 * （design.md §1.7 の「DOM 構造が変わってはいけない場所は CSS で」）。
 *
 * ■ リンク限定セッションには行き先を出さない
 * `/portal/d/<token>` から入った人が見てよいのは**その書類 1 件だけ**で、
 * 一覧も進捗も持たない（lib/portal-progress.ts / portal-documents.ts が
 * 空を返す）。空の画面へ誘う導線を置かないため、`nav={false}` で消す。
 */

import {
  AppShell,
  Burger,
  Container,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconFileDescription,
  IconForms,
  IconHome,
  IconProgress,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PortalLogoutButton } from "@/components/portal/PortalLogoutButton";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof IconHome;
}

const NAV: NavItem[] = [
  { href: "/portal", labelKey: "shell.home", icon: IconHome },
  {
    href: "/portal/documents",
    labelKey: "portal.documents.document",
    icon: IconFileDescription,
  },
  {
    href: "/portal/orders",
    labelKey: "common.orderProgress",
    icon: IconProgress,
  },
  { href: "/portal/forms", labelKey: "common.forms", icon: IconForms },
];

/** ホームだけは完全一致（`/portal` は全ページの接頭辞なので前方一致だと常に当たる）。 */
function isActive(pathname: string, href: string): boolean {
  return href === "/portal" ? pathname === href : pathname.startsWith(href);
}

export function PortalShell({
  children,
  nav = false,
}: {
  children: ReactNode;
  /** 行き先とログアウトを出すか（= 通常ログインのセッションがあるか）。 */
  nav?: boolean;
}) {
  const tr = useTranslations();
  const pathname = usePathname() ?? "";
  const [opened, { toggle, close }] = useDisclosure(false);

  const links = NAV.map((item) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <UnstyledButton
        component={Link}
        href={item.href}
        key={item.href}
        onClick={close}
        // 画面幅で見た目を変えるので、色と太さだけを状態で切り替える。
        style={{
          borderRadius: "var(--mantine-radius-sm)",
          color: active
            ? "var(--mantine-color-blue-filled)"
            : "var(--mantine-color-text)",
        }}
      >
        <Group gap={6} px="xs" py={6} wrap="nowrap">
          <Icon size={16} />
          <Text fw={active ? 600 : 400} size="sm">
            {tr(item.labelKey)}
          </Text>
        </Group>
      </UnstyledButton>
    );
  });

  return (
    <AppShell footer={{ height: 40 }} header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group gap="sm" h="100%" justify="space-between" px="md" wrap="nowrap">
          <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
            {nav ? (
              <Burger
                aria-label={tr("portal.nav.menu")}
                hiddenFrom="sm"
                onClick={toggle}
                opened={opened}
                size="sm"
              />
            ) : null}
            <Text fw={600} size="sm" truncate>
              {tr("portal.portalShell.cKKPartnerPortal")}
            </Text>
          </Group>

          {nav ? (
            <Group gap={4} visibleFrom="sm" wrap="nowrap">
              {links}
              <PortalLogoutButton compact />
            </Group>
          ) : null}
        </Group>
      </AppShell.Header>

      {nav ? (
        <Drawer
          hiddenFrom="sm"
          onClose={close}
          opened={opened}
          padding="md"
          size="80%"
          title={tr("portal.nav.menu")}
        >
          <Stack gap={4}>
            {links}
            <Divider my="xs" />
            <PortalLogoutButton />
          </Stack>
        </Drawer>
      ) : null}

      <AppShell.Main>
        <Container px={0} size="md">
          {children}
        </Container>
      </AppShell.Main>

      <AppShell.Footer>
        <Group gap="lg" h="100%" justify="center" px="md">
          <Text c="dimmed" size="xs">
            {tr("portal.portalShell.chuetsuToolWorks")}
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
