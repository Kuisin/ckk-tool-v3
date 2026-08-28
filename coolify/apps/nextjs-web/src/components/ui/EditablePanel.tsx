"use client";

/**
 * EditablePanel — タブやセクションを「既定は閲覧、押して編集」にする枠。
 *
 * 詳細画面のタブに編集フォームを直接置くと、**読みに来ただけの人にも常に
 * 編集画面が開いている**ことになり、いま何が設定されているのかが読み取り
 * にくい（フォームの 承認 / 共有 タブが実際そうなっていた）。閲覧の形を
 * 別に用意して、編集は明示的に始める。
 *
 * 約束ごと:
 *   - 保存 / キャンセルの行は **編集側が持つ**（共有の FormActions をそのまま
 *     使えるように）。渡した `close` を onCancel と保存成功後に呼んでもらう。
 *   - 閉じるときに編集側を**アンマウントする**。ShareGrantsPanel や
 *     ApprovalFlowEditor は props からドラフトを useState で作るので、
 *     アンマウントするだけで「キャンセル＝サーバの値へ戻す」が手に入る。
 *   - `canEdit=false` なら編集ボタンごと出さない（押せないボタンを置かない）。
 *
 * モバイルでは見出しと編集ボタンを縦に積み、ボタンを全幅にする
 * （design.md §20.2 — 横に並べたままだと見出しが数十 px まで潰れる）。
 */

import { Group, Stack, Text } from "@mantine/core";
import { type ReactNode, useState } from "react";
import { EditButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";

export function EditablePanel({
  canEdit,
  view,
  edit,
  editLabel = "編集",
  title,
  description,
}: {
  canEdit: boolean;
  /** 閲覧モードの中身。 */
  view: ReactNode;
  /** 編集モードの中身。`close()` で閲覧へ戻す（保存成功時とキャンセル時）。 */
  edit: (helpers: { close: () => void }) => ReactNode;
  editLabel?: string;
  title?: ReactNode;
  /** 見出しの下に置く補足。編集中も出したままにする。 */
  description?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const close = () => setEditing(false);

  const header =
    title || (canEdit && !editing) ? (
      <Group
        align={isMobile ? "stretch" : "center"}
        justify="space-between"
        wrap={isMobile ? "wrap" : "nowrap"}
      >
        {title ? (
          <Text fw={600} size="sm">
            {title}
          </Text>
        ) : (
          <span />
        )}
        {canEdit && !editing && (
          <EditButton fullWidth={isMobile} onClick={() => setEditing(true)}>
            {editLabel}
          </EditButton>
        )}
      </Group>
    ) : null;

  return (
    <Stack gap="md">
      {header}
      {description}
      {editing ? edit({ close }) : view}
    </Stack>
  );
}
