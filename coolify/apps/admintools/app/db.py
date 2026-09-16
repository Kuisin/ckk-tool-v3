import os

from sqlalchemy import (
    Boolean, DateTime, Integer, String, Text, UniqueConstraint, create_engine, func, text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from . import secret_box

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# Default mail domain — user emails default to <ldap-username>@DEFAULT_DOMAIN.
DEFAULT_DOMAIN = os.environ.get("DEFAULT_DOMAIN", "ckk-tool.co.jp")


class Base(DeclarativeBase):
    pass


class MailAccount(Base):
    """A mailbox on the Sakura server.

    Sakura auto-creates the primary mailbox <username>@<domain> when the user is
    added, so we never create an alias equal to that. An alias is only created
    when `email`'s local part differs from `username` (e.g. an old address).

    kind = 'user'   : tied to an LDAP/AD account; username == sAMAccountName.
    kind = 'shared' : standalone / role account (info@, app-*, ...).
    """

    __tablename__ = "mail_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255))
    quota_gb: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    kind: Mapped[str] = mapped_column(String(16), default="shared", index=True)
    # Shared subtype: 'app' | 'grp' | 'other'  (users -> 'user'). ID = <type>-<name>.
    type: Mapped[str] = mapped_column(String(16), default="other")
    notes: Mapped[str] = mapped_column(Text, default="")
    # Additional alias emails for this mailbox (newline/comma-separated). Lets one
    # group/mailbox be reached at multiple addresses (besides the primary `email`).
    extra_aliases: Mapped[str] = mapped_column(Text, default="")
    # Set when the password is changed in adminTools; the sync pushes it to Sakura
    # then clears it. Avoids re-pushing every password on every sync.
    password_dirty: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppCredential(Base):
    """Single row (id=1) holding the Sakura control-panel admin login, edited via
    the 設定 modal on /email. Values are Fernet-encrypted (secret_box.py,
    CRED_ENCRYPTION_KEY) — never stored plaintext. Falls back to SAKURA_ID/PW env
    vars when this row is absent or the key can't decrypt it, so an un-migrated
    deployment keeps working exactly as before."""

    __tablename__ = "app_credentials"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    sakura_id_encrypted: Mapped[str] = mapped_column(Text, default="")
    sakura_pw_encrypted: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def get_sakura_credentials() -> tuple[str, str]:
    """(sakura_id, sakura_pw) — DB row wins when both fields decrypt to a
    non-empty value; otherwise falls back to the SAKURA_ID/SAKURA_PW env vars."""
    with SessionLocal() as s:
        row = s.get(AppCredential, 1)
    if row:
        sid = secret_box.decrypt(row.sakura_id_encrypted)
        spw = secret_box.decrypt(row.sakura_pw_encrypted)
        if sid and spw:
            return sid, spw
    return os.environ.get("SAKURA_ID", "").strip(), os.environ.get("SAKURA_PW", "").strip()


def sakura_credentials_configured() -> dict:
    """For the settings panel: where do the active Sakura credentials come from."""
    with SessionLocal() as s:
        row = s.get(AppCredential, 1)
    db_ok = bool(row and secret_box.decrypt(row.sakura_id_encrypted) and secret_box.decrypt(row.sakura_pw_encrypted))
    env_ok = bool(os.environ.get("SAKURA_ID", "").strip() and os.environ.get("SAKURA_PW", "").strip())
    return {"source": "db" if db_ok else ("env" if env_ok else "none"),
            "updated_at": row.updated_at.strftime("%Y-%m-%d %H:%M") if (row and db_ok) else None}


def set_sakura_credentials(sakura_id: str, sakura_pw: str) -> None:
    """Blank field = keep the existing encrypted value unchanged (so either ID or
    password alone can be updated, and the modal never needs to show a decrypted
    secret)."""
    with SessionLocal() as s:
        row = s.get(AppCredential, 1)
        if row is None:
            row = AppCredential(id=1)
            s.add(row)
        if sakura_id.strip():
            row.sakura_id_encrypted = secret_box.encrypt(sakura_id.strip())
        if sakura_pw.strip():
            row.sakura_pw_encrypted = secret_box.encrypt(sakura_pw.strip())
        s.commit()


class GroupMember(Base):
    """Members assigned to a grp-* group email (LDAP usernames). Display/management
    only — not synced to Sakura."""

    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "username", name="uq_group_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(Integer, index=True)
    username: Mapped[str] = mapped_column(String(64))


def init_db() -> None:
    Base.metadata.create_all(engine)
    # Lightweight migration for existing deployments.
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'shared'"
        ))
        conn.execute(text(
            "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'other'"
        ))
        conn.execute(text(
            "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS extra_aliases TEXT NOT NULL DEFAULT ''"
        ))
        conn.execute(text(
            "ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS password_dirty BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        # Categorize existing rows by username prefix (once).
        conn.execute(text("""
            UPDATE mail_accounts SET type = CASE
                WHEN kind = 'user' THEN 'user'
                WHEN username LIKE 'app-%' THEN 'app'
                WHEN username LIKE 'grp-%' THEN 'grp'
                ELSE 'other' END
            WHERE type = 'other' OR type = ''
        """))
