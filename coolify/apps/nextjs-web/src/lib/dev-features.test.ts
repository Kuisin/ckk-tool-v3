/**
 * dev-features.test.ts — JSON とコードの契約を固定する。
 *
 * このゲートは未認証の外部向け面を閉じる唯一の口なので、
 * 「JSON を直して TS を直し忘れた」「app-list に無いキーを書いた」を CI で止める。
 */

import { describe, expect, it } from "vitest";
import devFeaturesJson from "../config/dev-features.json";
import { appList } from "./app-list";
import {
  type DevFeatureKey,
  devFeature,
  devFeatureKeys,
  hiddenDevFeatureAppKeys,
  isDevFeatureEnabled,
} from "./dev-features";

/** DevFeatureKey union の実体（JSON のキー集合と一致していること）。 */
const DECLARED_KEYS: DevFeatureKey[] = ["portal", "display"];

describe("dev-features.json", () => {
  it("JSON のキーと DevFeatureKey の union が一致する", () => {
    expect(devFeatureKeys()).toEqual([...DECLARED_KEYS].sort());
  });

  it("全エントリが検証を通る（形が違うものは捨てられる）", () => {
    // parse() は形の違う行を黙って落とすので、素の JSON と取り込み後の
    // 件数が一致しない = どこかが検証に落ちている。
    expect(devFeatureKeys().length).toBe(Object.keys(devFeaturesJson).length);
  });

  it("appKeys は app-list に実在するか、未登録として明示されている", () => {
    // 機能は複数 PR に分けて着地するので、アプリ登録より先に appKeys を宣言する
    // 期間がある。その間の打ち間違いを黙って通さないため、未登録のキーは
    // **ここに書き出すことを強制する**（app-list と合わせて 2 箇所に書く必要が
    // 出るので、typo なら必ず片方が浮く）。アプリを登録したら消すこと。
    const PENDING_APP_KEYS = new Set<string>();

    const known = new Set(appList.map((a) => a.key));
    for (const key of devFeatureKeys()) {
      const feature = devFeature(key);
      expect(feature).not.toBeNull();
      for (const appKey of feature?.appKeys ?? []) {
        expect(
          known.has(appKey) || PENDING_APP_KEYS.has(appKey),
          `${key}: appKey "${appKey}" が app-list にも PENDING_APP_KEYS にも無い`,
        ).toBe(true);
      }
    }

    // 登録済みになったキーが PENDING に残り続けないようにする。
    for (const appKey of PENDING_APP_KEYS) {
      expect(
        known.has(appKey),
        `appKey "${appKey}" は app-list に登録済み。PENDING_APP_KEYS から消すこと`,
      ).toBe(false);
    }
  });

  it("同じ appKey を 2 つの機能が持たない", () => {
    const seen = new Map<string, string>();
    for (const key of devFeatureKeys()) {
      for (const appKey of devFeature(key)?.appKeys ?? []) {
        expect(
          seen.has(appKey),
          `appKey "${appKey}" が ${seen.get(appKey)} と ${key} で重複`,
        ).toBe(false);
        seen.set(appKey, key);
      }
    }
  });
});

describe("isDevFeatureEnabled", () => {
  it("portal は dev でだけ有効", () => {
    expect(isDevFeatureEnabled("portal", "dev")).toBe(true);
    expect(isDevFeatureEnabled("portal", "main")).toBe(false);
  });

  it("未知のキーは false（fail-closed）", () => {
    expect(isDevFeatureEnabled("no-such-feature" as DevFeatureKey, "dev")).toBe(
      false,
    );
  });
});

describe("hiddenDevFeatureAppKeys", () => {
  it("有効な環境では何も隠さない", () => {
    expect(hiddenDevFeatureAppKeys("dev")).not.toContain("portal-admin");
  });

  it("無効な環境ではその機能のアプリを隠す", () => {
    expect(hiddenDevFeatureAppKeys("main")).toContain("portal-admin");
  });
});
