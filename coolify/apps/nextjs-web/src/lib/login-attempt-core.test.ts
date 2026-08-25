/**
 * login-attempt-core.test.ts — 認証イベントの語彙。
 *
 * ここが守るもの:
 *  - method / reason が DB の列長（VarChar(24) / VarChar(40)）に収まること。
 *    はみ出すと記録そのものが落ちる（= 失敗を残せない、という一番困る壊れ方）。
 *  - 未知の state を渡しても例外にならず "UNKNOWN" として**記録は残る**こと。
 *  - スキャン種別の判定が、カード QR と指示書 QR を取り違えないこと。
 */

import { describe, expect, it } from "vitest";
import {
  deviceFailureReason,
  kioskFailureReason,
  LOGIN_FAILURE_REASONS,
  LOGIN_METHODS,
  loginMethodLabel,
  loginReasonLabel,
  scanKindOf,
} from "./login-attempt-core";

describe("語彙が DB の列長に収まる", () => {
  it("method は VarChar(24) 以内", () => {
    for (const method of LOGIN_METHODS) {
      expect(method.length).toBeLessThanOrEqual(24);
    }
  });

  it("reason は VarChar(40) 以内", () => {
    for (const reason of LOGIN_FAILURE_REASONS) {
      expect(reason.length).toBeLessThanOrEqual(40);
    }
  });

  it("すべての method / reason に日本語ラベルがある", () => {
    for (const method of LOGIN_METHODS) {
      expect(loginMethodLabel(method)).not.toBe(method);
    }
    for (const reason of LOGIN_FAILURE_REASONS) {
      expect(loginReasonLabel(reason)).not.toBe(reason);
    }
  });
});

describe("kioskFailureReason", () => {
  it("既知の state を対応する理由へ写す", () => {
    expect(kioskFailureReason("PIN_MISMATCH")).toBe("PIN_MISMATCH");
    expect(kioskFailureReason("CARD_SUSPENDED")).toBe("CARD_SUSPENDED");
    expect(kioskFailureReason("KEY_MISMATCH")).toBe("ATTEST_KEY_MISMATCH");
    expect(kioskFailureReason("NO_DEVICE")).toBe("SETTINGS_NO_DEVICE");
  });

  it("未知の state でも記録は残る（UNKNOWN に落ちるだけ）", () => {
    expect(kioskFailureReason("SOMETHING_NEW")).toBe("UNKNOWN");
    expect(kioskFailureReason("")).toBe("UNKNOWN");
  });
});

describe("deviceFailureReason", () => {
  it("getDevice の reason を DEVICE_* へ写す", () => {
    expect(deviceFailureReason("NO_COOKIE")).toBe("DEVICE_NO_COOKIE");
    expect(deviceFailureReason("NOT_FOUND")).toBe("DEVICE_NOT_FOUND");
    expect(deviceFailureReason("EXPIRED")).toBe("DEVICE_EXPIRED");
    expect(deviceFailureReason("DISABLED")).toBe("DEVICE_DISABLED");
    expect(deviceFailureReason("REVOKED")).toBe("DEVICE_REVOKED");
  });

  it("アテステーション未通過は端末エラーではなく専用の理由", () => {
    expect(deviceFailureReason("ATTEST_REQUIRED")).toBe("ATTEST_REQUIRED");
  });

  it("未知・null は UNKNOWN", () => {
    expect(deviceFailureReason("WHAT")).toBe("UNKNOWN");
    expect(deviceFailureReason(null)).toBe("UNKNOWN");
    expect(deviceFailureReason(undefined)).toBe("UNKNOWN");
  });
});

describe("scanKindOf", () => {
  it("統一 QR の種別を見分ける", () => {
    expect(scanKindOf("CKK:CARD:ABCDEFGH12345678")).toBe("CARD");
    // ログイン画面に指示書ストリップをかざした、を値を残さずに判別できる
    expect(scanKindOf("CKK:WO:1234")).toBe("WO");
    expect(scanKindOf("CKK:INV:INV-202608-00001")).toBe("OTHER");
  });

  it("配布済みの素の 16 桁カードもカード扱い", () => {
    expect(scanKindOf("ABCDEFGH12345678")).toBe("CARD");
  });

  it("空・ゴミを区別する", () => {
    expect(scanKindOf("")).toBe("EMPTY");
    expect(scanKindOf("   ")).toBe("EMPTY");
    expect(scanKindOf(null)).toBe("EMPTY");
    expect(scanKindOf("!!! not a code !!!")).toBe("MALFORMED");
  });
});
