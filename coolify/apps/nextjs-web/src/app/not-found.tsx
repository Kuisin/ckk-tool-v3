import { Box } from "@mantine/core";
import { NotFoundContent } from "@/components/ui/NotFoundContent";

/**
 * ルートレベルの 404 フォールバック（ダッシュボード外 — 通常は
 * (dashboard)/[...not-found] が先に受けるため保険）。
 */
export default function RootNotFound() {
  return (
    <Box mih="100vh">
      <NotFoundContent />
    </Box>
  );
}
