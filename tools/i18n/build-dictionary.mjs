#!/usr/bin/env node
/**
 * build-dictionary.mjs — ja 鍵の対訳データ（`data/*.json`）を
 * **`messages/{ja,en,zh}.json` の `ui` 名前空間**へ書き出す。
 *
 *   node tools/i18n/build-dictionary.mjs
 *
 * 以前は `src/lib/ui-dictionary/{en,zh}.ts` という生成 TS を吐いていたが、
 * 訳の置き場を言語ファイル 1 本へ寄せたので、出力先を messages に変えた。
 * 生成の中身は `tools/i18n-unify/build-unified-messages.mjs` が持っている
 * （値ラベルも一緒に組み立てる必要があるため）— ここはその入口。
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const builder = path.join(REPO, "tools/i18n-unify/build-unified-messages.mjs");

const r = spawnSync(process.execPath, [builder], { stdio: "inherit" });
process.exit(r.status ?? 1);
