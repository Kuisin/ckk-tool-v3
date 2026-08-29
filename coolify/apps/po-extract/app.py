import base64, io, json, os, re, time
from dataclasses import dataclass
from datetime import date
import fitz  # PyMuPDF
import httpx
from fastapi import (
    Body, Depends, FastAPI, Header, UploadFile, File, Form, HTTPException,
)
from fastapi.responses import JSONResponse

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
# Stage 2: vision model reads the page image. Stage 3: LLM builds the JSON.
# Default both to the same model so the GPU never swaps mid-request (a swap to a
# different model adds minutes); set STRUCT_MODEL to a distinct text model only if
# you can keep both resident.
VISION_MODEL = os.environ.get("MODEL", "qwen2.5vl")
STRUCT_MODEL = os.environ.get("STRUCT_MODEL", VISION_MODEL)
MAX_PAGES = int(os.environ.get("MAX_PAGES", "5"))
OCR_ENABLED = os.environ.get("OCR_ENABLED", "true").lower() != "false"
RENDER_DPI = int(os.environ.get("RENDER_DPI", "200"))
# 描画後の長辺の範囲（px）。A4 を 200dpi で描くと約 2339px なので、その辺りを
# 基準に上下限だけ決める。大きすぎ＝入力肥大で不安定、小さすぎ＝文字が潰れる。
MAX_EDGE = int(os.environ.get("MAX_EDGE", "2400"))
MIN_EDGE = int(os.environ.get("MIN_EDGE", "1600"))
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "10m")
#
# ★ 上の env は「何も指定されなかったときの既定」であって、固定値ではない。
#   モデルの接続先はリクエストごとにヘッダ **X-AI-Config**（base64url の JSON）で
#   受け取り、ollama / OpenAI 互換 / Anthropic / Google Gemini を切り替えられる。
#   設定の正は nextjs-web 側（app.system_settings の ai_provider.*、画面は SY0E）で、
#   このサービスは DB を持たない。ヘッダが無ければ下の env どおり = 従来の挙動。
#   OCR（RapidOCR）は**常にローカル**。差し替わるのは vision 転写と JSON 構造化だけ。
#   実装は「Model backend」節、疎通確認は POST /probe。
#
# デプロイ: このディレクトリ（coolify/apps/po-extract/**）への push で
# Coolify が po-extract-dev（dev ブランチ）/ po-extract-main（main）を自動ビルドする。
# 手動で流すときは coolify/platform/deploy.sh po-extract-dev|po-extract-main。
#
# 自社名（注文書の「宛先」側）。顧客と取り違えないようプロンプトに埋める。
# 表記ゆれは列挙してよい（そのまま文中に出る）。
OWN_COMPANY = os.environ.get(
    "OWN_COMPANY",
    "シー・ケイ・ケー株式会社 (CKK / シーケイケー / C.K.K.)",
)

# Stage-3 system rules — the structuring LLM turns the two readings into DB JSON.
STRUCT_PROMPT = (
    "You convert a business document into JSON matching the provided schema. "
    "The document is usually Japanese.\n"
    "You are given two independent readings of the SAME document:\n"
    "  (A) an OCR text layer (accurate for exact characters, codes and digits), and\n"
    "  (B) a vision-model transcription (better for layout, tables and which value "
    "belongs to which field).\n"
    "Cross-check the two; prefer OCR for exact digits/codes and the vision reading "
    "for structure.\n"
    "- Numbers must be plain: no currency symbols or thousands separators "
    "(e.g. 609350, not ¥609,350). Quantities are integers.\n"
    "- Dates: output ISO YYYY-MM-DD when a full date is printed — convert Japanese "
    "forms (2026年2月16日 → 2026-02-16) and era dates (令和8年2月16日 → 2026-02-16). "
    "If the printed date is partial, keep it as printed.\n"
    "- Enum fields: pick one of the allowed values only when the document clearly "
    "states it; otherwise null.\n"
    "- Use only information present in the document. Set absent/unreadable fields to "
    "null. Never invent values.\n"
    "- Respond with JSON only."
)

VISION_PROMPT = (
    "Read this Japanese business document image and transcribe ALL of its content as "
    "plain text. Preserve the table structure: one line per row, columns separated by "
    "tabs. Include every label, code, quantity, unit price, amount and date exactly as "
    "shown. Output text only — no commentary, no JSON."
)

# ── JSON-Schema helpers ──────────────────────────────────────────────────
def _nullable(t):
    return {"type": [t, "null"]}

STR, NUM, INT = _nullable("string"), _nullable("number"), _nullable("integer")

def ENUM(*values):
    return {"type": ["string", "null"], "enum": [*values, None]}

# Every key is required (nullable) and extras are rejected, so the grammar-
# constrained output always has the exact shape the caller's types expect.
def OBJ(**props):
    return {
        "type": "object",
        "properties": props,
        "required": list(props),
        "additionalProperties": False,
    }

def ARR(item):
    return {"type": "array", "items": item}

# tables.md ORDER_TYPE
ORDER_TYPE = ENUM("PRODUCTION", "TEST", "SAMPLE", "OTHER")

SCHEMAS = {
    "order-request": OBJ(
        customer_name=STR, customer_branch=STR, customer_contact=STR,
        customer_order_ref=STR,
        order_date=STR, desired_delivery_date=STR, delivery_location=STR,
        payment_terms=STR,
        items=ARR(OBJ(
            product_name=STR, product_code=STR, version=STR,
            customization=STR, order_type=ORDER_TYPE,
            quantity=INT, unit=STR, unit_price=NUM, amount=NUM,
            delivery_date=STR, ship_to=STR, notes=STR,
        )),
        subtotal=NUM, tax_rate=NUM, tax_amount=NUM, total_amount=NUM, notes=STR,
    ),
    "quote": OBJ(
        issuer_name=STR, customer_name=STR, quote_number=STR,
        issue_date=STR, valid_until=STR,
        items=ARR(OBJ(product_name=STR, product_code=STR, quantity=INT,
                      unit_price=NUM, amount=NUM, delivery_date=STR)),
        subtotal=NUM, tax_amount=NUM, total_amount=NUM, notes=STR,
    ),
    "invoice": OBJ(
        supplier_name=STR, invoice_number=STR, issue_date=STR, due_date=STR,
        billing_period_from=STR, billing_period_to=STR,
        items=ARR(OBJ(description=STR, quantity=INT, unit_price=NUM, amount=NUM)),
        subtotal=NUM, tax_amount=NUM, total_amount=NUM, notes=STR,
    ),
    "delivery-note": OBJ(
        supplier_name=STR, delivery_number=STR, delivery_date=STR,
        items=ARR(OBJ(product_name=STR, product_code=STR, quantity=INT, unit=STR)),
        notes=STR,
    ),
    "purchase-order": OBJ(
        supplier_name=STR, po_number=STR, order_date=STR,
        items=ARR(OBJ(material_name=STR, material_code=STR, quantity=NUM, unit=STR,
                      unit_price=NUM, amount=NUM, expected_date=STR)),
        total_amount=NUM, notes=STR,
    ),
}

PROMPTS = {
    "order-request": (
        # 向き（どちらが顧客か）が最重要。注文書は相手の視点で書かれており、
        # 宛先（御中）＝自社、発行元・社判のある側＝顧客。ここを取り違えると
        # 顧客欄に自社名が入る（実際に起きた）。
        "This is a purchase order (注文書) that a CUSTOMER issued and sent TO US. "
        "Everything on it is written from the customer's point of view, so read the "
        "two sides carefully.\n"
        f"- WE are the recipient (the addressee). Our company is {OWN_COMPANY}. "
        "On the document we usually appear at the top next to 「御中」/「様」, or after "
        "宛先/送付先/発注先/仕入先/供給者/Supplier/Vendor/To. NEVER return our own "
        "company in customer_name — if the name you are about to return matches "
        "ours, you picked the wrong side.\n"
        "- customer_name is the OTHER party: the company that ISSUED the order and "
        "will be billed. It is usually printed near 発行元/注文者/発注元/購入者/買主/"
        "Buyer/From, or in the block with the company seal (印/社判), address and "
        "phone, often at the bottom-right. Return that company's full legal name as "
        "printed.\n"
        "- customer_contact is that customer's contact person (担当/担当者), if printed.\n"
        "- order_type per item: PRODUCTION (本番/量産), TEST (テスト/試作), "
        "SAMPLE (サンプル/無償), OTHER (その他); null when not stated.\n"
        "- version per item: drawing/revision number (版数, Rev, 図番改訂), if printed.\n"
        "- customization per item: special/custom work requested for that line "
        "(追加加工, 特記仕様, カスタム内容), verbatim.\n"
        "- ship_to per item: line-specific delivery destination (直送先, 届け先) when "
        "it differs per line; leave null if the document only has one delivery "
        "location (use delivery_location for that).\n"
        "- tax_rate is the consumption-tax percentage as a number (e.g. 10 for 10%)."
    ),
    "quote": "This is a price quotation (見積書).",
    "invoice": "This is an invoice (請求書).",
    "delivery-note": "This is a delivery note (納品書).",
    "purchase-order": "This is a material purchase order (発注書).",
}

# ── Text tasks (no document) ─────────────────────────────────────────────
#
# /extract* は「紙 → JSON」。こちらは **紙が無い** 補助タスクの口で、アプリ側の
# 道具（マスタのキーワード生成など）が使う。OCR も vision も通らず、構造化 LLM
# （STRUCT_MODEL）を 1 回叩くだけなので速い（数秒）。入力は JSON をそのまま
# プロンプトへ載せる。新しい道具を足すときは TASK_SCHEMAS / TASK_PROMPTS に
# 1 組を追加する（呼び出し側が自前のスキーマを持つなら POST /generate でよい）。

STR_LIST = {"type": "array", "items": {"type": "string"}}

TASK_SCHEMAS = {
    "keywords": OBJ(keywords=STR_LIST),
}

TASK_PROMPTS = {
    "keywords": (
        "You generate search keywords (検索キーワード) for ONE master-data record "
        "in a Japanese manufacturing company's system (carbide cutting tools and "
        "the bar stock they are made from).\n"
        "The input JSON describes the record: `kind` (product / material), `name`, "
        "`code`, `attributes` (label/value pairs) and `existing` (keywords already "
        "registered).\n"
        "The keywords are used two ways: staff type them into a search box, and the "
        "document AI uses them to resolve a name printed on a customer's order to "
        "this record. So return the ways THIS item is actually written or called:\n"
        "- readings of the kanji (ひらがな / カタカナ) and romaji\n"
        "- the Japanese and English word for the same thing\n"
        "- common abbreviations and shop-floor shorthand\n"
        "- other notations of the code and the dimensions (φ8.3, 8.3mm, Φ８．３)\n"
        "- meaningful fragments of the code or model number\n"
        "Rules: only forms that plausibly refer to THIS record — never invent specs, "
        "materials, makers or model numbers that are not in the input. No duplicates, "
        "nothing already in `existing`, and no bare generic word that would match "
        "thousands of records (「製品」「材料」 alone). 1–32 characters each, 5–15 "
        "keywords, most useful first. Respond with JSON only."
    ),
}

app = FastAPI(title="Document / text → JSON")

# ── Stage 1: OCR — PaddleOCR's PP-OCR models on ONNXRuntime (RapidOCR) ─────
# (PaddlePaddle's native inference SIGSEGVs on this host; RapidOCR runs the same
#  PP-OCR models via ONNXRuntime, stable in containers.)
_engine = None

def _get_ocr():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine

def _ocr_layout(png: bytes) -> str:
    result, _elapse = _get_ocr()(png)
    if not result:
        return ""
    boxes = []
    for box, text, _score in result:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        cy = (min(ys) + max(ys)) / 2.0
        bh = max(ys) - min(ys)
        boxes.append((cy, min(xs), bh, text))
    boxes.sort(key=lambda b: (b[0], b[1]))
    rows: list[dict] = []
    for cy, cx, bh, text in boxes:
        if rows and abs(cy - rows[-1]["cy"]) <= max(8.0, 0.6 * bh):
            rows[-1]["cells"].append((cx, text))
        else:
            rows.append({"cy": cy, "cells": [(cx, text)]})
    return "\n".join(
        "\t".join(t for _, t in sorted(r["cells"], key=lambda c: c[0]))
        for r in rows
    )

def _safe_ocr(png: bytes) -> str:
    try:
        return _ocr_layout(png)
    except Exception:
        return ""

# ── Page rendering ───────────────────────────────────────────────────────
def _pdf_pngs(data: bytes) -> list[bytes]:
    """PDF → ページごとの PNG。長辺を一定の範囲に収めてから描画する。"""
    out, doc = [], fitz.open(stream=data, filetype="pdf")
    for page in doc[:MAX_PAGES]:
        scale = RENDER_DPI / 72
        # 大きすぎる原稿はモデルへの入力が肥大して不安定になり、小さすぎる原稿は
        # 文字が潰れる。長辺が [MIN_EDGE, MAX_EDGE] に収まるよう倍率を調整する。
        long_pt = max(page.rect.width, page.rect.height) or 1
        scale = min(scale, MAX_EDGE / long_pt)
        scale = max(scale, min(MIN_EDGE / long_pt, RENDER_DPI / 72))
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        out.append(pix.tobytes("png"))
    doc.close()
    return out

def _page_pngs(file: UploadFile) -> list[bytes]:
    """
    入力を **1 つの形（アルファ無し PNG・一定サイズ）** に揃えてから処理へ渡す。

    以前は PDF だけ描画し、画像はアップロードされたまま素通ししていた。
    スマホ写真（4000px 超・EXIF 回転・JPEG）と 200dpi のスキャン PDF が同じ
    パイプラインに混ざり、モデルが見るものが毎回違っていた（抽出が不安定に
    なる原因）。画像も一度 PDF に通してから同じ描画経路に載せる。
    """
    data = file.file.read()
    if not data:
        raise HTTPException(400, "empty file")
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        return _pdf_pngs(data)
    # 画像 → PDF → PNG。convert_to_pdf() が EXIF の向きも解決してくれる。
    try:
        with fitz.open(stream=data, filetype=name.rsplit(".", 1)[-1] or None) as img:
            return _pdf_pngs(img.convert_to_pdf())
    except Exception as e:  # 未知の形式は元のバイト列で試す（従来動作）
        print(f"[normalize] image → pdf failed ({e}); passing through", flush=True)
        return [data]

# ── Model backend (provider-neutral) ─────────────────────────────────────
#
# モデルを呼ぶ口はここ 1 つだけ（_chat）。OCR は常にローカルのままで、
# 差し替わるのは vision 転写と JSON 構造化の 2 段だけ。
#
# 接続先は **リクエストごと**にヘッダ X-AI-Config（base64url の JSON）で来る。
# ヘッダが無ければ従来どおり env の ollama 既定 — 既存の呼び出し元は 1 行も
# 変えずに今までどおり動く。
#
# なぜ body ではなくヘッダか: /generate/{task} は input を省くと **body の残り
# 全部をモデルへの入力とみなす**（下の generate_task 参照）。body に API トークンを
# 置くと、それがそのままプロンプトに載ってモデルへ送られてしまう。
#
# SDK は入れない（httpx だけ）。4 プロバイダの差分は URL・認証ヘッダ・画像の
# 包み方・スキーマ強制の書き方の 4 点しかなく、SDK を 3 つ抱えるより小さい。

PROVIDERS = ("ollama", "openai", "anthropic", "gemini")
PROVIDER_BASE_DEFAULTS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com",
}
ANTHROPIC_VERSION = "2023-06-01"
CHAT_TIMEOUT = int(os.environ.get("AI_TIMEOUT", "600"))


@dataclass(frozen=True)
class AIConfig:
    provider: str
    base_url: str
    api_key: str | None
    vision_model: str
    struct_model: str
    max_output_tokens: int = 8192


class AIError(Exception):
    """kind は nextjs-web 側の分類キー（lib/intake-extract-error.ts）と 1:1。

    detail 文字列を `ai_<kind>: <message>` に固定してあるので、アプリ側は
    HTTP ステータスではなく接頭辞を見て原因を出し分けられる（429 は
    po-extract 自身の混雑でも起きるため、ステータスだけでは足りない）。
    """

    def __init__(self, kind: str, message: str, status: int | None = None):
        self.kind, self.message, self.status = kind, message, status
        super().__init__(f"ai_{kind}: {message}")


def _resolve_ai(raw: str | None) -> AIConfig:
    if not raw:
        return AIConfig("ollama", OLLAMA_URL, None, VISION_MODEL, STRUCT_MODEL)
    try:
        pad = "=" * (-len(raw) % 4)
        cfg = json.loads(base64.urlsafe_b64decode(raw + pad).decode("utf-8"))
    except Exception:
        raise AIError("not_configured", "X-AI-Config is not valid base64url JSON")
    if not isinstance(cfg, dict) or cfg.get("v") != 1:
        raise AIError("not_configured", f"unsupported X-AI-Config version {cfg.get('v') if isinstance(cfg, dict) else '?'}")
    p = (cfg.get("provider") or "ollama").strip()
    if p not in PROVIDERS:
        raise AIError("not_configured", f"unknown provider '{p}'")
    base = (cfg.get("baseUrl") or "").strip().rstrip("/")
    vision = (cfg.get("visionModel") or "").strip()
    struct = (cfg.get("structModel") or "").strip() or vision
    key = (cfg.get("apiKey") or "").strip() or None
    try:
        max_out = int(cfg.get("maxOutputTokens") or 8192)
    except (TypeError, ValueError):
        max_out = 8192
    if p == "ollama":
        # ローカルは env の既定で埋める（認証付き ollama もあり得るので key は通す）。
        return AIConfig(p, base or OLLAMA_URL, key,
                        vision or VISION_MODEL, struct or STRUCT_MODEL, max_out)
    # 外部プロバイダで部品が欠けていたら **ollama に落とさず失敗させる**。
    # 黙って落とすと「設定したのに効いていない」が一番わかりにくい形で出る。
    if not key:
        raise AIError("not_configured", f"{p}: API token is not set")
    if not struct:
        raise AIError("not_configured", f"{p}: model name is not set")
    return AIConfig(p, base or PROVIDER_BASE_DEFAULTS[p], key,
                    vision or struct, struct, max_out)


def ai_config(x_ai_config: str | None = Header(default=None)) -> AIConfig:
    return _resolve_ai(x_ai_config)


# ── JSON Schema dialects ─────────────────────────────────────────────────
#
# 既存の OBJ() は required に全キーを並べ additionalProperties:False を付ける
# ので、OpenAI strict と Anthropic の structured outputs には**無変換で通る**。
# 変換が要るのは Gemini（型の配列・additionalProperties を受けない）と、
# 念のための Anthropic（型の配列より anyOf が確実）だけ。

def _schema_openai(s):
    if not isinstance(s, dict):
        return s
    out = dict(s)
    if "properties" in out:
        out["properties"] = {k: _schema_openai(v) for k, v in out["properties"].items()}
        out["required"] = list(out["properties"])
        out["additionalProperties"] = False
    if "items" in out:
        out["items"] = _schema_openai(out["items"])
    return out


def _schema_anthropic(s):
    if not isinstance(s, dict):
        return s
    out = dict(s)
    t = out.get("type")
    if isinstance(t, list):
        non_null = [x for x in t if x != "null"]
        enum = [e for e in (out.get("enum") or []) if e is not None]
        base = {k: v for k, v in out.items() if k not in ("type", "enum")}
        variants = []
        for x in non_null:
            v = dict(base, type=x)
            if enum:
                v["enum"] = enum
            variants.append(v)
        if "null" in t:
            variants.append({"type": "null"})
        if len(variants) == 1:
            out = variants[0]
        else:
            return {"anyOf": [_schema_anthropic(v) for v in variants]}
    if "properties" in out:
        out["properties"] = {k: _schema_anthropic(v) for k, v in out["properties"].items()}
    if "items" in out:
        out["items"] = _schema_anthropic(out["items"])
    return out


# Gemini は OpenAPI 3.0 の部分集合。型は列挙値（大文字）で、union も
# additionalProperties も無い。enum は文字列だけなので None は落とす。
_GEMINI_TYPES = {"string": "STRING", "number": "NUMBER", "integer": "INTEGER",
                 "boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT"}


def _schema_gemini(s):
    if not isinstance(s, dict):
        return s
    t, nullable = s.get("type"), False
    if isinstance(t, list):
        non_null = [x for x in t if x != "null"]
        nullable = "null" in t
        t = non_null[0] if non_null else "string"
    out = {}
    if t is not None:
        out["type"] = _GEMINI_TYPES.get(t, str(t).upper())
    if "description" in s:
        out["description"] = s["description"]
    if "enum" in s:
        values = [x for x in s["enum"] if x is not None]
        if values:
            out["enum"] = [str(x) for x in values]
        if len(values) != len(s["enum"]):
            nullable = True
    if nullable:
        out["nullable"] = True
    if "properties" in s:
        out["properties"] = {k: _schema_gemini(v) for k, v in s["properties"].items()}
    if "required" in s:
        out["required"] = list(s["required"])
    if "items" in s:
        out["items"] = _schema_gemini(s["items"])
    return out


def _dialect(fmt, provider):
    if fmt is None:
        return None
    return {"openai": _schema_openai, "anthropic": _schema_anthropic,
            "gemini": _schema_gemini}.get(provider, lambda x: x)(fmt)


# ── Request shaping / response reading (pure — no I/O) ───────────────────
def _build_chat(cfg: AIConfig, model: str, content: str,
                images: list[str] | None, fmt: dict | None):
    p = cfg.provider
    schema = _dialect(fmt, p)

    if p == "ollama":
        msg = {"role": "user", "content": content}
        if images:
            msg["images"] = images          # ollama は素の base64
        body = {"model": model, "stream": False, "keep_alive": KEEP_ALIVE,
                "options": {"temperature": 0}, "messages": [msg]}
        if schema is not None:
            body["format"] = schema
        headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
        return f"{cfg.base_url}/api/chat", headers, body

    if p == "openai":
        if images:                          # OpenAI は data URL
            parts = [{"type": "text", "text": content}]
            parts += [{"type": "image_url",
                       "image_url": {"url": f"data:image/png;base64,{b}"}}
                      for b in images]
            msg_content = parts
        else:
            msg_content = content
        body = {"model": model, "temperature": 0,
                "messages": [{"role": "user", "content": msg_content}]}
        if schema is not None:
            body["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "result", "schema": schema, "strict": True}}
        return (f"{cfg.base_url}/chat/completions",
                {"Authorization": f"Bearer {cfg.api_key}"}, body)

    if p == "anthropic":
        blocks = [{"type": "image",
                   "source": {"type": "base64", "media_type": "image/png", "data": b}}
                  for b in (images or [])]
        blocks.append({"type": "text", "text": content})
        # temperature は送らない — 新しいモデルは 400 で拒否する。
        # max_tokens は必須（他 3 つには無い）。
        body = {"model": model, "max_tokens": cfg.max_output_tokens,
                "messages": [{"role": "user", "content": blocks}]}
        if schema is not None:
            body["output_config"] = {"format": {"type": "json_schema", "schema": schema}}
        return (f"{cfg.base_url}/v1/messages",
                {"x-api-key": cfg.api_key or "", "anthropic-version": ANTHROPIC_VERSION},
                body)

    if p == "gemini":
        parts = [{"text": content}]
        parts += [{"inline_data": {"mime_type": "image/png", "data": b}}
                  for b in (images or [])]
        gen = {"temperature": 0}
        if schema is not None:
            gen["responseMimeType"] = "application/json"
            gen["responseSchema"] = schema
        body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen}
        # キーは URL ではなくヘッダに置く（例外の repr やリダイレクトに載せない）。
        return (f"{cfg.base_url}/v1beta/models/{model}:generateContent",
                {"x-goog-api-key": cfg.api_key or ""}, body)

    raise AIError("not_configured", f"unknown provider '{p}'")


def _parse_chat(cfg: AIConfig, data: dict) -> str:
    p = cfg.provider
    try:
        if p == "ollama":
            return data["message"]["content"]
        if p == "openai":
            return data["choices"][0]["message"]["content"] or ""
        if p == "anthropic":
            blocks = data.get("content") or []
            texts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
            if texts:
                return "".join(texts)
            for b in blocks:                        # tool 経由で返ってきた場合
                if b.get("type") == "tool_use":
                    return json.dumps(b.get("input"), ensure_ascii=False)
            return ""
        if p == "gemini":
            blocked = (data.get("promptFeedback") or {}).get("blockReason")
            if blocked:
                raise AIError("upstream", f"gemini blocked the request ({blocked})")
            cand = (data.get("candidates") or [{}])[0]
            parts = (cand.get("content") or {}).get("parts") or []
            return "".join(x.get("text", "") for x in parts)
    except AIError:
        raise
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        raise AIError("upstream", f"unexpected {p} response shape: {e}")
    raise AIError("not_configured", f"unknown provider '{p}'")


def _http_ai_error(cfg: AIConfig, r: httpx.Response) -> AIError:
    body, s = (r.text or "")[:400], r.status_code
    if s in (401, 403):
        return AIError("auth", f"{cfg.provider} rejected the API token (HTTP {s})", s)
    if s == 404:
        return AIError("model_not_found",
                       f"{cfg.provider} has no such model or endpoint (HTTP 404): {body}", s)
    if s in (402,):
        return AIError("rate_limit", f"{cfg.provider} reports insufficient credit (HTTP 402)", s)
    if s == 429:
        return AIError("rate_limit", f"{cfg.provider} rate limit reached (HTTP 429)", s)
    if s == 400 and re.search(r"image|vision|multimodal", body, re.I):
        return AIError("no_vision", f"{cfg.provider} model cannot read images: {body}", s)
    if s == 400 and re.search(r"schema|response_format|responseSchema|output_config", body, re.I):
        return AIError("bad_schema", f"{cfg.provider} rejected the schema: {body}", s)
    if s >= 500:
        return AIError("upstream", f"{cfg.provider} error (HTTP {s}): {body}", s)
    return AIError("upstream", f"{cfg.provider} HTTP {s}: {body}", s)


def _chat_once(cfg: AIConfig, model: str, content: str,
               images: list[str] | None, fmt: dict | None) -> str:
    url, headers, body = _build_chat(cfg, model, content, images, fmt)
    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=CHAT_TIMEOUT) as client:
            r = client.post(url, headers=headers, json=body)
    except httpx.TimeoutException:
        raise AIError("upstream", f"{cfg.provider} timed out after {CHAT_TIMEOUT}s")
    except httpx.RequestError as e:
        raise AIError("unreachable", f"{cfg.provider} unreachable: {type(e).__name__}")
    ms = int((time.monotonic() - t0) * 1000)
    # トークンは絶対に出さない（provider / model / status / 所要だけ）。
    print(f"[ai] provider={cfg.provider} model={model} status={r.status_code} ms={ms}",
          flush=True)
    if r.status_code >= 400:
        raise _http_ai_error(cfg, r)
    try:
        data = r.json()
    except ValueError:
        raise AIError("upstream", f"{cfg.provider} returned a non-JSON body")
    return _parse_chat(cfg, data)


def _chat(cfg: AIConfig, model: str, content: str,
          images: list[str] | None, fmt: dict | None) -> str:
    """唯一のモデル呼び出し。戻り値は常に「JSON 文字列 or 素のテキスト」。"""
    try:
        return _chat_once(cfg, model, content, images, fmt)
    except AIError as e:
        # スキーマを受けないモデルでも、プロンプトで形を指示すれば大抵通る。
        # 1 回だけ落として試す（成否は _loads の寛容パースが受け止める）。
        if e.kind == "bad_schema" and fmt is not None:
            print("[ai] schema rejected → prompt-level fallback", flush=True)
            hint = ("\n\nRespond with JSON only, matching exactly this JSON Schema:\n"
                    + json.dumps(fmt, ensure_ascii=False))
            return _chat_once(cfg, model, content + hint, images, None)
        raise


# モデルが JSON を ``` で包むことがあるので、素の json.loads より寛容に読む。
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.I)


def _loads(text: str):
    s = _FENCE.sub("", (text or "").strip()).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    for op, cl in (("{", "}"), ("[", "]")):
        i, j = s.find(op), s.rfind(cl)
        if i != -1 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise json.JSONDecodeError("no JSON value found in model output", s or "", 0)


# vision 段だけは「落ちても OCR で続行」でよい — ただし**設定の誤り**は別。
# 401 やモデル名違いまで握り潰すと、黙って精度の落ちた結果が出てどこにも
# エラーが残らない（ローカル GPU 前提の頃は起こり得なかった失敗）。
_VISION_FATAL = {"auth", "model_not_found", "no_vision", "not_configured", "bad_schema"}


def _vision_transcribe(cfg: AIConfig, images: list[str]) -> str:
    try:
        return _chat(cfg, cfg.vision_model, VISION_PROMPT, images, None)
    except AIError as e:
        if e.kind in _VISION_FATAL:
            raise
        print(f"[ai] vision stage degraded ({e}); continuing with OCR only", flush=True)
        return ""
    except Exception as e:  # 想定外は従来どおり握り潰して OCR で続行
        print(f"[ai] vision stage degraded ({e}); continuing with OCR only", flush=True)
        return ""

# ── Text normalization (non-destructive) ─────────────────────────────────
# Full-width ASCII (１２３ＡＢ－／) → half-width; kana/kanji untouched.
_FW = {i: i - 0xFEE0 for i in range(0xFF01, 0xFF5F)}
_FW[0x3000] = 0x20  # ideographic space

_DATE_KEY = re.compile(r"(^date$|_date$|_from$|_to$|^valid_until$)")
_DATE_YMD = re.compile(r"^(\d{4})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?$")
_DATE_ERA = re.compile(r"^(令和|平成|昭和|R|H|S)\s*(\d{1,2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?$")
_ERA_BASE = {"令和": 2018, "R": 2018, "平成": 1988, "H": 1988, "昭和": 1925, "S": 1925}

def _norm_date(s: str) -> str:
    m = _DATE_YMD.match(s)
    if m:
        y, mo, d = (int(g) for g in m.groups())
    else:
        m = _DATE_ERA.match(s)
        if not m:
            return s
        y = _ERA_BASE[m.group(1)] + int(m.group(2))
        mo, d = int(m.group(3)), int(m.group(4))
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return s

def _normalize(obj, key=None):
    if isinstance(obj, dict):
        return {k: _normalize(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize(v, key) for v in obj]
    if isinstance(obj, str):
        s = obj.translate(_FW).strip()
        if not s:
            return None
        if key and _DATE_KEY.search(key):
            s = _norm_date(s)
        return s
    return obj

# ── Numeric reconciliation (non-destructive) ─────────────────────────────
def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def _reconcile(obj):
    if not isinstance(obj, dict):
        return obj
    items = obj.get("items")
    if isinstance(items, list):
        for it in items:
            if not isinstance(it, dict):
                continue
            q, up, am = _num(it.get("quantity")), _num(it.get("unit_price")), _num(it.get("amount"))
            if am is None and q is not None and up is not None:
                it["amount"] = q * up
            elif up is None and am is not None and q:
                it["unit_price"] = round(am / q, 2)
        amounts = [a for a in (_num(it.get("amount")) for it in items if isinstance(it, dict)) if a is not None]
        if obj.get("subtotal") is None and amounts:
            obj["subtotal"] = sum(amounts)
    sub, tax, tot = _num(obj.get("subtotal")), _num(obj.get("tax_amount")), _num(obj.get("total_amount"))
    rate = _num(obj.get("tax_rate"))
    if tax is None and sub is not None:
        if tot is not None and tot >= sub:
            tax = obj["tax_amount"] = round(tot - sub, 2)
        elif rate is not None:
            tax = obj["tax_amount"] = round(sub * rate / 100, 2)
    if tot is None and sub is not None:
        obj["total_amount"] = sub + (tax or 0)
    return obj

# ── Pipeline: (1) OCR + (2) vision read → (3) text LLM builds JSON ────────
def _pipeline(cfg: AIConfig, file: UploadFile, fmt: dict, hint: str):
    pages = _page_pngs(file)
    images = [base64.b64encode(p).decode() for p in pages]

    ocr_chunks = []
    if OCR_ENABLED:
        for i, p in enumerate(pages):
            t = _safe_ocr(p)
            if t:
                ocr_chunks.append((f"[Page {i + 1}]\n" if len(pages) > 1 else "") + t)
    ocr_text = "\n\n".join(ocr_chunks)
    vision_text = _vision_transcribe(cfg, images)

    content = STRUCT_PROMPT + (f"\n{hint}" if hint else "")
    content += "\n\n=== (A) OCR text layer ===\n" + (ocr_text or "(none)")
    content += "\n\n=== (B) Vision transcription ===\n" + (vision_text or "(none)")
    out = _chat(cfg, cfg.struct_model, content, None, fmt)
    try:
        return _reconcile(_normalize(_loads(out)))
    except json.JSONDecodeError:
        raise HTTPException(502, "structuring model did not return valid JSON")

# ── Text-only pipeline: LLM builds JSON from a JSON input ────────────────
#
# 抽出側の _normalize は使わない。あちらは紙から読んだ字を整える（全角→半角）
# のが仕事だが、ここで作るのは**キーワードのような表記そのもの**で、全角と
# 半角の違いに意味がある。空文字を落とし前後の空白を取るだけに留める。
def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        cleaned = [_clean(v) for v in obj]
        return [v for v in cleaned if v not in (None, "")]
    if isinstance(obj, str):
        return obj.strip()
    return obj

def _text_task(cfg: AIConfig, fmt: dict, prompt: str, payload):
    content = prompt + "\n\n=== input ===\n" + json.dumps(
        payload, ensure_ascii=False, indent=2, default=str
    )
    out = _chat(cfg, cfg.struct_model, content, None, fmt)
    try:
        return _clean(_loads(out))
    except json.JSONDecodeError:
        raise HTTPException(502, "generation model did not return valid JSON")

# AIError は必ず 502 + detail "ai_<kind>: ..." で返す。ステータスを増やさない
# のは、アプリ側（lib/intake-extract-error.ts）が既に detail を読んで分類して
# いるため — 接頭辞に寄せるほうが波及が小さい。
@app.exception_handler(AIError)
def _ai_error_handler(request, exc: "AIError"):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


# ── Routes ───────────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz():
    # ここが申告するのは **何も指定されなかったときの既定**。実際の接続先は
    # リクエストごとに X-AI-Config で来る。トークンの有無は返さない
    # （この口は網内から誰でも叩けるため）。
    return {"status": "ok", "vision_model": VISION_MODEL,
            "struct_model": STRUCT_MODEL, "ocr": OCR_ENABLED,
            "ocr_engine": "rapidocr-onnxruntime (PP-OCR)",
            "document_types": sorted(SCHEMAS),
            "tasks": sorted(TASK_SCHEMAS),
            "ai": {"default_provider": "ollama",
                   "default_base_url": OLLAMA_URL,
                   "supported_providers": list(PROVIDERS),
                   "config_source": "env default; per-request override via X-AI-Config"}}

@app.get("/schemas")
def schemas():
    return SCHEMAS

@app.get("/tasks")
def tasks():
    return TASK_SCHEMAS

@app.post("/extract")
def extract(
    file: UploadFile = File(...),
    schema: str = Form(...),
    prompt: str = Form(""),
    cfg: AIConfig = Depends(ai_config),
):
    try:
        fmt = json.loads(schema)
    except json.JSONDecodeError:
        raise HTTPException(400, "schema must be a valid JSON Schema string")
    return _pipeline(cfg, file, fmt, prompt)

@app.post("/extract/{doc_type}")
def extract_typed(
    doc_type: str,
    file: UploadFile = File(...),
    prompt: str | None = Form(None),
    cfg: AIConfig = Depends(ai_config),
):
    fmt = SCHEMAS.get(doc_type)
    if fmt is None:
        raise HTTPException(404, f"unknown document type '{doc_type}'; available: {sorted(SCHEMAS)}")
    return _pipeline(cfg, file, fmt, prompt or PROMPTS.get(doc_type, ""))

# 紙のない補助タスク（アプリの道具から呼ぶ）。JSON body:
#   { "input": <任意の JSON>, "prompt": "<追加指示・任意>" }
@app.post("/generate/{task}")
def generate_task(task: str, body: dict = Body(default={}),
                  cfg: AIConfig = Depends(ai_config)):
    fmt = TASK_SCHEMAS.get(task)
    if fmt is None:
        raise HTTPException(404, f"unknown task '{task}'; available: {sorted(TASK_SCHEMAS)}")
    prompt = TASK_PROMPTS.get(task, "")
    extra = body.get("prompt")
    if isinstance(extra, str) and extra.strip():
        prompt = f"{prompt}\n{extra.strip()}"
    # input を省いたら body 全体を入力とみなす（呼び出し側の手間を減らす）。
    payload = body.get("input", {k: v for k, v in body.items() if k != "prompt"})
    return _text_task(cfg, fmt, prompt, payload)

# 呼び出し側が自前のスキーマを持つ場合。JSON body:
#   { "prompt": "<指示>", "schema": <JSON Schema>, "input": <任意の JSON・任意> }
@app.post("/generate")
def generate(body: dict = Body(...), cfg: AIConfig = Depends(ai_config)):
    fmt = body.get("schema")
    if not isinstance(fmt, dict):
        raise HTTPException(400, "schema must be a JSON Schema object")
    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(400, "prompt is required")
    return _text_task(cfg, fmt, prompt.strip(), body.get("input"))


# 1x1 の白 PNG。画像入力に対応しているかを最小コストで確かめるためだけのもの。
_PROBE_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)


# 接続テスト（SY0E の「接続テスト」ボタン）。**アプリからではなく po-extract
# から**叩くのが要点 — 実際に外へ出るのはこのコンテナなので、nextjs-web から
# プロバイダに届いても意味がない（届くのに抽出は失敗する、が起こり得る）。
#
# 構造化と画像読み取りを別々に報告する。画像だけ失敗する構成は、放っておくと
# 「OCR だけの劣化した抽出」として静かに現れるので、ここで見えるようにする。
@app.post("/probe")
def probe(cfg: AIConfig = Depends(ai_config)):
    def stage(model: str, run):
        t0 = time.monotonic()
        try:
            run()
            return {"ok": True, "ms": int((time.monotonic() - t0) * 1000), "model": model}
        except AIError as e:
            return {"ok": False, "ms": int((time.monotonic() - t0) * 1000),
                    "model": model, "error": str(e)[:300]}
        except Exception as e:
            return {"ok": False, "ms": int((time.monotonic() - t0) * 1000),
                    "model": model, "error": f"ai_upstream: {e}"[:300]}

    return {
        "provider": cfg.provider,
        # スキーマ強制の経路（方言変換込み）もここで一緒に検証される。
        "struct": stage(cfg.struct_model, lambda: _loads(
            _chat(cfg, cfg.struct_model, 'Reply with {"ok":"ok"}.', None, OBJ(ok=STR)))),
        "vision": stage(cfg.vision_model, lambda: _chat(
            cfg, cfg.vision_model, "Reply with the word ok.", [_PROBE_PNG_B64], None)),
    }
