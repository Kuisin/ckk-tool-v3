import base64, io, json, os, re
from datetime import date
import fitz  # PyMuPDF
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException

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
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "10m")

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
        "This is a customer purchase order (注文書). Extract the ordering customer, "
        "their order reference number, and every ordered line item.\n"
        "- customer_contact is the customer's contact person (担当/担当者), if printed.\n"
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

app = FastAPI(title="Document → JSON")

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
    out, doc = [], fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
    for page in doc[:MAX_PAGES]:
        out.append(page.get_pixmap(matrix=mat).tobytes("png"))
    doc.close()
    return out

def _page_pngs(file: UploadFile) -> list[bytes]:
    data = file.file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if (file.filename or "").lower().endswith(".pdf"):
        return _pdf_pngs(data)
    return [data]

# ── Ollama calls ─────────────────────────────────────────────────────────
def _ollama(model: str, content: str, images: list[str] | None, fmt: dict | None):
    msg = {"role": "user", "content": content}
    if images:
        msg["images"] = images
    payload = {"model": model, "stream": False, "keep_alive": KEEP_ALIVE,
               "options": {"temperature": 0}, "messages": [msg]}
    if fmt is not None:
        payload["format"] = fmt
    with httpx.Client(timeout=600) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        return r.json()["message"]["content"]

def _vision_transcribe(images: list[str]) -> str:
    try:
        return _ollama(VISION_MODEL, VISION_PROMPT, images, None)
    except Exception:
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
def _pipeline(file: UploadFile, fmt: dict, hint: str):
    pages = _page_pngs(file)
    images = [base64.b64encode(p).decode() for p in pages]

    ocr_chunks = []
    if OCR_ENABLED:
        for i, p in enumerate(pages):
            t = _safe_ocr(p)
            if t:
                ocr_chunks.append((f"[Page {i + 1}]\n" if len(pages) > 1 else "") + t)
    ocr_text = "\n\n".join(ocr_chunks)
    vision_text = _vision_transcribe(images)

    content = STRUCT_PROMPT + (f"\n{hint}" if hint else "")
    content += "\n\n=== (A) OCR text layer ===\n" + (ocr_text or "(none)")
    content += "\n\n=== (B) Vision transcription ===\n" + (vision_text or "(none)")
    out = _ollama(STRUCT_MODEL, content, None, fmt)
    try:
        return _reconcile(_normalize(json.loads(out)))
    except json.JSONDecodeError:
        raise HTTPException(502, "structuring model did not return valid JSON")

# ── Routes ───────────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz():
    return {"status": "ok", "vision_model": VISION_MODEL,
            "struct_model": STRUCT_MODEL, "ocr": OCR_ENABLED,
            "ocr_engine": "rapidocr-onnxruntime (PP-OCR)",
            "document_types": sorted(SCHEMAS)}

@app.get("/schemas")
def schemas():
    return SCHEMAS

@app.post("/extract")
def extract(
    file: UploadFile = File(...),
    schema: str = Form(...),
    prompt: str = Form(""),
):
    try:
        fmt = json.loads(schema)
    except json.JSONDecodeError:
        raise HTTPException(400, "schema must be a valid JSON Schema string")
    return _pipeline(file, fmt, prompt)

@app.post("/extract/{doc_type}")
def extract_typed(
    doc_type: str,
    file: UploadFile = File(...),
    prompt: str | None = Form(None),
):
    fmt = SCHEMAS.get(doc_type)
    if fmt is None:
        raise HTTPException(404, f"unknown document type '{doc_type}'; available: {sorted(SCHEMAS)}")
    return _pipeline(file, fmt, prompt or PROMPTS.get(doc_type, ""))
