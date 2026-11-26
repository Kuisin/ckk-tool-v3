"use client";

/**
 * DocCompanyProvider — 「発行会社」バッジの判定材料を画面へ配る。
 *
 * 値はダッシュボードのレイアウト（サーバー）が lib/doc-company.ts
 * viewerCompanyContext で 1 回だけ作る。一覧・詳細は 1 画面ずつ引かない
 * （15 種類の書類の一覧と詳細が同じ値を見る）。プロバイダの外（取引先ポータル・
 * 公開マニュアル）では null で、バッジは出ない。
 */

import { createContext, type ReactNode, useContext } from "react";
import type { DocCompanyViewer } from "@/lib/doc-company-view-core";

const DocCompanyContext = createContext<DocCompanyViewer | null>(null);

export function DocCompanyProvider({
  viewer,
  children,
}: {
  viewer: DocCompanyViewer;
  children: ReactNode;
}) {
  return (
    <DocCompanyContext.Provider value={viewer}>
      {children}
    </DocCompanyContext.Provider>
  );
}

export function useDocCompanyViewer(): DocCompanyViewer | null {
  return useContext(DocCompanyContext);
}
