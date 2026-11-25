/**
 * 仕組みそのものの確認 — PDF を実際に描けること・共有端末にログインできること・
 * DB を引けること。機能の確認ではないので短い。ここが落ちたら、他のシナリオの
 * 失敗は機能ではなく環境（Gotenberg / 共有端末のビルド / ひな形の DB）を疑う。
 */

import { docNumber } from "../doc-number";
import type { Scenario } from "./types";

export const frameworkSmoke: Scenario = {
  id: "framework-smoke",
  title: "仕組みの確認 — PDF・共有端末・DB",
  feature: "仕組み",
  user: "admin",
  kiosk: true,
  pdf: true,
  steps: [
    {
      caption: "旧番号の URL で見積書を開く — 新しい番号の URL へ送られる",
      run: async (s) => {
        await s.goto("/sales/quotes/QOT-202607-00001");
        await s.see(docNumber("QOT"));
        s.check("URL が 法人コード~番号 になる", /\/sales\/quotes\/CKK(~|%7E)QOT-\d{4}-\d{5}/.test(s.page.url()), s.page.url());
        const legacy = s.sql("select legacy_number from app.quotes where doc_number = 'QOT-2026-00001'");
        s.check("DB を引ける（旧番号が残っている）", legacy === "QOT-202607-00001", legacy);
      },
    },
    {
      caption: "見積書の PDF を描く",
      run: async (s) => {
        const id = decodeURIComponent(new URL(s.page.url()).pathname.split("/").pop() ?? "");
        const text = await s.pdf("見積書", `/api/pdf/quote?id=${encodeURIComponent(id)}&force=1`);
        s.check("PDF に見積番号が載る", /QOT-\d{4}-\d{5}/.test(text), text.slice(0, 200).replace(/\s+/g, " "));
      },
    },
    {
      caption: "共有端末にログインしてアプリ一覧を開く",
      run: async (s) => {
        const kiosk = await s.openKiosk("/");
        await s.shot("共有端末のホーム", kiosk);
        s.check("ログイン画面に戻されていない", !new URL(kiosk.url()).pathname.startsWith("/login"), kiosk.url());
        await kiosk.close();
      },
    },
  ],
};
