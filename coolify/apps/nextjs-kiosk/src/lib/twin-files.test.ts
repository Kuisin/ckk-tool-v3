/**
 * twin-files.test.ts — nextjs-web からの逐語コピー（twin file）のドリフト検出。
 *
 * キオスクは工程実行を自前 API で完結させるため、業務ルールの一部を
 * nextjs-web から **逐語コピー** して持っている（判断: 端末から web の内部
 * 書き込み API を叩かない）。コピーは放置すると必ずドリフトし、とくに
 * inventory.ts は実在庫を動かすので二重計上・消費欠落に直結する。
 *
 * そこでこのテストが「1 バイトでも違えば落ちる」門番になる。
 * 原本を変更したら `pnpm twin:sync` でコピーし直し、両方をレビューすること。
 *
 * 原本はリポジトリ内の相対パスにしか無い（Docker イメージには入らない）ため、
 * 原本が読めない環境ではスキップする。CI / 開発機では必ず実行される。
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_LIB = path.resolve(__dirname, "../../../nextjs-web/src/lib");
const KIOSK_LIB = __dirname;

/** 逐語コピーで同期しているファイル（相対名）。 */
const TWINS = [
  "workflow-core.ts",
  "workflow-core.test.ts",
  "inventory.ts",
  "inspection-core.ts",
  "inspection-core.test.ts",
  "qr-payload.ts",
  "qr-payload.test.ts",
];

describe("twin files (nextjs-web ⇄ nextjs-kiosk)", () => {
  for (const name of TWINS) {
    const source = path.join(WEB_LIB, name);
    const copy = path.join(KIOSK_LIB, name);

    it(`${name} が原本と一致する`, (ctx) => {
      if (!existsSync(source)) {
        // Docker イメージ内など原本が無い環境 — 検証不能なのでスキップ
        ctx.skip();
        return;
      }
      expect(existsSync(copy)).toBe(true);
      const a = readFileSync(source, "utf8");
      const b = readFileSync(copy, "utf8");
      if (a !== b) {
        throw new Error(
          `twin file drift: ${name}\n` +
            `  原本: coolify/apps/nextjs-web/src/lib/${name}\n` +
            `  複製: coolify/apps/nextjs-kiosk/src/lib/${name}\n` +
            "  → 原本を正として `pnpm twin:sync` で同期し直すこと。",
        );
      }
      expect(b).toBe(a);
    });
  }
});
