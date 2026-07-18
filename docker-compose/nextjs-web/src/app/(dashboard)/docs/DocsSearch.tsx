"use client";

/**
 * DocsSearch — マニュアルの全文検索（Spotlight 風モーダル）。
 *
 * サイドバー／モバイルバー上部の検索ボタンから開く。Ctrl/⌘+K でも開く。
 * 入力はデバウンスしてサーバーアクション（searchDocsAction）に投げ、結果を
 * キーボード操作（↑↓/Enter）付きで表示する。依存追加なし。
 */

import {
  Box,
  Divider,
  Group,
  Highlight,
  Kbd,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure, useHotkeys } from "@mantine/hooks";
import {
  IconCornerDownLeft,
  IconFileText,
  IconSearch,
} from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DocSearchResult } from "@/lib/docs-search";
import { type DocLang, isDocLang } from "@/lib/docs-tree";
import { searchDocsAction } from "./actions";
import styles from "./docs.module.css";

const T: Record<
  DocLang,
  { placeholder: string; button: string; hint: string; empty: string }
> = {
  ja: {
    placeholder: "マニュアルを検索…",
    button: "検索",
    hint: "キーワードを入力してください",
    empty: "見つかりませんでした",
  },
  en: {
    placeholder: "Search manuals…",
    button: "Search",
    hint: "Type a keyword to search",
    empty: "No results",
  },
  zh: {
    placeholder: "搜索手册…",
    button: "搜索",
    hint: "输入关键字进行搜索",
    empty: "未找到结果",
  },
};

export function DocsSearch({ full = false }: { full?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const lang: DocLang = isDocLang(params.get("lang") ?? undefined)
    ? (params.get("lang") as DocLang)
    : "ja";
  const t = T[lang];

  const [opened, { open, close }] = useDisclosure(false);
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 200);
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useHotkeys([["mod+K", () => open()]]);

  // デバウンス後に検索（競合する古い結果は破棄）。
  useEffect(() => {
    if (!opened) return;
    const q = debounced.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    searchDocsAction(q, lang)
      .then((r) => {
        if (!alive) return;
        setResults(r);
        setActive(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debounced, lang, opened]);

  // 開くたびにリセット。
  useEffect(() => {
    if (opened) {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }, [opened]);

  const go = (r: DocSearchResult) => {
    close();
    router.push(`/docs/${r.slug}?lang=${lang}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // IME 変換中（日本語/中国語などの確定 Enter）は操作しない。
    // isComposing = 変換中、keyCode 229 = 変換確定キー（後方互換）。
    if (
      (e.nativeEvent as { isComposing?: boolean }).isComposing ||
      e.keyCode === 229
    ) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  // 選択中の項目を可視領域へ。
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const q = debounced.trim();

  return (
    <>
      <UnstyledButton
        aria-label={t.placeholder}
        className={styles.searchTrigger}
        data-full={full || undefined}
        onClick={open}
      >
        <IconSearch size={15} stroke={1.8} />
        <Text c="dimmed" size="sm" style={{ flex: 1 }} truncate>
          {t.placeholder}
        </Text>
        <Kbd size="xs">⌘K</Kbd>
      </UnstyledButton>

      <Modal
        classNames={{ body: styles.searchBody, content: styles.searchModal }}
        onClose={close}
        opened={opened}
        padding={0}
        radius="md"
        size="lg"
        transitionProps={{ transition: "pop", duration: 160 }}
        withCloseButton={false}
      >
        <TextInput
          autoFocus
          leftSection={
            loading ? (
              <Loader size="xs" />
            ) : (
              <IconSearch size={18} stroke={1.8} />
            )
          }
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={t.placeholder}
          size="md"
          styles={{ input: { border: "none" } }}
          value={query}
          variant="unstyled"
        />
        <Divider />
        <Box className={styles.searchResults} ref={listRef}>
          {results.length === 0 ? (
            <Group c="dimmed" gap="xs" justify="center" py="lg">
              <Text size="sm">
                {q.length < 2 ? t.hint : loading ? "…" : t.empty}
              </Text>
            </Group>
          ) : (
            <Stack gap={2} p={6}>
              {results.map((r, i) => (
                <UnstyledButton
                  className={styles.searchItem}
                  data-active={i === active || undefined}
                  data-idx={i}
                  key={`${r.slug}-${r.lang}`}
                  onClick={() => go(r)}
                  onMouseMove={() => setActive(i)}
                >
                  <Group align="flex-start" gap="sm" wrap="nowrap">
                    <IconFileText
                      size={18}
                      stroke={1.6}
                      style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }}
                    />
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Highlight fw={600} highlight={q} size="sm">
                        {r.title}
                      </Highlight>
                      <Highlight
                        c="dimmed"
                        highlight={q}
                        lineClamp={1}
                        size="xs"
                      >
                        {r.snippet}
                      </Highlight>
                    </Box>
                    {i === active && (
                      <IconCornerDownLeft
                        size={14}
                        style={{ opacity: 0.5, flexShrink: 0, marginTop: 3 }}
                      />
                    )}
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </Box>
      </Modal>
    </>
  );
}
