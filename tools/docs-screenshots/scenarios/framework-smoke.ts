/**
 * 仕組みそのものの確認 — PDF を実際に描けること・共有端末にログインできること・
 * DB を引けること。機能の確認ではないので短い。ここが落ちたら、他のシナリオの
 * 失敗は機能ではなく環境（Gotenberg / 共有端末のビルド / ひな形の DB）を疑う。
 */

import { docNumber } from "../doc-number";
import type { Scenario } from "./types";

const STEP_9001_CENTERLESS = "dc011000-0000-4000-8000-000000000003"; // #9001 センタレス（外注）

/** JST の今日から見た来月の N 日（YYYY/MM/DD）。 */
function nextMonth(day: number): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day)).toISOString().slice(0, 10).replaceAll("-", "/");
}

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
      caption: "日付を 2 つ続けて選ぶ（pickDate）— 2 つ目も押した欄のカレンダーで選ばれる",
      run: async (s) => {
        // 直前の欄の吹き出しが閉じる途中だと、2 つ目の月送り・日付が前の吹き出しに
        // 当たって 1 か月ずれていた。空の欄 2 つで確かめる（保存はしない）。
        s.sqlExec(`update app.work_order_steps set outsource_expected_at = null, outsource_received_at = null where id = '${STEP_9001_CENTERLESS}'`);
        await s.goto(`/production/work-orders/9001/steps/${STEP_9001_CENTERLESS}`);
        await s.see("外注日程");
        const expected = s.page.getByRole("button", { name: /^入荷予定日/ });
        const received = s.page.getByRole("button", { name: /^入荷日/ });
        await s.pickDate(expected, { nextMonthDay: 10 });
        await s.pickDate(received, { nextMonthDay: 20 });
        const got = [(await expected.innerText()).trim(), (await received.innerText()).trim()];
        const want = [nextMonth(10), nextMonth(20)];
        s.check("2 つとも「来月の N 日」になる（2 つ目が月ずれしない）", got.join(",") === want.join(","), { got, want });
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
