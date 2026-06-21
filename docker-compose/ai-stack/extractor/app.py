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

app = FastAPI(title="Document → JSON")

def _pdf_to_b64(data: bytes) -> list[str]:
    out, doc = [], fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(300/72, 300/72)
    for page in doc[:MAX_PAGES]:
        out.append(base64.b64encode(page.get_pixmap(matrix=mat).tobytes("png")).decode())
    doc.close()
    return out

@app.get("/healthz")
def healthz():
    return {"status": "ok", "model": MODEL}

@app.post("/extract")
def extract(
    file: UploadFile = File(...),
    schema: str = Form(...),                 # desired output format: a JSON Schema string
    prompt: str = Form(DEFAULT_PROMPT),      # optional instruction override
):
    try:
        fmt = json.loads(schema)
    except json.JSONDecodeError:
        raise HTTPException(400, "schema must be a valid JSON Schema string")

    data = file.file.read()
    if not data:
        raise HTTPException(400, "empty file")
    images = _pdf_to_b64(data) if (file.filename or "").lower().endswith(".pdf") \
        else [base64.b64encode(data).decode()]

    payload = {"model": MODEL, "stream": False, "format": fmt,
               "options": {"temperature": 0},
               "messages": [{"role": "user", "content": prompt, "images": images}]}
    with httpx.Client(timeout=300) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        content = r.json()["message"]["content"]

    try:
        return json.loads(content)           # reply only the JSON
    except json.JSONDecodeError:
        raise HTTPException(502, "model did not return valid JSON")
