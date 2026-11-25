/**
 * 販売の流れ（process/sales）— 価格試算 → 価格表 → 見積書 → 注文請書 → 承認 → 確定。
 *
 * 始まり: デモ顧客（デモ商事）と、まだ価格表の無い製品（超硬リーマ φ8×70）。
 * 価格表は 顧客 × 製品 で 1 つしか作れないので、シードに価格表のある製品
 * （超硬エンドミル）は使えない。全部の書類をこの 1 本の中で新しく作る。
 */

import { docUrl, orderLineNumber } from "../doc-number";
import type { Walkthrough } from "./types";

export const sales: Walkthrough = {
  id: "process-sales",
  docPage: "process/sales",
  title: "販売の流れ — 価格試算から受注の確定まで",
  steps: [
    {
      caption: "価格試算を作る — 材料と加工の内容から見積単価を計算する",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/trial-estimates/new");
        await w.say("見積り先: 誰向けの価格試算か。\n相手が未定なら空のままでも計算できる");
        await w.pick(p.getByRole("combobox", { name: /^見積り先/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.say("製品: 対象の製品を選ぶ。選んでおかないと、\nあとで価格表の単価のもとに選べない");
        await w.say("素材は 材種・直径・黒皮/研磨 の 3 つで決める。\n直径は製品の最大径より太いものを選ぶ");
        await w.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬リーマ/, { search: "リーマ" });
        await w.pick(p.getByRole("combobox", { name: /^材種/ }), /^B01A0001/);
        await w.pick(p.getByRole("combobox", { name: /^直径/ }), "φ8", { exact: true });
        await w.pick(p.getByRole("combobox", { name: /^黒皮\/研磨/ }), "研磨", { exact: true });
        await w.say("黒皮は研磨より安いが、センタレスの加算が要ることがある。\n3 つを選ぶと、仕入実績から参照単価が自動で入る");
        await w.say("最大径と全長: 製品の寸法。\n材料費は長さで決まるので、全長を変えると原価が変わる");
        await w.fill(p.getByRole("textbox", { name: /^最大径/ }), "8");
        await w.fill(p.getByRole("textbox", { name: /^全長/ }), "70");
        await w.say("見積単価（基準）が 1 本あたりの売値。\n加工・コートなどの条件は、初期値を必要なところだけ直す");
        await w.see("見積単価（基準）");
        await w.say("価格試算名: あとで探せる名前を付けて保存する");
        await w.fill(p.getByPlaceholder(/^例: 精密軸/), "リーマ φ8×70 CX400");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(docUrl("/sales/trial-estimates", "EST"));
      },
    },
    {
      caption: "価格試算を確定する — 確定した価格試算だけが価格表の単価のもとに使える",
      run: async (w) => {
        await w.say("保存した直後は「下書き」。内容が固まったら確定する。\n価格表で使ったあとは編集できない（直すときは複製する）");
        await w.menu("確定");
        await w.see("確定", { exact: true });
      },
    },
    {
      caption: "価格表を作る — 顧客と製品の組み合わせで単価を決める",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/price-lists/new");
        await w.say("顧客と製品: この組み合わせで価格表は 1 つだけ。\n作ったあとは変えられない（間違えたら作り直す）");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬リーマ/, { search: "リーマ" });
        await w.say("価格ソース: 確定した価格試算を選ぶと、基準単価が入る。\n価格試算が無いときは、基準単価を手で入れる");
        await w.pick(p.getByRole("combobox", { name: /^価格ソース/ }), /リーマ φ8×70 CX400/);
        await w.say("有効開始日: この価格を使い始める日。\nこれより前の日付の見積書・注文請書には使われない");
        await w.say("数量の範囲ごとの倍率は初期値のまま。多く買うほど安くする\nなら 1 より小さい値にする。注文種別ごとに別の価格も持てる");
        await w.pickDate(p.getByRole("button", { name: /^有効開始日/ }), "today");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(docUrl("/sales/price-lists", "PRC"));
      },
    },
    {
      caption: "見積書を作る — 顧客と製品を選ぶと、価格表の単価が自動で入る",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/quotes/new");
        await w.say("顧客: 最初に選ぶ。\nここで選んだ顧客の価格表から単価が決まる");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
        await w.say("有効期限: 見積が有効な最終日。発行するときは必須。\n過ぎると自動で「期限切れ」と表示される");
        await w.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
        await w.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬リーマ/, { search: "リーマ" });
        await w.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
        await w.say("製品と数量を入れると、価格表から単価が自動で入る。\n数量の範囲で単価が変わる（手では入力しない）");
        await w.see("単価（価格表）");
        await w.say("価格表に無い製品は単価が入らず、警告が出る。\nその場合は先に価格試算と価格表を作る");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(docUrl("/sales/quotes", "QOT"));
      },
    },
    {
      caption: "見積書を発行する — 発行すると顧客へ提出できる状態になる",
      run: async (w) => {
        await w.say("発行すると PDF が保存され、顧客へ提出できる状態になる");
        await w.menu("発行");
        await w.clickInDialog("発行");
        await w.see("発行済");
      },
    },
    {
      caption: "注文請書を作る — 顧客から届いた注文の内容を入力する",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/order-acceptances/new");
        await w.say("ここでは手で入力する。注文書の PDF を取り込んだ場合は、\n読み取った内容が入った状態から確認・修正する");
        await w.say("顧客: 注文をくれたお客様。\n決まらないと価格の照合ができない");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.say("顧客注文書番号: お客様の注文書に書かれている番号。\nあとで問い合わせを受けたとき、この番号で探せる");
        await w.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), "PO-2026-1001");
        await w.say("見積書（任意）: もとになった見積書を選ぶと、\n見積書の画面からこの注文請書へ辿れる");
        await w.pick(p.getByRole("combobox", { name: /^見積書/ }), /QOT-/);
        await w.say("注文日: お客様が注文した日（注文書の日付）");
        await w.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");
        await w.say("明細: 製品と数量を入れると、単価は価格表から入る（直せない）。\n別の単価で受けるときだけ「単価を上書き」を入れる");
        await w.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬リーマ/, { search: "リーマ" });
        await w.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
        await w.say("納期は明細ごとに入れる。\n配送方法（通常配送 / ユーザー直送）は「配送」を開いて決める");
        await w.say("ユーザー直送はエンドユーザーの指定が必須。\n未指定のままだと承認依頼も確定もできない");
        await w.pickDate(p.getByRole("button", { name: "納期" }).first(), { nextMonthDay: 25 });
        await w.click(p.getByRole("button", { name: "下書きを作成" }));
        await w.waitForUrl(docUrl("/sales/order-acceptances", "ORD", "", true));
      },
    },
    {
      caption: "承認を依頼する — 依頼中は内容を編集できない",
      run: async (w) => {
        await w.say("内容が固まったら承認を依頼する。\n段の数は承認設定で決まり、金額や配送方法で変わることがある");
        await w.click(w.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await w.see("第一承認待ち");
      },
    },
    {
      caption: "承認者が内容を確かめて承認する — ここからは承認者の画面",
      run: async (w) => {
        await w.switchUser("approver", new URL(w.page.url()).pathname);
        await w.say("承認グループのメンバーにだけ「承認」「差し戻し」が出る。\n差し戻されたら、担当者が内容を直して再依頼する");
        await w.click(w.page.getByRole("button", { name: "承認", exact: true }).first());
        await w.see("確定できます");
      },
    },
    {
      caption: "受注を確定する — 明細ごとに注文明細が作られ、製造の指示へ進める",
      run: async (w) => {
        await w.switchUser("staff", new URL(w.page.url()).pathname);
        await w.say("確定すると、明細 1 行ごとに注文明細（ORD-…-01）ができる。\nここから指示書の作成や出荷書の作成へ進む");
        await w.click(w.page.getByRole("button", { name: "確定", exact: true }).first());
        await w.clickInDialog("展開する");
        await w.see(orderLineNumber(1));
      },
    },
  ],
};
