"use client";

/**
 * DocumentLinkModal — リッチテキストに「文書リンク」を挿入するピッカー。
 *
 * 種別（見積書 / 指示書 …）を選び、文書番号で絞り込んで選択すると、
 * 詳細ページへの**アプリ内パス**を返す。外部 URL と違い短縮リンクは挟まない
 * （アプリ内遷移なので確認ページを通す必要がない）。
 *
 * 検索は Server Action（document-link-actions）。読めない種別は候補が空になる。
 */

import {
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState, useTransition } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
import { searchDocuments } from "./document-link-actions";
import {
  DOCUMENT_LINK_TYPES,
  type DocumentHit,
  type DocumentLinkType,
} from "./document-link-types";

export function DocumentLinkModal({
  opened,
  onClose,
  onSelect,
}: {
  opened: boolean;
  onClose: () => void;
  /** 選択された文書のパスと既定のリンク文字列。 */
  onSelect: (hit: DocumentHit) => void;
}) {
  const tr = useTr();
  const [type, setType] = useState<DocumentLinkType>("quote");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DocumentHit[]>([]);
  const [pending, start] = useTransition();

  // 種別変更・入力のたびに検索（250ms デバウンス）。
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => {
      start(async () => setHits(await searchDocuments(type, query)));
    }, 250);
    return () => clearTimeout(timer);
  }, [opened, type, query]);

  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={opened}
      title={tr("文書リンクを挿入")}
    >
      <Stack gap="sm">
        <Select
          data={DOCUMENT_LINK_TYPES.map((t) => ({ ...t }))}
          label={tr("文書種別")}
          onChange={(v) => v && setType(v as DocumentLinkType)}
          value={type}
        />
        <TextInput
          label={tr("文書番号")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={tr("番号の一部（数字だけでも可）")}
          rightSection={pending ? <Loader size="xs" /> : null}
          value={query}
        />

        <ScrollArea.Autosize mah={320}>
          {hits.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={20} />}
              message={pending ? "検索中…" : tr("該当する文書がありません")}
            />
          ) : (
            <Stack gap={0}>
              {hits.map((hit) => (
                <UnstyledButton
                  key={hit.href}
                  onClick={() => {
                    onSelect(hit);
                    onClose();
                  }}
                  p="xs"
                  style={{ borderRadius: "var(--mantine-radius-sm)" }}
                >
                  <Text ff="mono" fw={600} size="sm">
                    {hit.number}
                  </Text>
                  {hit.detail && (
                    <Text c="dimmed" size="xs" truncate>
                      {hit.detail}
                    </Text>
                  )}
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Stack>
    </ModalShell>
  );
}
