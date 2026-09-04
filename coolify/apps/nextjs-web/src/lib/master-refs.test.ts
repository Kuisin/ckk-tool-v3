/**
 * master-refs.test.ts — MASTER_REFERENCES が Prisma スキーマと食い違っていないか。
 *
 * 生成クライアント（prisma-client 7 / ESM）は DMMF を公開しないので、
 * 同期コピー prisma/schema/*.prisma を直接読んで関連を導く。
 * 見るのは `@relation(fields: [...])` を持つ行だけ:
 *   - `onDelete:` があればその値
 *   - 無ければ Prisma の既定 — 省略可能（`Foo?`）なら SetNull、必須なら Restrict
 * SET NULL / CASCADE でマスタへ向く関連は、数える（MASTER_REFERENCES）か
 * 理由付きで数えない（IGNORED_REFERENCES）かのどちらかでなければならない。
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IGNORED_REFERENCES,
  MASTER_REFERENCES,
  type MasterTarget,
  referenceKey,
} from "./master-refs";

interface SchemaRelation {
  model: string;
  field: string;
  target: string;
  onDelete: "SetNull" | "Cascade" | "Restrict" | "NoAction" | "SetDefault";
}

function readSchemaRelations(): SchemaRelation[] {
  const dir = path.resolve(__dirname, "../../prisma/schema");
  const relations: SchemaRelation[] = [];
  const lineRe = /^\s+(\w+)\s+(\w+)(\?)?(\[\])?\s+@relation\(([^)]*)\)/;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".prisma"))) {
    let model: string | null = null;
    for (const line of readFileSync(path.join(dir, file), "utf8").split("\n")) {
      const m = /^model\s+(\w+)\s*\{/.exec(line);
      if (m) {
        model = m[1];
        continue;
      }
      if (line.startsWith("}")) {
        model = null;
        continue;
      }
      if (!model) continue;
      const r = lineRe.exec(line);
      if (!r) continue;
      const [, , target, optional, , args] = r;
      const fields = /fields:\s*\[\s*(\w+)/.exec(args);
      if (!fields) continue; // 逆側（配列）の宣言
      const explicit = /onDelete:\s*(\w+)/.exec(args)?.[1];
      relations.push({
        model,
        field: fields[1],
        target,
        onDelete: (explicit ??
          (optional ? "SetNull" : "Restrict")) as SchemaRelation["onDelete"],
      });
    }
  }
  return relations;
}

const relations = readSchemaRelations();
const TARGETS = Object.keys(MASTER_REFERENCES) as MasterTarget[];

describe("MASTER_REFERENCES × Prisma スキーマ", () => {
  it("スキーマが読めている（関連が十分に見つかる）", () => {
    expect(relations.length).toBeGreaterThan(100);
  });

  for (const target of TARGETS) {
    describe(target, () => {
      const counted = new Set(MASTER_REFERENCES[target].map(referenceKey));
      const ignored = new Set(
        IGNORED_REFERENCES.filter((r) => r.target === target).map(referenceKey),
      );
      const incoming = relations.filter((r) => r.target === target);

      it("SET NULL / CASCADE の関連はすべて数えるか、理由付きで除外されている", () => {
        const silent = incoming
          .filter((r) => r.onDelete === "SetNull" || r.onDelete === "Cascade")
          .map(referenceKey);
        const missing = silent.filter(
          (k) => !counted.has(k) && !ignored.has(k),
        );
        expect(missing, `MASTER_REFERENCES.${target} に無い関連`).toEqual([]);
      });

      it("数える関連はスキーマに実在する（モデル名・フィールド名の誤字）", () => {
        const known = new Set(incoming.map(referenceKey));
        const unknown = [...counted].filter((k) => !known.has(k));
        expect(unknown, `スキーマに無い関連`).toEqual([]);
      });

      it("除外リストは数えるリストと重ならず、実在する関連だけを指す", () => {
        const known = new Set(incoming.map(referenceKey));
        for (const k of ignored) {
          expect(counted.has(k), `${k} は数える側にもある`).toBe(false);
          expect(known.has(k), `${k} はスキーマに無い`).toBe(true);
        }
      });
    });
  }
});
