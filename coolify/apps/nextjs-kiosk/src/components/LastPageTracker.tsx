"use client";

/**
 * LastPageTracker — ページ遷移ごとにアクティブユーザーの「最後に開いたページ」を
 * localStorage に記録する（lib/last-page.ts）。/login 表示で追跡を止め、
 * 次のログイン成功（beginUserPageTracking）まで保存しない。UI は描画しない。
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { stopUserPageTracking, trackPage } from "@/lib/last-page";

export function LastPageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) {
      stopUserPageTracking();
    } else {
      trackPage(pathname);
    }
  }, [pathname]);
  return null;
}
