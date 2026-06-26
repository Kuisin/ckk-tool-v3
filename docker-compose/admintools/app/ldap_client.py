"""Read AD/LDAP users via the vpn-ldap forwarder, to source User mailboxes."""
import os

from ldap3 import ALL, SUBTREE, Connection, Server

# Reuse the shared vpn-ldap/ldap.env names.
HOST = os.environ.get("LDAP_SERVER_HOST", "vpn-ldap")
PORT = int(os.environ.get("LDAP_SERVER_PORT", "389"))
BASE = os.environ.get("LDAP_SEARCH_BASE", "DC=ckk-tools,DC=loc")
BIND_DN = os.environ.get("LDAP_APP_DN", "")
BIND_PW = os.environ.get("LDAP_APP_PASSWORD", "")

UF_ACCOUNTDISABLE = 0x0002


def list_users() -> list[dict]:
    """Return enabled-and-disabled AD person accounts: username (sAMAccountName),
    mail, display_name, disabled."""
    if not BIND_DN or not BIND_PW:
        raise RuntimeError("LDAP_APP_DN / LDAP_APP_PASSWORD not configured")
    server = Server(HOST, port=PORT, get_info=ALL, connect_timeout=10)
    conn = Connection(server, user=BIND_DN, password=BIND_PW, auto_bind=True, receive_timeout=20)
    try:
        conn.search(
            BASE,
            "(&(objectClass=user)(objectCategory=person)(sAMAccountName=*))",
            search_scope=SUBTREE,
            attributes=["sAMAccountName", "mail", "displayName", "userAccountControl"],
            paged_size=500,
        )
        users = []
        for e in conn.entries:
            sam = str(e.sAMAccountName) if e.sAMAccountName else ""
            if not sam:
                continue
            uac = 0
            try:
                uac = int(e.userAccountControl.value or 0)
            except Exception:  # noqa: BLE001
                pass
            users.append({
                "username": sam,
                "mail": str(e.mail) if e.mail else "",
                "display_name": str(e.displayName) if e.displayName else "",
                "disabled": bool(uac & UF_ACCOUNTDISABLE),
            })
        users.sort(key=lambda u: u["username"].lower())
        return users
    finally:
        conn.unbind()
