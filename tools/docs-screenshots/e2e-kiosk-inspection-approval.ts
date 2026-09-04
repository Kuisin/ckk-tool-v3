/**
 * e2e-kiosk-inspection-approval.ts — 共有端末（nextjs-kiosk）の検査承認を、
 * 一時 DB + 本番ビルドに対して実際に触って確かめる。
 *
 * **共有端末は web の縮小版ではない**ので、見ているのは業務ルールだけでなく
 * 「現場のタブレットとして成立しているか」:
 *   - その工程の仕事（承認）が、完了ボタンより**上**にあること
 *   - 承認待ちの件数が最初に出ること
 *   - 押す的が十分大きいこと（手袋・腕の長さ）
 *   - 済み・対象外が既定で畳まれていること（やることだけを出す）
 *   - **検査表の中身を見てから**承認できること
 *   - 検査承認の工程では数量を聞かれないこと
 *
 * 使い方（README「通し確認」と同じ前提）:
 *   1. pnpm docs:seed
 *   2. docker exec -i ckk-shots-db psql -U postgres -d ckk -f - < e2e-kiosk-fixtures.sql
 *   3. nextjs-kiosk を本番ビルドして :3101 で起動
 *   4. pnpm exec tsx e2e-kiosk-inspection-approval.ts
 */
import { chromium, type Page } from "@playwright/test";

const KIOSK = "http://localhost:3101";
const STEP = "dc011000-0000-4000-8000-000000000006";
let fails = 0;
function check(n: string, ok: boolean, d = "") {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
}
async function login(page: Page) {
  const a = await page.request.post(`${KIOSK}/api/qr/access`, {
    data: { cardId: "SHT1234567890ABC" },
  });
  const { ticket } = (await a.json()) as { ticket: string };
  await page.request.post(`${KIOSK}/api/kiosk/pin`, {
    data: { ticket, purpose: "PIN_VERIFY", pin: "4321" },
  });
}
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });
  await ctx.addCookies([
    {
      name: "kiosk_device",
      value: "ckk-shot-device-token-fixed-0001",
      url: KIOSK,
    },
  ]);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("Geolocation"))
      errs.push(t.slice(0, 160));
  });
  await p.goto(`${KIOSK}/login`, { waitUntil: "networkidle" });
  await login(p);
  await p.goto(`${KIOSK}/steps/${STEP}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);

  // 1. 仕事が完了ボタンより上に来ているか（Y 座標で見る）
  const yApproval = await p.getByText("検査承認").first().boundingBox();
  const yComplete = await p
    .getByRole("button", { name: "工程完了" })
    .boundingBox();
  check(
    "仕事が完了ボタンより上にある",
    !!yApproval && !!yComplete && yApproval.y < yComplete.y,
    `承認 y=${Math.round(yApproval?.y ?? -1)} 完了 y=${Math.round(yComplete?.y ?? -1)}`,
  );

  // 2. 承認待ちの件数が出る
  check("承認待ち件数が出る", (await p.getByText("承認待ち 1 件").count()) > 0);

  // 3. 押せる的の大きさ（現場は手袋。44px 以上が最低線）
  const btn = await p.getByRole("button", { name: "承認する" }).boundingBox();
  check(
    "承認ボタンが十分大きい",
    !!btn && btn.height >= 56,
    `h=${Math.round(btn?.height ?? 0)} w=${Math.round(btn?.width ?? 0)}`,
  );

  // 4. 承認済み・対象外は畳まれている
  check(
    "済み・対象外は既定で畳まれている",
    (await p.getByText("承認済み・対象外（2 件）").isVisible()) &&
      !(await p.getByText("不合格のため承認できません").first().isVisible()),
  );

  // 検査表を見てから承認できる（承認は「見てから押す」もの）
  await p.getByRole("button", { name: "検査表を見る" }).first().click();
  await p.waitForTimeout(900);
  const sheet = await p.locator("body").innerText();
  check(
    "検査表の中身が読める",
    sheet.includes("実測値") && /6\.01/.test(sheet),
    sheet.includes("実測値") ? "値が出ていない" : "見出しが出ていない",
  );
  await p.screenshot({ path: "/tmp/k-sheet.png", fullPage: true });
  check(
    "検査表からそのまま承認できる",
    (await p.getByRole("button", { name: "承認する" }).count()) > 0,
  );
  await p.getByRole("button", { name: "閉じる" }).click();
  await p.waitForTimeout(600);

  // 数量を聞かれない（検査承認は数量を持たない工程）
  check("数量を聞かれない", (await p.getByText("受入数").count()) === 0);

  // 5. 実際に承認する
  await p.getByRole("button", { name: "承認する" }).click();
  await p.waitForTimeout(2500);
  check(
    "承認するとすべて承認しましたになる",
    (await p.getByText("すべて承認しました").count()) > 0,
    (await p.locator("body").innerText()).includes("承認待ち")
      ? "まだ承認待ちが出ている"
      : "",
  );
  check(
    "承認後は押すものが無い",
    (await p.getByRole("button", { name: "承認する" }).count()) === 0,
  );

  // 6. 畳んだ側を開ける
  await p.getByRole("button", { name: /承認済み・対象外/ }).click();
  await p.waitForTimeout(600);
  check(
    "開くと済み・対象外が読める",
    (await p.getByText("不合格のため承認できません").count()) > 0,
  );
  await p.screenshot({ path: "/tmp/k-approved.png", fullPage: true });

  // 7. 完了ボタンまで届くか（内側スクロール）
  const sc = await p.evaluate(() => {
    const els = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const s = els.find(
      (e) => e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 300,
    );
    return s
      ? { tag: s.tagName, scrollH: s.scrollHeight, clientH: s.clientHeight }
      : null;
  });
  console.log("scroll container:", JSON.stringify(sc));
  await p.getByRole("button", { name: "工程完了" }).scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  check(
    "完了ボタンまでスクロールできる",
    await p.getByRole("button", { name: "工程完了" }).isVisible(),
  );

  check("画面エラー無し", errs.length === 0, errs.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails === 0 ? "\nall passed" : `\n${fails} failed`);
  process.exit(fails ? 1 : 0);
}
main();
