"""mail-api — 社内アプリ向けの HTTP → SMTP 送信口。

なぜ要るか: アプリ側に SMTP の作法（トランスポート設定・TLS・認証の有無）を
持たせたくない。ここに寄せると、アプリは JSON を 1 回 POST するだけになる。

**SMTP も残す。** Metabase / Grafana / Open WebUI は SMTP しか話せないので、
リレー本体（postfix:587）はそのまま。この API はその前に立つ薄い口で、
配送・再送・DKIM は今までどおり postfix が担う。

認証: 共有シークレット 1 本（`X-Mail-Token`）。社内ネットワーク内からしか
届かない前提だが、誤って外に出たときに素通しにならないよう必須にしてある。
"""

from __future__ import annotations

import base64
import binascii
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

SMTP_HOST = os.environ.get("SMTP_HOST", "mailrelay")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
# 差出人はここで固定する（アプリごとに違う From を許すと、リレーの
# ALLOWED_SENDER_DOMAINS と食い違ったときに原因が追いにくい）。
MAIL_FROM = os.environ.get("MAIL_FROM", "no-reply@ckk-tool.co.jp")
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "CKK 業務管理システム")
TOKEN = os.environ.get("MAIL_API_TOKEN", "")
# 添付の上限（合計・デコード後）。見積書・請求書の PDF 1 通を想定した大きさで、
# 大きなファイルの受け渡しに使わせない。
MAX_ATTACHMENT_BYTES = int(os.environ.get("MAX_ATTACHMENT_BYTES", str(10 * 1024 * 1024)))
ALLOWED_ATTACHMENT_TYPES = {"application/pdf"}

app = FastAPI(title="mail-api", version="1.0.0")


class Attachment(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(min_length=1, max_length=100)
    # 本体は base64（JSON に生のバイト列は載らない）。
    content_base64: str = Field(min_length=1)


class SendRequest(BaseModel):
    to: EmailStr
    subject: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1)
    html: str | None = None
    # 返信先を分けたいとき（既定は差出人と同じ = no-reply）。
    reply_to: EmailStr | None = None
    # 取引先へ書類を送るとき用。PDF だけを受け付ける（任意のファイルを外へ
    # 出す口にしない）。
    attachments: list[Attachment] = Field(default_factory=list, max_length=5)


class SendResponse(BaseModel):
    ok: bool
    message_id: str


def _require_token(supplied: str | None) -> None:
    if not TOKEN:
        # トークン未設定で起動していたら、開けっ放しにせず落とす。
        raise HTTPException(status_code=503, detail="MAIL_API_TOKEN not configured")
    if supplied != TOKEN:
        raise HTTPException(status_code=401, detail="invalid token")


@app.get("/healthz")
def healthz() -> dict[str, object]:
    """SMTP まで到達できるかを含めて返す（コンテナが生きているだけでは不十分）。"""
    reachable = False
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as s:
            s.ehlo()
            reachable = True
    except OSError:
        reachable = False
    return {
        "status": "ok" if reachable else "degraded",
        "smtp": f"{SMTP_HOST}:{SMTP_PORT}",
        "smtp_reachable": reachable,
        "from": MAIL_FROM,
        "token_configured": bool(TOKEN),
        # アプリは添付を送る前にこれを見る。古いリレーは attachments を黙って
        # 捨てる（pydantic は未知の項目を無視する）ため、「PDF を添付しました」
        # と書いたメールが添付なしで届く、を防ぐための印。
        "attachments": True,
        "max_attachment_bytes": MAX_ATTACHMENT_BYTES,
    }


@app.post("/send", response_model=SendResponse)
def send(req: SendRequest, x_mail_token: str | None = Header(default=None)) -> SendResponse:
    _require_token(x_mail_token)

    msg = EmailMessage()
    msg["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM))
    msg["To"] = str(req.to)
    msg["Subject"] = req.subject
    # Message-ID はここで採番する。postfix 任せだと "<>" になり、
    # 受信側のスレッド化と、あとから配送を追う手掛かりが消える。
    domain = parseaddr(MAIL_FROM)[1].split("@")[-1] or "ckk-tool.co.jp"
    msg["Message-ID"] = make_msgid(domain=domain)
    if req.reply_to:
        msg["Reply-To"] = str(req.reply_to)
    msg.set_content(req.text)
    if req.html:
        msg.add_alternative(req.html, subtype="html")

    total = 0
    for a in req.attachments:
        if a.content_type not in ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(status_code=422, detail=f"attachment type not allowed: {a.content_type}")
        try:
            data = base64.b64decode(a.content_base64, validate=True)
        except (binascii.Error, ValueError) as e:
            raise HTTPException(status_code=422, detail="attachment is not valid base64") from e
        total += len(data)
        if total > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="attachments too large")
        maintype, _, subtype = a.content_type.partition("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=a.filename)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.send_message(msg)
    except (OSError, smtplib.SMTPException) as e:
        # 502 = 上流（リレー）が受け取れなかった。呼び出し側が再試行を判断できる。
        raise HTTPException(status_code=502, detail=f"relay refused: {e}") from e

    return SendResponse(ok=True, message_id=msg["Message-ID"])
