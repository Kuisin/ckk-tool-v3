/**
 * 「どの機械の何枚目か」の読み取り。**Pi が実際に送ってくる形**で確かめる。
 *
 * Pi 側（public/rpi/ckk-display.sh）はこう組み立てる:
 *   ?machine=$(hostname -s)&screen=${SCREEN}&of=${SCREEN_TOTAL}
 * SCREEN は **1 始まり**（`SCREEN="${1:-1}"`）。ここが 0 始まりになると
 * normalizeScreenIndex が弾いて、1 枚目だけ「機械が分からない」状態になる。
 * 気づきにくいので試験で固定する。
 */

import { describe, expect, it } from "vitest";
import { machineHint } from "./display-core";

describe("Pi が送ってくる形", () => {
  it("hostname と 1 始まりの画面番号を読む", () => {
    expect(machineHint("ckk-pi-01", "1")).toEqual({
      machineId: "ckk-pi-01",
      screenIndex: 1,
    });
    expect(machineHint("ckk-pi-01", "2")).toEqual({
      machineId: "ckk-pi-01",
      screenIndex: 2,
    });
  });

  // hostname が取れないと script は "pi" を送る
  it("hostname が取れないときの既定値も読める", () => {
    expect(machineHint("pi", "1").machineId).toBe("pi");
  });

  it("ドット・アンダースコア入りのホスト名も通す", () => {
    expect(machineHint("ckk_pi.01-a", "1").machineId).toBe("ckk_pi.01-a");
  });
});

describe("読めないものは null（推測しない）", () => {
  it("パラメータが無い（1 枚運用）", () => {
    expect(machineHint(null, null)).toEqual({
      machineId: null,
      screenIndex: null,
    });
    expect(machineHint(undefined, undefined).machineId).toBeNull();
  });

  // 0 始まりに変えると 1 枚目が弾かれる。その事実を試験として残す
  it("0 以下・数字でない画面番号は採らない", () => {
    expect(machineHint("pi", "0").screenIndex).toBeNull();
    expect(machineHint("pi", "-1").screenIndex).toBeNull();
    expect(machineHint("pi", "left").screenIndex).toBeNull();
    expect(machineHint("pi", "1.5").screenIndex).toBeNull();
  });

  it("空の機械名は採らない", () => {
    expect(machineHint("", "1").machineId).toBeNull();
    expect(machineHint("   ", "1").machineId).toBeNull();
  });

  // 自己申告の値がそのまま DB に入るので、変な文字は落とす
  it("記号は落とす（自己申告の値をそのまま入れない）", () => {
    expect(machineHint("pi<script>", "1").machineId).toBe("piscript");
    expect(machineHint("../etc/passwd", "1").machineId).toBe("..etcpasswd");
  });
});
