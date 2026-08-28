import { Group, Paper, Skeleton, Stack } from "@mantine/core";

/**
 * ダッシュボード配下の共通ローディング。
 *
 * **これが無いと、遷移中はずっと前の画面のまま**になる。配下は全ページ
 * `force-dynamic` なので、サーバー処理が終わるまで React は何も差し替えない
 * — 利用者から見ると「押しても何も起きない → しばらくして画面が丸ごと入れ
 * 替わる」で、押せていないのかどうか判断できない。
 *
 * Suspense の境界をここに置くと、レイアウト（ヘッダー・フッター・各
 * Provider）は**そのまま残り**、本文だけが即座に骨組みへ変わる。
 * 全体が描き直されるわけではないので、ヘッダーの状態も失われない。
 *
 * 骨組みは一覧・詳細・フォームのどれでも大きく外れない形にしてある
 * （見出し → 本文の塊）。画面ごとに合わせたいときは、その route に
 * `loading.tsx` を置けばこちらより優先される。
 */
export default function DashboardLoading() {
  return (
    <Stack gap="md">
      <Group align="flex-end" justify="space-between" wrap="nowrap">
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Skeleton height={12} radius="sm" width={180} />
          <Skeleton height={28} radius="sm" width={260} />
        </Stack>
        <Skeleton height={36} radius="sm" width={120} />
      </Group>
      <Paper p="sm" shadow="xs">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap">
            <Skeleton
              height={36}
              radius="sm"
              style={{ flex: 1, minWidth: 200 }}
            />
            <Skeleton height={36} radius="sm" width={160} />
            <Skeleton height={36} radius="sm" width={160} />
          </Group>
          {/* 行の骨組み。件数は「画面が埋まって見える」程度で充分。 */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton height={44} key={i} radius="sm" />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
