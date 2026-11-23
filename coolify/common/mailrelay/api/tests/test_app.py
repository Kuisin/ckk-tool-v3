"""test_app.py — mail-api の添付（取引先へ書類を送る口）。SMTP には繋がない。

実行（CI と同じ）: pip install -r requirements.txt httpx && python -m unittest discover -s tests -t .
"""

import base64
import os
import smtplib
import unittest

os.environ.setdefault("MAIL_API_TOKEN", "t")

sent = []


class FakeSMTP:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def ehlo(self):
        pass

    def send_message(self, msg):
        sent.append(msg)


smtplib.SMTP = FakeSMTP

import app as m  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

H = {"X-Mail-Token": "t"}
PDF = b"%PDF-1.4 test"


def payload(**over):
    body = {"to": "a@example.com", "subject": "s", "text": "t"}
    body.update(over)
    return body


def pdf_attachment(content=PDF, ctype="application/pdf", name="QOT-1.pdf"):
    return {"filename": name, "content_type": ctype, "content_base64": base64.b64encode(content).decode()}


class AttachmentTest(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(m.app)
        self.max = m.MAX_ATTACHMENT_BYTES

    def tearDown(self):
        m.MAX_ATTACHMENT_BYTES = self.max

    def test_healthz_advertises_attachments(self):
        # アプリはこれを見てから添付を送る（古いリレーは添付を黙って捨てる）。
        self.assertIs(self.c.get("/healthz").json()["attachments"], True)

    def test_pdf_is_attached_with_reply_to(self):
        r = self.c.post("/send", headers=H, json=payload(reply_to="rep@example.com", attachments=[pdf_attachment()]))
        self.assertEqual(r.status_code, 200, r.text)
        msg = sent[-1]
        atts = list(msg.iter_attachments())
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0].get_filename(), "QOT-1.pdf")
        self.assertEqual(atts[0].get_content(), PDF)
        self.assertEqual(msg["Reply-To"], "rep@example.com")

    def test_only_pdf_is_allowed(self):
        r = self.c.post("/send", headers=H, json=payload(attachments=[pdf_attachment(ctype="application/x-msdownload", name="x.exe")]))
        self.assertEqual(r.status_code, 422)

    def test_invalid_base64_is_rejected(self):
        bad = {"filename": "x.pdf", "content_type": "application/pdf", "content_base64": "!!notbase64"}
        r = self.c.post("/send", headers=H, json=payload(attachments=[bad]))
        self.assertEqual(r.status_code, 422)

    def test_size_limit(self):
        m.MAX_ATTACHMENT_BYTES = 5
        r = self.c.post("/send", headers=H, json=payload(attachments=[pdf_attachment()]))
        self.assertEqual(r.status_code, 413)

    def test_plain_mail_unchanged(self):
        r = self.c.post("/send", headers=H, json=payload())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(list(sent[-1].iter_attachments()), [])


if __name__ == "__main__":
    unittest.main()
