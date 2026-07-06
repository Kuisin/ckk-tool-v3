#!/usr/bin/env python3
"""レガシー材種プレースホルダ → 新採番モデルへの構造化 SQL を生成する.

入力はコミット済みの imports/020_material_types.sql.gz（legacy_key + name）—
mapped.sqlite 不要なのでどのマシンでも再生成できる。出力は決定的（ソート順で
採番）かつ冪等（ON CONFLICT DO NOTHING / 変換済みプレースホルダの無効化のみ
UPDATE）。migrate:deploy と 020 の後に適用する（025）。

変換ポリシー（ユーザー決定 2026-07）:
  - グレード（AF510, CTS20D 等 ~40種）はメーカー不明 → 仮メーカー
    Z=未分類（レガシー） に登録して一括変換。既知の K10UF/K40UF のみ
    AFC=B の既存シード (B,01)/(B,02) を使う。
  - `グレード [黒皮|研磨|センタレス] φD×L` に完全一致する行は素材まで変換
    （D 0.1–99.9mm / L 1–999mm、2V30→種類B3 / CH→B5、径・全長構成行も登録）。
  - 複数径の OH/段付き・円筒・不規則テキストは 材種のみ変換（形状は
    OH|穴→B, 円筒→C, 2V30/3V30/CH→B, それ以外→A と推定）。
  - 変換できたプレースホルダは is_active=false（description に変換先を記録）。
    グレードすら取れない行だけが有効なプレースホルダとして残る。

Usage:  python3 export_material_structuring.py [imports/020_material_types.sql.gz] [out.sql]
"""

import gzip
import json
import re
import sys
import unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else "imports/020_material_types.sql.gz"
OUT = sys.argv[2] if len(sys.argv) > 2 else "025_material_structuring.sql"
BATCH = 500

# 既知グレード → 既存シードのメーカー/材種コード（採番表 ver1.2）
KNOWN_GRADES = {"K10UF": ("B", "01"), "K40UF": ("B", "02")}
PSEUDO_MANUFACTURER = "Z"

ROW_RE = re.compile(r"^\('([0-9a-f-]{36})', '((?:[^']|'')*)'::jsonb, ")
GRADE_RE = re.compile(r"^([A-Z]{1,5}[0-9]{1,4}[A-Z0-9]{0,4})\b")
DIM_RE = re.compile(
    r"^\s*φ?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:mm)?\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*(?:L|mm)?\s*$"
)


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def jname(ja: str) -> str:
    return q(json.dumps({"ja": ja, "en": ja}, ensure_ascii=False)) + "::jsonb"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    for a, b in (("Φ", "φ"), ("Ф", "φ"), ("ø", "φ"), ("Ø", "φ"),
                 ("×", "x"), ("*", "x"), ("X", "x"), ("ミリ", "mm")):
        s = s.replace(a, b)
    return s.strip()


def parse_rows(path: str):
    """020 アーティファクトから (legacy_key, name_ja) を取り出す。"""
    out = []
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            m = ROW_RE.match(line)
            if not m:
                continue
            name = json.loads(m.group(2).replace("''", "'"))
            out.append((m.group(1), name.get("ja", "")))
    return sorted(out)


def classify(ja: str):
    """→ ("material", grade, shape, finish, kind2, d_mm, l_mm)
       | ("type_only", grade, shape) | ("unconverted",)"""
    s = norm(ja)
    if not s or "・" in s:  # グレード列挙行などは変換しない
        return ("unconverted",)
    # NFKC 後も大文字化して先頭グレードを取る（ｋ40ｕｆ 等）
    m = GRADE_RE.match(s.upper())
    if not m:
        return ("unconverted",)
    grade = m.group(1)
    rest = s[len(grade):]

    # 形状推定
    upper = s.upper()
    if "円筒" in s:
        shape = "C"
    elif "OH" in upper or "穴" in s or re.search(r"\b[23]V30\b", upper) or re.search(r"\bCH\b", upper):
        shape = "B"
    else:
        shape = "A"

    # 黒皮・研磨
    has_black = "黒皮" in s
    has_polish = "研磨" in s or "センタレス" in s or "ｾﾝﾀﾚｽ" in ja
    finish = "C" if (has_black and has_polish) else "A" if has_black else "B" if has_polish else None

    # 形状別種類（素材行用）
    kind2 = None
    if shape == "A":
        kind2 = "A0"
    elif re.search(r"\b2V30\b", upper):
        kind2 = "B3"
    elif re.search(r"\bCH\b", upper):
        kind2 = "B5"

    # 素材化: 仕上げ・種類ワードを除いた残りが 1径×1全長 だけであること
    if finish is not None and kind2 is not None:
        stripped = rest
        for w in ("黒皮", "研磨済", "研磨", "センタレス済み素材", "センタレス",
                  "長材", "定尺材", "2V30", "2v30", "CH", "材"):
            stripped = stripped.replace(w, " ")
        dm = DIM_RE.match(stripped)
        if dm:
            d = float(dm.group(1))
            length = round(float(dm.group(2)))
            if 0.1 <= d <= 99.9 and round(d * 10) >= 1 and 1 <= length <= 999:
                return ("material", grade, shape, finish, kind2, d, length)
    return ("type_only", grade, shape)


def main() -> None:
    rows = parse_rows(SRC)

    parsed = [(lk, ja, classify(ja)) for lk, ja in rows]
    grades = sorted({c[1] for _, _, c in parsed if c[0] != "unconverted"})
    pseudo = [g for g in grades if g not in KNOWN_GRADES]
    if len(pseudo) > 99:
        raise SystemExit(f"pseudo grades exceed 99: {len(pseudo)}")
    grade_code = dict(KNOWN_GRADES)
    for i, g in enumerate(pseudo, start=1):
        grade_code[g] = (PSEUDO_MANUFACTURER, f"{i:02d}")

    type_code = {}  # (grade, shape) -> 材種コード
    for _, _, c in parsed:
        if c[0] == "unconverted":
            continue
        key = (c[1], c[2])
        mfr, gc = grade_code[c[1]]
        type_code.setdefault(key, f"{mfr}{gc}{c[2]}0001")

    materials = {}  # 素材コード -> (type_code, finish, dcode, lcode, kind2, d, l, name)
    converted = {}  # legacy_key -> 変換先コード
    for lk, ja, c in parsed:
        if c[0] == "unconverted":
            continue
        tcode = type_code[(c[1], c[2])]
        if c[0] == "material":
            _, grade, shape, finish, kind2, d, length = c
            dcode, lcode = f"{round(d * 10):03d}", f"{length:03d}"
            mcode = f"{tcode}-{finish}{dcode}-{lcode}"
            materials.setdefault(mcode, (tcode, finish, dcode, lcode, kind2, d, length, ja))
            converted[lk] = mcode
        else:
            converted[lk] = tcode

    n_mat = sum(1 for _, _, c in parsed if c[0] == "material")
    n_type = sum(1 for _, _, c in parsed if c[0] == "type_only")
    n_un = sum(1 for _, _, c in parsed if c[0] == "unconverted")

    w = []
    w.append("-- Generated by export_material_structuring.py — レガシー材種の構造化.")
    w.append(f"-- 入力 {len(rows)} 行: 素材まで {n_mat} / 材種のみ {n_type} / 未変換 {n_un}")
    w.append(f"-- 材種 {len(type_code)} / 素材 {len(materials)}（重複コードは先勝ち {n_mat - len(materials)} 行圧縮）")
    w.append("-- 冪等: ON CONFLICT DO NOTHING + 変換済みプレースホルダの無効化のみ。")
    w.append("BEGIN;")
    w.append("")

    w.append("-- 仮メーカー（レガシーグレードのメーカーは資料なし — 判明後は新コードで再登録）")
    w.append(
        "INSERT INTO app.material_manufacturers (code, name, updated_at) VALUES "
        f"('{PSEUDO_MANUFACTURER}', '{{\"ja\": \"未分類（レガシー）\", \"en\": \"Unclassified (legacy)\"}}'::jsonb, now()) "
        "ON CONFLICT (code) DO NOTHING;"
    )
    w.append("")

    w.append("-- メーカー材種（グレード）")
    grade_rows = [
        f"('{PSEUDO_MANUFACTURER}', '{grade_code[g][1]}', {jname(g)}, now())"
        for g in pseudo
    ]
    for i in range(0, len(grade_rows), BATCH):
        w.append("INSERT INTO app.material_manufacturer_grades (manufacturer_code, code, name, updated_at) VALUES")
        w.append(",\n".join(grade_rows[i : i + BATCH]))
        w.append("ON CONFLICT (manufacturer_code, code) DO NOTHING;")
    w.append("")

    w.append("-- 構造化材種（グレード×形状、種類=0001）")
    t_rows = []
    for (grade, shape), code in sorted(type_code.items(), key=lambda kv: kv[1]):
        mfr, gc = grade_code[grade]
        t_rows.append(
            f"({q(code)}, '{mfr}', '{gc}', '{shape}', '0001', {jname(grade)}, "
            "'{\"ja\": \"レガシー一括変換\", \"en\": \"Bulk-converted from legacy\"}'::jsonb, true, now())"
        )
    for i in range(0, len(t_rows), BATCH):
        w.append(
            "INSERT INTO app.material_types (code, manufacturer_code, grade_code, shape_code, kind_code, name, description, is_active, updated_at) VALUES"
        )
        w.append(",\n".join(t_rows[i : i + BATCH]))
        w.append("ON CONFLICT (code) DO NOTHING;")
    w.append("")

    w.append("-- 直径・全長 構成行")
    d_rows = sorted({(m[2], m[5]) for m in materials.values()})
    l_rows = sorted({(m[3], m[6]) for m in materials.values()})
    if d_rows:
        w.append("INSERT INTO app.material_diameters (code, diameter_mm, display_name, updated_at) VALUES")
        w.append(",\n".join(f"('{c}', {d}, {jname(f'φ{d}')}, now())" for c, d in d_rows))
        w.append("ON CONFLICT (code) DO NOTHING;")
    if l_rows:
        w.append("INSERT INTO app.material_length_variants (code, length_mm, display_name, updated_at) VALUES")
        w.append(",\n".join(f"('{c}', {n}, {jname(f'{n}mm')}, now())" for c, n in l_rows))
        w.append("ON CONFLICT (code) DO NOTHING;")
    w.append("")

    w.append("-- 素材（material_type_id は code から解決）")
    m_rows = []
    for mcode in sorted(materials):
        tcode, finish, dcode, lcode, kind2, d, length, ja = materials[mcode]
        m_rows.append(
            f"({q(mcode)}, (SELECT id FROM app.material_types WHERE code = {q(tcode)}), "
            f"'{finish}', '{dcode}', '{lcode}', '{kind2}', {d}, {length}, {jname(ja)}, '本', true, now())"
        )
    for i in range(0, len(m_rows), BATCH):
        w.append(
            "INSERT INTO app.materials (code, material_type_id, surface_finish_code, diameter_code, length_variant_code, kind_code, diameter_mm, length_mm, name, unit, is_active, updated_at) VALUES"
        )
        w.append(",\n".join(m_rows[i : i + BATCH]))
        w.append("ON CONFLICT (code) DO NOTHING;")
    w.append("")

    w.append("-- 変換済みプレースホルダを無効化（description に変換先コードを記録）")
    conv = sorted(converted.items())
    for i in range(0, len(conv), BATCH):
        pairs = ",\n".join(f"({q(lk)}, {q(code)})" for lk, code in conv[i : i + BATCH])
        w.append("UPDATE app.material_types t SET is_active = false, updated_at = now(),")
        w.append(
            "  description = jsonb_build_object('ja', '変換済 → ' || v.code, 'en', 'Converted → ' || v.code)"
        )
        w.append(f"FROM (VALUES\n{pairs}\n) AS v(legacy_key, code)")
        w.append("WHERE t.legacy_key = v.legacy_key;")
        w.append("")

    w.append("COMMIT;")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(w) + "\n")
    print(
        f"{OUT}: input {len(rows)} → material {n_mat} (unique {len(materials)}), "
        f"type_only {n_type}, unconverted {n_un}; grades {len(pseudo)}+{len(KNOWN_GRADES)}, types {len(type_code)}"
    )


if __name__ == "__main__":
    main()
