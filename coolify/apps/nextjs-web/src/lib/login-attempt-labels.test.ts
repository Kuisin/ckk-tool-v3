/**
 * login-attempt-labels.test.ts — すべての method / reason に翻訳ラベルがある
 * ことを守る。無いと SY0D の一覧・詳細に生の enum 値がそのまま出る。
 */

import { describe, expect, it } from "vitest";
import { LOGIN_FAILURE_REASONS, LOGIN_METHODS } from "./login-attempt-core";
import { loginMethodLabel, loginReasonLabel } from "./login-attempt-labels";

describe("すべての method / reason に翻訳ラベルがある", () => {
  it("method", () => {
    for (const method of LOGIN_METHODS) {
      expect(loginMethodLabel(method)).not.toBe(method);
    }
  });

  it("reason", () => {
    for (const reason of LOGIN_FAILURE_REASONS) {
      expect(loginReasonLabel(reason)).not.toBe(reason);
    }
  });
});
