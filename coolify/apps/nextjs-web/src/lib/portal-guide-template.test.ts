/**
 * portal-guide-template.test.ts — ご利用案内テンプレートの差し込みを固定する。
 *
 * Gotenberg を起こさずに確かめられるのはここまで（HTML の組み立て）だが、
 * この紙で壊れると痛いのは版組ではなく**中身の取り違え**なので、そこを見る:
 *   - ご担当者が複数居るとき、各ページの文が**その人のもの**になっているか
 *     （ラベルはページごとに作る — 根に 1 つ置くと全ページが 1 人目の名前になる）
 *   - 差し込み漏れ（`{{…}}` が紙に出る）が無いか
 *   - QR の SVG が生で入り、利用者由来の文字列はエスケープされるか
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "./pdf";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "src", "pdf-templates", "portal-guide.html"),
  "utf8",
);

function page(name: string, email: string) {
  return {
    labels: {
      title: "取引先ポータル ご利用案内",
      onchu: "御中",
      attnSuffix: "様",
      personalStrip: `このご案内は ${name} さま専用です。`,
      howToTitle: "ご利用の手順",
      step1: "手順1",
      step2: "手順2",
      step3: "手順3",
      scopeTitle: "ご覧いただけるもの",
      urlLabel: "ポータルの URL",
      emailLabel: "ログインに使うアドレス",
      qrCaption: "読み取ってログイン",
      noticeTitle: "ご注意",
      noticeSecret: "注意1",
      noticeIdle: "注意2",
      noticeNoMail: "注意3",
      contactTitle: "お問い合わせ",
    },
    partner_name: "得意先A",
    contact_name: name,
    email,
    login_url: "https://app.example.jp/portal/login",
    qr: "<svg id='qr'><rect/></svg>",
    scope_html: "<li>自社宛の書類</li>",
    contact_html: "営業担当",
  };
}

function render(pages: ReturnType<typeof page>[]) {
  return renderTemplate(TEMPLATE, {
    lang: "ja",
    issuer: { name: "発行元", address: "住所", tel: "TEL" },
    labels: pages[0]?.labels,
    pages,
  });
}

describe("portal-guide.html", () => {
  const html = render([
    page("田中 太郎", "tanaka@example.co.jp"),
    page("鈴木 花子", "suzuki@example.co.jp"),
  ]);

  it("ご担当者の人数ぶんページを作る", () => {
    expect(html.match(/class="guide-page"/g)).toHaveLength(2);
  });

  it("各ページの文がその人のものになる（ラベルはページごと）", () => {
    expect(html).toContain("このご案内は 田中 太郎 さま専用です。");
    expect(html).toContain("このご案内は 鈴木 花子 さま専用です。");
    expect(html).toContain("tanaka@example.co.jp");
    expect(html).toContain("suzuki@example.co.jp");
  });

  it("差し込み漏れが残らない", () => {
    expect(html).not.toMatch(/\{\{/);
  });

  it("QR と組み立て済みの断片は生の HTML で入る", () => {
    expect(html).toContain("<svg id='qr'><rect/></svg>");
    expect(html).toContain("<li>自社宛の書類</li>");
  });

  it("利用者由来の文字列（取引先名・担当者名）はエスケープされる", () => {
    const evil = render([page('<img src=x onerror="x">', "a@example.jp")]);
    expect(evil).not.toContain("<img src=x");
    expect(evil).toContain("&lt;img src=x");
  });
});
