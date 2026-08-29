/**
 * notifications-core.test.ts — 通知リンクの不変条件。
 *
 * ここが守るもの:
 *  - **外部サイトへ飛ばせない**こと。通知の遷移先はメール・端末通知にそのまま
 *    載るので、ここが緩むとオープンリダイレクトの踏み台になる。
 *  - メール・端末通知のリンク先が常に中継 URL（/notifications/<id>/open）で
 *    あること。直接リンクへ戻すと、そこから開いた通知がアプリ内で未読のまま残る。
 *  - 対象ページが無い通知に**メールのボタンを出さない**こと（押す先が通知一覧
 *    しか無い）。端末通知は逆に必ず開き先を持つこと。
 *  - 中継 URL の id は必ず形を検査してから DB に渡すこと（uuid 列に素の
 *    文字列を投げると例外になる）。
 */

import { describe, expect, it } from "vitest";
import {
  externalNotificationLinks,
  isNotificationId,
  notificationOpenPath,
  sanitizeLinkPath,
} from "./notifications-core";

const UUID = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

describe("sanitizeLinkPath", () => {
  it("アプリ内パスはクエリごと通す", () => {
    expect(sanitizeLinkPath("/sales/quotes/abc")).toBe("/sales/quotes/abc");
    expect(sanitizeLinkPath("/notifications?unread=1")).toBe(
      "/notifications?unread=1",
    );
  });

  it("外部・プロトコル相対・バックスラッシュは弾く", () => {
    expect(sanitizeLinkPath("https://evil.example/x")).toBeUndefined();
    expect(sanitizeLinkPath("//evil.example/x")).toBeUndefined();
    expect(sanitizeLinkPath("/\\evil.example")).toBeUndefined();
    expect(sanitizeLinkPath("sales/quotes")).toBeUndefined();
    expect(sanitizeLinkPath(undefined)).toBeUndefined();
  });
});

describe("isNotificationId", () => {
  it("uuid だけを受ける", () => {
    expect(isNotificationId(UUID)).toBe(true);
    expect(isNotificationId(UUID.toUpperCase())).toBe(true);
  });

  it("uuid でないものは受けない", () => {
    expect(isNotificationId("")).toBe(false);
    expect(isNotificationId("../../etc/passwd")).toBe(false);
    expect(isNotificationId(`${UUID}x`)).toBe(false);
  });
});

describe("notificationOpenPath", () => {
  it("中継 URL を返す（対象ページを直接指さない）", () => {
    expect(notificationOpenPath(UUID)).toBe(`/notifications/${UUID}/open`);
  });

  it("中継 URL 自身がアプリ内パスとして通ること", () => {
    expect(sanitizeLinkPath(notificationOpenPath(UUID))).toBe(
      notificationOpenPath(UUID),
    );
  });

  it("id をパスに埋める前にエンコードする", () => {
    expect(notificationOpenPath("a/b")).toBe("/notifications/a%2Fb/open");
  });
});

describe("externalNotificationLinks", () => {
  const RELAY = `/notifications/${UUID}/open`;

  it("対象ページがある通知は両チャネルとも中継 URL を指す", () => {
    expect(
      externalNotificationLinks({
        notificationId: UUID,
        linkPath: "/production/work-orders/1",
      }),
    ).toEqual({ mail: RELAY, push: RELAY });
  });

  it("対象ページが無い通知はメールにリンクを出さず、端末通知は通知一覧へ", () => {
    expect(
      externalNotificationLinks({ notificationId: UUID, linkPath: null }),
    ).toEqual({ mail: null, push: RELAY });
  });

  it("id が無いときは従来の直リンクに落ちる", () => {
    expect(
      externalNotificationLinks({ linkPath: "/billing/invoices" }),
    ).toEqual({ mail: "/billing/invoices", push: "/billing/invoices" });
    expect(externalNotificationLinks({})).toEqual({
      mail: null,
      push: "/notifications",
    });
  });
});
