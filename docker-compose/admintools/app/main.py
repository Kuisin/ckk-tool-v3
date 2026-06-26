import io
import os

import openpyxl
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from . import sync
from .db import MailAccount, SessionLocal, init_db

API_KEY = os.environ.get("ADMINTOOLS_API_KEY", "")


def require_api_key(x_api_key: str = Header(default="")):
    """Auth for the external read/write API (X-API-Key header)."""
    if not API_KEY:
        raise HTTPException(503, "API disabled: set ADMINTOOLS_API_KEY")
    if x_api_key != API_KEY:
        raise HTTPException(401, "invalid API key")


class AccountIn(BaseModel):
    username: str
    email: str
    password: str = ""
    quota_gb: int = 5
    is_active: bool = True
    notes: str = ""


class AccountPatch(BaseModel):
    email: str | None = None
    password: str | None = None
    quota_gb: int | None = None
    is_active: bool | None = None
    notes: str | None = None


def _account_out(a: MailAccount) -> dict:
    """Public representation — never exposes the password."""
    return {"id": a.id, "username": a.username, "email": a.email,
            "quota_gb": a.quota_gb, "is_active": a.is_active, "notes": a.notes}


app = FastAPI(title="adminTools")
templates = Jinja2Templates(directory="app/templates")


def _parse_accounts_xlsx(data: bytes) -> list[dict]:
    """Parse mail accounts from an email-list xlsx across all sheets.
    Columns (by header): username, password, email (with domain), active, displayname."""
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    accounts: list[dict] = []
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header = [str(h).strip().lower() if h is not None else "" for h in rows[0]]

        def col(*names: str) -> int:
            for n in names:
                for i, h in enumerate(header):
                    if h == n:
                        return i
            for n in names:
                for i, h in enumerate(header):
                    if n in h:
                        return i
            return -1

        u_i, p_i, a_i, d_i = col("username"), col("password"), col("active"), col("displayname")
        e_i = col("email (with domain)")
        if e_i < 0:
            for i, h in enumerate(header):
                if "email" in h and "domain" in h:
                    e_i = i
                    break
        if e_i < 0:
            e_i = col("email")
        if u_i < 0 or e_i < 0:
            continue
        for row in rows[1:]:
            row = list(row) + [None] * (len(header) - len(row or []))
            username = str(row[u_i]).strip() if row[u_i] is not None else ""
            email = str(row[e_i]).strip() if row[e_i] is not None else ""
            if not username or "@" not in email:
                continue
            av = row[a_i] if a_i >= 0 else True
            is_active = av is True or (isinstance(av, str) and av.strip().lower() in
                                       ("true", "yes", "1", "on", "○", "〇", "x", "✓", "✔"))
            accounts.append({
                "username": username,
                "password": str(row[p_i]).strip() if p_i >= 0 and row[p_i] is not None else "",
                "email": email,
                "is_active": is_active,
                "notes": str(row[d_i]).strip() if d_i >= 0 and row[d_i] is not None else "",
            })
    return accounts


@app.post("/import")
def import_accounts(file: UploadFile = File(...)):
    accounts = _parse_accounts_xlsx(file.file.read())
    inserted = updated = 0
    with SessionLocal() as s:
        for a in accounts:
            existing = s.query(MailAccount).filter_by(username=a["username"]).first()
            if existing:
                if a["password"]:
                    existing.password = a["password"]
                existing.email, existing.is_active, existing.notes = a["email"], a["is_active"], a["notes"]
                updated += 1
            else:
                s.add(MailAccount(username=a["username"], password=a["password"], email=a["email"],
                                  quota_gb=5, is_active=a["is_active"], notes=a["notes"]))
                inserted += 1
        s.commit()
    return RedirectResponse(f"/?imported={inserted}&updated={updated}", status_code=303)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    with SessionLocal() as s:
        accounts = s.query(MailAccount).order_by(MailAccount.username).all()
    return templates.TemplateResponse(
        "index.html", {"request": request, "accounts": accounts, "sync": sync.get_state()}
    )


@app.post("/accounts")
def create_account(
    username: str = Form(...),
    password: str = Form(...),
    email: str = Form(...),
    quota_gb: int = Form(5),
    is_active: bool = Form(False),
    notes: str = Form(""),
):
    with SessionLocal() as s:
        if s.query(MailAccount).filter_by(username=username.strip()).first():
            raise HTTPException(400, "username already exists")
        s.add(MailAccount(username=username.strip(), password=password, email=email.strip(),
                          quota_gb=quota_gb, is_active=is_active, notes=notes))
        s.commit()
    return RedirectResponse("/", status_code=303)


@app.post("/accounts/{account_id}/update")
def update_account(
    account_id: int,
    password: str = Form(...),
    email: str = Form(...),
    quota_gb: int = Form(5),
    is_active: bool = Form(False),
    notes: str = Form(""),
):
    with SessionLocal() as s:
        a = s.get(MailAccount, account_id)
        if not a:
            raise HTTPException(404)
        a.password, a.email, a.quota_gb, a.is_active, a.notes = (
            password, email.strip(), quota_gb, is_active, notes)
        s.commit()
    return RedirectResponse("/", status_code=303)


@app.post("/accounts/{account_id}/delete")
def delete_account(account_id: int):
    with SessionLocal() as s:
        a = s.get(MailAccount, account_id)
        if a:
            s.delete(a)
            s.commit()
    return RedirectResponse("/", status_code=303)


@app.post("/sync")
def trigger_sync():
    sync.start_sync()
    return RedirectResponse("/", status_code=303)


@app.get("/sync/status")
def sync_status():
    return JSONResponse(sync.get_state())


# ---------------------------------------------------------------------------
# External read/write API (JSON, X-API-Key auth). For other systems to manage
# mail accounts programmatically. Passwords are accepted on write, never returned.
# ---------------------------------------------------------------------------
@app.get("/api/v1/accounts", dependencies=[Depends(require_api_key)])
def api_list(active: bool | None = None):
    with SessionLocal() as s:
        q = s.query(MailAccount)
        if active is not None:
            q = q.filter(MailAccount.is_active.is_(active))
        return [_account_out(a) for a in q.order_by(MailAccount.username).all()]


@app.get("/api/v1/accounts/{username}", dependencies=[Depends(require_api_key)])
def api_get(username: str):
    with SessionLocal() as s:
        a = s.query(MailAccount).filter_by(username=username).first()
        if not a:
            raise HTTPException(404, "not found")
        return _account_out(a)


@app.post("/api/v1/accounts", status_code=201, dependencies=[Depends(require_api_key)])
def api_create(body: AccountIn):
    with SessionLocal() as s:
        if s.query(MailAccount).filter_by(username=body.username).first():
            raise HTTPException(409, "username already exists")
        a = MailAccount(username=body.username.strip(), password=body.password,
                        email=body.email.strip(), quota_gb=body.quota_gb,
                        is_active=body.is_active, notes=body.notes)
        s.add(a)
        s.commit()
        return _account_out(a)


@app.patch("/api/v1/accounts/{username}", dependencies=[Depends(require_api_key)])
def api_update(username: str, body: AccountPatch):
    with SessionLocal() as s:
        a = s.query(MailAccount).filter_by(username=username).first()
        if not a:
            raise HTTPException(404, "not found")
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(a, field, value.strip() if isinstance(value, str) else value)
        s.commit()
        return _account_out(a)


@app.delete("/api/v1/accounts/{username}", status_code=204, dependencies=[Depends(require_api_key)])
def api_delete(username: str):
    with SessionLocal() as s:
        a = s.query(MailAccount).filter_by(username=username).first()
        if a:
            s.delete(a)
            s.commit()
