import os

from sqlalchemy import Boolean, DateTime, Integer, String, Text, create_engine, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

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
    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


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
        # Categorize existing rows by username prefix (once).
        conn.execute(text("""
            UPDATE mail_accounts SET type = CASE
                WHEN kind = 'user' THEN 'user'
                WHEN username LIKE 'app-%' THEN 'app'
                WHEN username LIKE 'grp-%' THEN 'grp'
                ELSE 'other' END
            WHERE type = 'other' OR type = ''
        """))
