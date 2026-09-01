"use client";

/**
 * TemplatePicker — 「どの画面を映すか」を**見て**選ぶ。
 *
 * 名前だけの選択肢（「生産状況」「未処理・手配待ち」…）では、選ぶ人には
 * 何が映るのか分からない。壁のテレビは選んだ結果を確かめに行くのが面倒
 * （脚立が要ることもある）なので、選ぶ場で見えている必要がある。
 *
 * 見本は**実物のページを縮小して埋め込む**（キオスク側の
 * /display/preview/<key>）。画像を用意しないのは、画面を直したときに絵だけ
 * 古くなるのを避けるため — 見本はいつでも現物と一致する。中身は
 * display-sample.ts の作り話なので、業務データは 1 件も出ない。
 *
 * 縮小は transform: scale。iframe の中は 1280×720 で組んでから縮めるので、
 * 「幅が狭いときの見た目」ではなく**テレビでの見た目**が出る。
 * （CSS zoom だと中の viewport 幅ごと変わるため、ここでは使えない。）
 *
 * キオスクの URL が分からない環境では見本を出さず、名前と説明だけにする
 * （選べなくなるほうが困る）。
 */

import {
  Box,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { DISPLAY_TEMPLATES } from "@/lib/display-templates";
import { kioskOrigin } from "@/lib/kiosk-origin";

/** 見本を組む論理サイズ。テレビの見た目に寄せるため 16:9 の広い幅で描く。 */
const FRAME_W = 1280;
const FRAME_H = 720;

type Props = {
  value: string;
  onChange: (templateKey: string) => void;
};

export function TemplatePicker({ value, onChange }: Props) {
  const origin = kioskOrigin();

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
      {DISPLAY_TEMPLATES.map((t) => {
        const selected = t.key === value;
        return (
          <UnstyledButton key={t.key} onClick={() => onChange(t.key)}>
            <Paper
              p="xs"
              radius="md"
              style={{
                borderColor: selected
                  ? "var(--mantine-color-blue-filled)"
                  : undefined,
                borderWidth: selected ? 2 : 1,
                height: "100%",
              }}
              withBorder
            >
              <Stack gap="xs">
                <Thumbnail
                  label={t.label}
                  origin={origin}
                  templateKey={t.key}
                />
                <Stack gap={2}>
                  <Text fw={selected ? 700 : 500} size="sm">
                    {t.label}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {t.description}
                  </Text>
                </Stack>
              </Stack>
            </Paper>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

/**
 * 実物のページを縮小して 1 枚に収める。
 *
 * `loading="lazy"` と `pointer-events: none` が要る — 前者は見えていない
 * カードのページまで取りに行かないため、後者はカードを押したつもりが
 * iframe に吸われるのを防ぐため。
 */
function Thumbnail({
  origin,
  templateKey,
  label,
}: {
  origin: string | null;
  templateKey: string;
  label: string;
}) {
  return (
    <Box
      bg="var(--mantine-color-default-hover)"
      style={{
        aspectRatio: "16 / 9",
        borderRadius: "var(--mantine-radius-sm)",
        containerType: "inline-size",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {origin ? (
        <iframe
          loading="lazy"
          // 見本ページは静的・認証なし・業務データなし（display-sample.ts）
          sandbox="allow-scripts"
          src={`${origin}/display/preview/${templateKey}`}
          style={{
            border: 0,
            height: FRAME_H,
            left: 0,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            transform: `scale(calc(100cqw / ${FRAME_W}))`,
            transformOrigin: "top left",
            width: FRAME_W,
          }}
          title={`${label}の見本`}
        />
      ) : (
        <Text c="dimmed" p="sm" size="xs">
          見本を表示できません（キオスクの URL が未設定）
        </Text>
      )}
    </Box>
  );
}
