/**
 * company-aliases.ts — 取引先の「AI 照合名」候補を作る純ロジック。
 *
 * 受け取った注文書の社名は書き方が揺れる（「(株)」「㈱」「株式会社」、全角英字、
 * カタカナ／ひらがな／ローマ字）。突合は完全一致なので、**ありうる書き方を
 * あらかじめ match_names に入れておく**のが唯一の対策になる。
 *
 * ここで作れるのは **機械的に決まる変換だけ**:
 *   - 全角→半角（NFKC）、法人格の表記ゆれ（株式会社 / (株) / ㈱ / 無し）
 *   - カタカナ ⇄ ひらがな、かな → ローマ字（ヘボン式）
 *
 * **漢字の読みは作れない**（形態素解析を入れていないため）。読みが要る社名は
 * フリガナ（name_kana）を人が入れて初めて、かな・ローマ字を生成できる。
 * どの形式が欠けているかは missingKeywordFormats() が返し、画面はそれを
 * 「この形式を足しませんか」と勧めるのに使う。
 */

/** ひらがな → カタカナ（長音符・記号はそのまま）。 */
export function toKatakana(input: string): string {
  return input.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  );
}

/** カタカナ → ひらがな（半角カナは NFKC で全角化してから）。 */
export function toHiragana(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const HAS_KANJI = /[一-鿿々]/;
const HAS_KANA = /[ぁ-ゖァ-ヺ]/;
const HAS_LATIN = /[A-Za-z]/;

export const hasKanji = (s: string) => HAS_KANJI.test(s);
export const hasKana = (s: string) => HAS_KANA.test(s.normalize("NFKC"));
export const hasLatin = (s: string) => HAS_LATIN.test(s.normalize("NFKC"));

/** かな（＋長音・中黒・空白）だけで書かれているか。英字・漢字が混ざれば false。 */
export function isKanaOnly(s: string): boolean {
  const t = s.normalize("NFKC").trim();
  if (!t || !HAS_KANA.test(t)) return false;
  return /^[ぁ-ゖァ-ヺー・\s]+$/.test(t);
}

/** 法人格の表記（先頭・末尾どちらに付いても拾えるように列挙）。 */
const LEGAL_FORMS: { full: string; short: string[] }[] = [
  { full: "株式会社", short: ["(株)", "㈱"] },
  { full: "有限会社", short: ["(有)", "㈲"] },
  { full: "合同会社", short: ["(同)"] },
  { full: "合資会社", short: ["(資)"] },
];

/** 社名から法人格を取り除いた「核」。 */
export function companyCore(name: string): string {
  let s = name.normalize("NFKC");
  for (const { full, short } of LEGAL_FORMS) {
    for (const form of [full, ...short]) {
      s = s.split(form).join("");
    }
  }
  return s.trim();
}

/** 2 文字のヘボン式（拗音）。先に引くこと。 */
const ROMAJI_DIGRAPHS: Record<string, string> = {
  キャ: "kya",
  キュ: "kyu",
  キョ: "kyo",
  シャ: "sha",
  シュ: "shu",
  ショ: "sho",
  チャ: "cha",
  チュ: "chu",
  チョ: "cho",
  ニャ: "nya",
  ニュ: "nyu",
  ニョ: "nyo",
  ヒャ: "hya",
  ヒュ: "hyu",
  ヒョ: "hyo",
  ミャ: "mya",
  ミュ: "myu",
  ミョ: "myo",
  リャ: "rya",
  リュ: "ryu",
  リョ: "ryo",
  ギャ: "gya",
  ギュ: "gyu",
  ギョ: "gyo",
  ジャ: "ja",
  ジュ: "ju",
  ジョ: "jo",
  ヂャ: "ja",
  ヂュ: "ju",
  ヂョ: "jo",
  ビャ: "bya",
  ビュ: "byu",
  ビョ: "byo",
  ピャ: "pya",
  ピュ: "pyu",
  ピョ: "pyo",
  ファ: "fa",
  フィ: "fi",
  フェ: "fe",
  フォ: "fo",
  ヴァ: "va",
  ヴィ: "vi",
  ヴェ: "ve",
  ヴォ: "vo",
  ウィ: "wi",
  ウェ: "we",
  ウォ: "wo",
  ティ: "ti",
  ディ: "di",
  デュ: "dyu",
  トゥ: "tu",
  ドゥ: "du",
  チェ: "che",
  シェ: "she",
  ジェ: "je",
};

const ROMAJI_SINGLE: Record<string, string> = {
  ア: "a",
  イ: "i",
  ウ: "u",
  エ: "e",
  オ: "o",
  カ: "ka",
  キ: "ki",
  ク: "ku",
  ケ: "ke",
  コ: "ko",
  サ: "sa",
  シ: "shi",
  ス: "su",
  セ: "se",
  ソ: "so",
  タ: "ta",
  チ: "chi",
  ツ: "tsu",
  テ: "te",
  ト: "to",
  ナ: "na",
  ニ: "ni",
  ヌ: "nu",
  ネ: "ne",
  ノ: "no",
  ハ: "ha",
  ヒ: "hi",
  フ: "fu",
  ヘ: "he",
  ホ: "ho",
  マ: "ma",
  ミ: "mi",
  ム: "mu",
  メ: "me",
  モ: "mo",
  ヤ: "ya",
  ユ: "yu",
  ヨ: "yo",
  ラ: "ra",
  リ: "ri",
  ル: "ru",
  レ: "re",
  ロ: "ro",
  ワ: "wa",
  ヲ: "o",
  ン: "n",
  ガ: "ga",
  ギ: "gi",
  グ: "gu",
  ゲ: "ge",
  ゴ: "go",
  ザ: "za",
  ジ: "ji",
  ズ: "zu",
  ゼ: "ze",
  ゾ: "zo",
  ダ: "da",
  ヂ: "ji",
  ヅ: "zu",
  デ: "de",
  ド: "do",
  バ: "ba",
  ビ: "bi",
  ブ: "bu",
  ベ: "be",
  ボ: "bo",
  パ: "pa",
  ピ: "pi",
  プ: "pu",
  ペ: "pe",
  ポ: "po",
  ヴ: "vu",
  ァ: "a",
  ィ: "i",
  ゥ: "u",
  ェ: "e",
  ォ: "o",
  ャ: "ya",
  ュ: "yu",
  ョ: "yo",
};

/**
 * かな → ローマ字（ヘボン式）。かな以外の文字はそのまま残す。
 * 促音「ッ」は次の子音を重ね、長音「ー」は落とす（照合キーとして扱うため）。
 */
export function kanaToRomaji(input: string): string {
  const kata = toKatakana(input.normalize("NFKC"));
  let out = "";
  let i = 0;
  while (i < kata.length) {
    const pair = kata.slice(i, i + 2);
    if (ROMAJI_DIGRAPHS[pair]) {
      out += ROMAJI_DIGRAPHS[pair];
      i += 2;
      continue;
    }
    const ch = kata[i];
    if (ch === "ッ") {
      // 次の音の頭子音を重ねる（キッコー → kikkou）。母音なら何もしない。
      const next = kata.slice(i + 1, i + 3);
      const romaji = ROMAJI_DIGRAPHS[next] ?? ROMAJI_SINGLE[kata[i + 1]] ?? "";
      const head = romaji[0];
      if (head && !"aiueo".includes(head)) out += head;
      i += 1;
      continue;
    }
    if (ch === "ー") {
      i += 1; // 長音は落とす
      continue;
    }
    if (ROMAJI_SINGLE[ch]) {
      out += ROMAJI_SINGLE[ch];
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export interface AliasSource {
  /** 社名（日本語）。 */
  nameJa: string;
  /** 社名（英語・任意）。 */
  nameEn?: string | null;
  /** フリガナ（任意）— これがあると、かな・ローマ字を作れる。 */
  nameKana?: string | null;
  /** 略称（任意）。 */
  shortName?: string | null;
  /** 既に登録済みの照合名。 */
  existing?: string[];
}

/** どの形式が欠けているか（画面の「推奨」に使う）。 */
export interface MissingFormats {
  hiragana: boolean;
  katakana: boolean;
  romaji: boolean;
  /**
   * 漢字を含むためフリガナ無しでは かな・ローマ字 を作れない。
   * true のときは「フリガナを入れてください」と促す。
   */
  needsReading: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * 機械的に決まる照合名の候補を作る（既存と重複するものは除く）。
 * 漢字の読みは作らない — needsReading の判定は missingKeywordFormats() を使う。
 */
export function generateAliases(src: AliasSource): string[] {
  const out = new Set<string>();
  const push = (v: string | null | undefined) => {
    const s = clean(v ?? "");
    if (s) out.add(s);
  };

  const ja = clean(src.nameJa ?? "");
  if (!ja) return [];

  // 全角/半角ゆれ（ＡＦＣ → AFC、（株）→ (株)）
  const nfkc = ja.normalize("NFKC");
  push(nfkc);
  // 法人格を落とした核
  const core = companyCore(ja);
  push(core);
  // 法人格の位置・表記の言い換えは、**元の社名が「核＋法人格」または
  // 「法人格＋核」ちょうどのときだけ**行う。「MMCツーリング 本社工場」のように
  // 核のあとに部署名が続く社名に株式会社を足すと、誰も書かない文字列になる。
  for (const { full, short } of LEGAL_FORMS) {
    const forms = [full, ...short];
    const attached = forms.find(
      (f) => nfkc === `${core}${f}` || nfkc === `${f}${core}`,
    );
    if (!attached) continue;
    push(`${core}${full}`);
    push(`${full}${core}`);
    for (const s of short) push(`${core}${s}`);
  }

  push(src.nameEn);
  push(src.shortName);

  // かな・ローマ字は **ここでは作らない**。フリガナ由来の表記は
  // autoMatchNames() が match_names_auto へ自動保存する（画面には出さない）。
  // この関数が返すのは「AI照合名の欄に人が持つべき候補」だけ。

  const existing = new Set((src.existing ?? []).map(clean));
  return [...out].filter((v) => v !== ja && !existing.has(v));
}

/**
 * ひらがな / カタカナ / ローマ字 が照合名に含まれているか。
 * 「含まれている」= その字種で書かれた候補が 1 つでもあること。
 */
export function missingKeywordFormats(src: AliasSource): MissingFormats {
  // 自動生成分（match_names_auto）も「登録済み」として数える — 画面には
  // 出ないが突合には効いているので、そこを「未登録」と言うと嘘になる。
  const all = [
    clean(src.nameJa ?? ""),
    ...(src.existing ?? []).map(clean),
    ...autoMatchNames({ nameJa: src.nameJa, nameKana: src.nameKana }),
  ].filter(Boolean);

  const hasHiragana = all.some((v) => /[ぁ-ゖ]/.test(v.normalize("NFKC")));
  const hasKatakana = all.some((v) => /[ァ-ヺ]/.test(v.normalize("NFKC")));
  // ローマ字 = ラテン文字だけで書かれた候補（英語社名も可）。
  const hasRomaji = all.some((v) => hasLatin(v) && !hasKanji(v) && !hasKana(v));

  const core = companyCore(clean(src.nameJa ?? ""));
  const readingKnown = !!clean(src.nameKana ?? "") || !hasKanji(core);

  return {
    hiragana: !hasHiragana,
    katakana: !hasKatakana,
    romaji: !hasRomaji,
    needsReading: !readingKnown,
  };
}

/**
 * **フリガナ等から自動で作る照合名**（match_names_auto に保存する分）。
 *
 * 画面の「AI照合名」には出さない — 利用者が入れたものと機械が足したものが
 * 混ざると、何を触ってよいか分からなくなるため。突合は両方の列を見る。
 * 読みが分からない（フリガナが空で社名に漢字がある）場合は空配列。
 */
export function autoMatchNames(src: {
  nameJa: string;
  nameKana?: string | null;
}): string[] {
  const core = companyCore(clean(src.nameJa ?? ""));
  const kanaSource =
    clean(src.nameKana ?? "") || (isKanaOnly(core) ? core : "");
  if (!kanaSource || !hasKana(kanaSource)) return [];
  const kata = toKatakana(kanaSource.normalize("NFKC"));
  return [...new Set([kata, toHiragana(kata), kanaToRomaji(kata)])].filter(
    Boolean,
  );
}
