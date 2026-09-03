import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";
import {
  label,
  labelKeys,
  labelOptions,
  labelWith,
  localizedLabel,
} from "./messages";

describe("label", () => {
  it("既存の鍵を引く", () => {
    expect(label("enum.UNIT_LABEL.本", "ja")).toBe("本");
  });

  it("無い鍵は ja へ、それも無ければ fallback へ倒す", () => {
    expect(label("enum.UNIT_LABEL.存在しない値", "en", "存在しない値")).toBe(
      "存在しない値",
    );
    expect(label("これは存在しない名前空間.どこにも無い", "ja", "既定値")).toBe(
      "既定値",
    );
  });

  it("fallback 未指定なら空文字", () => {
    expect(label("これは存在しない名前空間.どこにも無い", "ja")).toBe("");
  });
});

describe("labelOptions / labelKeys", () => {
  it("ja の並び順で { value, label } を返す", () => {
    const keys = labelKeys("status.STATUS_MAPS.Quote");
    expect(keys).toEqual([
      "DRAFT",
      "ISSUED",
      "ACCEPTED",
      "REJECTED",
      "EXPIRED",
    ]);
  });

  it("未知の名前空間は空配列", () => {
    expect(labelOptions("no.such.namespace", "ja")).toEqual([]);
    expect(labelKeys("no.such.namespace")).toEqual([]);
  });
});

describe("labelWith", () => {
  it("ICU の穴を実際の値で埋める（next-intl 本体に委譲）", () => {
    expect(
      labelWith("pdf.ATTN.withBranch", "ja", { branchName: "大阪支店" }),
    ).toContain("大阪支店");
  });
});

describe("localizedLabel", () => {
  it("3 言語ぶんをまとめて返す", () => {
    const result = localizedLabel("permission.ACTION_LABEL.READ");
    expect(result.ja).toBeTruthy();
    expect(result.en).toBeTruthy();
    expect(result.zh).toBeTruthy();
  });
});

/**
 * 退行防止: メッセージ木の中に **ICU として壊れる `{...}` パターン**が
 * 紛れ込んでいないか。`label`/`labelWith` は実際の展開を next-intl の
 * `createTranslator`（ICU パーサ）に委譲しているため、`^[A-Z]{2}-d{4}$`
 * のような正規表現の例文がそのまま入ると実行時に例外になる
 * （実際に起きた — messages/ja.json の
 * `settings.itemDefEditForm.aRegularExpressionConstrainingTheInput` が該当し、
 * `[A-Z][A-Z]-[0-9][0-9][0-9][0-9]` の形へ書き換えて解消した）。
 * `{name}` の形（識別子 1 つ）だけを許し、それ以外の `{...}` を禁止する。
 */
describe("ICU 互換性（退行防止）", () => {
  const TREES = { ja, en, zh } as const;

  function collectStrings(
    node: unknown,
    prefix: string,
    out: [string, string][],
  ) {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) {
        collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
      }
    } else if (typeof node === "string") {
      out.push([prefix, node]);
    }
  }

  for (const locale of Object.keys(TREES) as (keyof typeof TREES)[]) {
    it(`${locale}: 全ての文言に非 ICU な波括弧が無い`, () => {
      const pairs: [string, string][] = [];
      collectStrings(TREES[locale], "", pairs);
      const offenders = pairs.filter(([, value]) =>
        // eslint系ではないため素朴な正規表現で判定: `{` の中身が
        // 識別子（[A-Za-z_][A-Za-z0-9_]*）でなければ ICU 引数として読めない。
        /\{([^}]*)\}/g.test(value)
          ? [...value.matchAll(/\{([^}]*)\}/g)].some(
              (m) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1]),
            )
          : false,
      );
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * 退行防止: **鍵が無いときの受け皿も、変数を埋めた文を返す。**
 * ここが素通しだった間、`settings.orderIntake.pipeline.*` が丸ごと未登録
 * だったせいで「注文請書 {number} を自動取込しました」がそのまま通知・
 * push・監査ログに出ていた。壊れた文を出す受け皿は受け皿ではない。
 */
describe("fallback の変数埋め", () => {
  it("鍵が無くても fallback の {name} を埋める", () => {
    expect(
      label("no.such.namespace.key", "ja", "注文請書 {number} を取込", {
        number: "ORD-202609-00012",
      }),
    ).toBe("注文請書 ORD-202609-00012 を取込");
  });

  it("値の無い穴はそのまま残す（消して意味を変えない）", () => {
    expect(label("no.such.namespace.key", "ja", "{a} と {b}", { a: 1 })).toBe(
      "1 と {b}",
    );
  });
});

/**
 * 取込パイプラインの文言は**リクエスト外**（instrumentation.ts のポーラー）
 * から `label(key, "ja", fallback, vars)` で引かれる。鍵の登録漏れは
 * 通知の本文に出るまで誰も気づかないので、ここで存在を確かめる。
 */
describe("settings.orderIntake.pipeline", () => {
  it("通知の文言が鍵として登録されていて、変数が埋まる", () => {
    expect(
      label("settings.orderIntake.pipeline.intakeNotificationTitle", "ja", "", {
        number: "ORD-202609-00012",
      }),
    ).toBe("注文請書 ORD-202609-00012 を自動取込しました");
    expect(
      label(
        "settings.orderIntake.pipeline.intakeNotificationMessage",
        "ja",
        "",
        {
          count: 3,
          matchState: label("settings.orderIntake.pipeline.matched", "ja"),
        },
      ),
    ).toBe("明細 3 件・顧客一致 — 内容を確認してください");
  });
});
