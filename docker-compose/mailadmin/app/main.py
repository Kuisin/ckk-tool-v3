from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from . import sync
from .db import MailAccount, SessionLocal, init_db

app = FastAPI(title="CKK Mail Admin")
templates = Jinja2Templates(directory="app/templates")


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
