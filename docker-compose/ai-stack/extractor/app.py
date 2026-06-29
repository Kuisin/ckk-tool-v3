import base64, json, os
import fitz  # PyMuPDF
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
MODEL = os.environ.get("MODEL", "qwen2.5vl")
MAX_PAGES = 5

DEFAULT_PROMPT = (
    "Extract data from the document image(s) according to the provided JSON schema. "
    "The document may be in Japanese. Use only information present in the document; "
    "set any missing field to null and never invent values. Respond with JSON only."
)

# ── JSON-Schema helpers ──────────────────────────────────────────────────
def _nullable(t):  # a field that may be absent in the document
    return {"type": [t, "null"]}

STR, NUM, INT = _nullable("string"), _nullable("number"), _nullable("integer")

def OBJ(**props):
    return {"type": "object", "properties": props}

def ARR(item):
    return {"type": "array", "items": item}

# ── Per-document-type schemas (match the v3 data model, _specs/tables.md) ──
# Each entry is a callable extraction "method": POST /extract/<key>.
SCHEMAS = {
    # 受注請書 — the customer's purchase order, intake → order_acceptances (+ items).
    "order-request": OBJ(
        customer_name=STR,            # 受注元（顧客）名
        customer_branch=STR,          # 支店・事業所
        customer_order_ref=STR,       # 顧客注文書番号
        order_date=STR,               # 注文日 (YYYY-MM-DD)
        desired_delivery_date=STR,    # 希望納期
        delivery_location=STR,        # 受渡場所
        payment_terms=STR,            # 支払条件
        items=ARR(OBJ(
            product_name=STR,
            product_code=STR,
            order_type=STR,           # 本番 / テスト / サンプル / その他
            quantity=INT,
            unit=STR,
            unit_price=NUM,
            amount=NUM,
            delivery_date=STR,
            notes=STR,
        )),
        subtotal=NUM,
        tax_amount=NUM,
        total_amount=NUM,
        notes=STR,
    ),
    # 見積書 (QOT)
    "quote": OBJ(
        issuer_name=STR, customer_name=STR, quote_number=STR,
        issue_date=STR, valid_until=STR,
        items=ARR(OBJ(product_name=STR, product_code=STR, quantity=INT,
                      unit_price=NUM, amount=NUM, delivery_date=STR)),
        subtotal=NUM, tax_amount=NUM, total_amount=NUM, notes=STR,
    ),
    # 請求書 (INV) — e.g. supplier invoices.
    "invoice": OBJ(
        supplier_name=STR, invoice_number=STR, issue_date=STR, due_date=STR,
        billing_period_from=STR, billing_period_to=STR,
        items=ARR(OBJ(description=STR, quantity=INT, unit_price=NUM, amount=NUM)),
        subtotal=NUM, tax_amount=NUM, total_amount=NUM, notes=STR,
    ),
    # 納品書 (DRN)
    "delivery-note": OBJ(
        supplier_name=STR, delivery_number=STR, delivery_date=STR,
        items=ARR(OBJ(product_name=STR, product_code=STR, quantity=INT, unit=STR)),
        notes=STR,
    ),
    # 素材発注書 (PO)
    "purchase-order": OBJ(
        supplier_name=STR, po_number=STR, order_date=STR,
        items=ARR(OBJ(material_name=STR, material_code=STR, quantity=NUM, unit=STR,
                      unit_price=NUM, amount=NUM, expected_date=STR)),
        total_amount=NUM, notes=STR,
    ),
}

# Optional per-type guidance appended to DEFAULT_PROMPT.
PROMPTS = {
    "order-request": (
        "This is a customer purchase order (注文書) the company received. Extract the "
        "ordering customer, their order reference number, and every ordered line item."
    ),
    "quote": "This is a price quotation (見積書).",
    "invoice": "This is an invoice (請求書).",
    "delivery-note": "This is a delivery note (納品書).",
    "purchase-order": "This is a material purchase order (発注書).",
}

app = FastAPI(title="Document → JSON")

def _pdf_to_b64(data: bytes) -> list[str]:
    out, doc = [], fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(300 / 72, 300 / 72)
    for page in doc[:MAX_PAGES]:
        out.append(base64.b64encode(page.get_pixmap(matrix=mat).tobytes("png")).decode())
    doc.close()
    return out

def _images_from(file: UploadFile) -> list[str]:
    data = file.file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if (file.filename or "").lower().endswith(".pdf"):
        return _pdf_to_b64(data)
    return [base64.b64encode(data).decode()]

def _run(images: list[str], fmt: dict, prompt: str):
    payload = {"model": MODEL, "stream": False, "format": fmt,
               "options": {"temperature": 0},
               "messages": [{"role": "user", "content": prompt, "images": images}]}
    with httpx.Client(timeout=300) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        content = r.json()["message"]["content"]
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(502, "model did not return valid JSON")

@app.get("/healthz")
def healthz():
    return {"status": "ok", "model": MODEL, "document_types": sorted(SCHEMAS)}

@app.get("/schemas")
def schemas():
    """The built-in document-type schemas (for callers/clients)."""
    return SCHEMAS

@app.post("/extract")
def extract(
    file: UploadFile = File(...),
    schema: str = Form(...),                 # caller-supplied JSON Schema string
    prompt: str = Form(DEFAULT_PROMPT),
):
    try:
        fmt = json.loads(schema)
    except json.JSONDecodeError:
        raise HTTPException(400, "schema must be a valid JSON Schema string")
    return _run(_images_from(file), fmt, prompt)

@app.post("/extract/{doc_type}")
def extract_typed(
    doc_type: str,
    file: UploadFile = File(...),
    prompt: str | None = Form(None),         # optional instruction override
):
    fmt = SCHEMAS.get(doc_type)
    if fmt is None:
        raise HTTPException(404, f"unknown document type '{doc_type}'; available: {sorted(SCHEMAS)}")
    instr = prompt or (DEFAULT_PROMPT + " " + PROMPTS.get(doc_type, "")).strip()
    return _run(_images_from(file), fmt, instr)
