/**
 * doc-ref-guard.test.ts — 多態参照が「法人コード/番号」を通って書かれることの門番。
 *
 * 承認依頼・メモ・添付・ポータル・在庫の元書類は、書類を FK ではなく文字列で
 * 指す。番号は法人ごとの連番になる（番号設計 PR-C）ので、**番号だけの文字列を
 * 保存すると、あとで別の法人の同じ番号の書類に付いて見える**。参照は必ず
 * lib/doc-ref.ts（= lib/doc-ref-core.ts の docRef）を通す。
 *
 * ここはソースを走査して、多態参照の列へ書いている箇所を全部見つけ、
 * そのファイルが参照の組み立て（toDocRef / toDocRefs / requireDocRef）を
 * 使っていることを確かめる。新しく書き込み口を足して参照を通し忘れると落ちる。
 *
 * DB 側にも保険がある（BEFORE トリガー app.qualify_doc_ref が番号だけの値を
 * 参照へ直す）が、あれは「書いたあと見つからない」を防ぐだけで、**検索**は
 * アプリが参照で引かなければ当たらない。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { docRefTypes, isDocRefType } from "./doc-ref";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 多態参照の列を持つモデル（Prisma のデリゲート名）。 */
const POLYMORPHIC_MODELS = [
  "approvalRequest",
  "documentMemo",
  "documentMemoRevision",
  "documentAttachment",
  "portalGrant",
  "portalDocumentLink",
  "portalAccessLog",
  "inventoryMovement",
];

/** それらへ書く・参照の列で絞る呼び出し。 */
const TOUCH = new RegExp(
  `\\.(${POLYMORPHIC_MODELS.join("|")})\\.(create|createMany|upsert|findFirst|findMany|count|deleteMany|updateMany)\\(`,
);

/** 参照の列の名前（どれかがその呼び出しの近くに出てくれば「書類を指している」）。 */
const REF_COLUMN = /\b(targetId|ownerId|resourceId|sourceId)\b/;

const USES_DOC_REF = /\b(toDocRef|toDocRefs|requireDocRef|storedTargetId)\(/;

/**
 * 参照の列に触るが、書類番号を新しく組み立てないファイル。理由を必ず書く。
 */
const ALLOWED: Record<string, string> = {
  "lib/audit-entity-name.ts": "id（uuid）で引いてラベルを読むだけ",
  "lib/portal-admin.ts":
    "アカウント id で引いて一覧にするだけ（表示は docDisplayId で番号へ戻す）",
  "lib/portal-guide.ts":
    "アカウント id で引いて FORM 付与（forms.code）を読むだけ",
  "lib/portal-forms.ts":
    "FORM 付与（forms.code）だけを読む — 番号を持つ書類ではない",
  "lib/form-completion.ts":
    "share_grants（forms.code）— 番号を持つ書類ではない",
  "app/(dashboard)/general/tasks/approvals-data.ts":
    "status で引いて一覧にするだけ（表示は docDisplayId で番号へ戻す）",
  "app/(dashboard)/inventory/movements/data.ts":
    "伝票を読んで一覧にするだけ（表示は docDisplayId で番号へ戻す）",
  "app/(dashboard)/settings/portal/actions.ts":
    "BP_SCOPE の付与だけを作る（書類を指さない）。リンクは lib/portal-links.ts が作る",
  "app/(dashboard)/production/work-orders/actions.ts":
    "指示書はロット番号（通し連番）で指す — 法人をまたいで重ならない",
  "app/api/attachments/[id]/route.ts": "添付の id（uuid）で引くだけ",
};

describe("polymorphic document references go through docRef", () => {
  const files = walk(SRC);

  it("every file that touches a polymorphic reference column builds refs via lib/doc-ref", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      let touches = false;
      for (let i = 0; i < lines.length; i++) {
        if (!TOUCH.test(lines[i])) continue;
        // 呼び出しの引数（続く 25 行）に参照の列が出てくるか
        const window = lines.slice(i, i + 25).join("\n");
        if (REF_COLUMN.test(window)) {
          touches = true;
          break;
        }
      }
      if (!touches) continue;
      if (USES_DOC_REF.test(text)) continue;
      if (ALLOWED[rel]) continue;
      offenders.push(rel);
    }
    expect(
      offenders,
      "these files read or write a polymorphic reference column without lib/doc-ref (toDocRef / requireDocRef). " +
        "Build the reference there, or add the file to ALLOWED with the reason.",
    ).toEqual([]);
  });

  it("the allow-list has no stale entries", () => {
    const rels = new Set(
      files.map((f) => path.relative(SRC, f).split(path.sep).join("/")),
    );
    for (const rel of Object.keys(ALLOWED)) {
      expect(rels.has(rel), `ALLOWED lists a missing file: ${rel}`).toBe(true);
    }
  });

  it("no file builds a stored reference by hand", () => {
    // `${code}/${number}` を自前で連結していないこと（docRef だけが作る）。
    const HAND_BUILT = /\$\{[^}]*[cC]ompany[^}]*[cC]ode[^}]*\}\/\$\{/;
    const offenders = files
      .filter((f) => !f.endsWith("doc-ref-core.ts"))
      .filter((f) => HAND_BUILT.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("the registry covers every numbered document type", () => {
    // app.doc_ref_table（SQL 側の双子）と同じ集合であること。片方だけに足すと、
    // DB のトリガーは直すのにアプリが引けない（またはその逆）になる。
    expect(docRefTypes().sort()).toEqual(
      [
        "accounting_documents",
        "delivery_notes",
        "delivery_orders",
        "design_requests",
        "estimates",
        "form_responses",
        "internal_pages",
        "inventory_movements",
        "invoice_payments",
        "invoices",
        "material_purchase_orders",
        "order_acceptances",
        "order_lines",
        "price_list_entries",
        "purchase_requests",
        "quotes",
        "stock_takes",
      ].sort(),
    );
    // 指示書はロット番号（通し連番）で指す — 参照へ直さない。
    expect(isDocRefType("work_orders")).toBe(false);
    expect(isDocRefType("design_versions")).toBe(false);
  });
});
