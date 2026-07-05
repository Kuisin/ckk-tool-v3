"""Read AD/LDAP users via the vpn-ldap forwarder (to validate User mailboxes)."""
import os

from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.utils.conv import escape_filter_chars

# Reuse the shared vpn-ldap/ldap.env names.
HOST = os.environ.get("LDAP_SERVER_HOST", "vpn-ldap")
PORT = int(os.environ.get("LDAP_SERVER_PORT", "389"))
BASE = os.environ.get("LDAP_SEARCH_BASE", "DC=ckk-tools,DC=loc")
BIND_DN = os.environ.get("LDAP_APP_DN", "")
BIND_PW = os.environ.get("LDAP_APP_PASSWORD", "")

UF_ACCOUNTDISABLE = 0x0002


def find_user(username: str) -> dict | None:
    """Look up a single AD user by sAMAccountName. Returns dict or None."""
    if not BIND_DN or not BIND_PW:
        raise RuntimeError("LDAP_APP_DN / LDAP_APP_PASSWORD not configured")
    server = Server(HOST, port=PORT, get_info=ALL, connect_timeout=10)
    conn = Connection(server, user=BIND_DN, password=BIND_PW, auto_bind=True, receive_timeout=15)
    try:
        flt = f"(&(objectClass=user)(objectCategory=person)(sAMAccountName={escape_filter_chars(username)}))"
        conn.search(BASE, flt, search_scope=SUBTREE, attributes=["sAMAccountName", "displayName", "mail"])
        if not conn.entries:
            return None
        e = conn.entries[0]
        return {"username": str(e.sAMAccountName),
                "display_name": str(e.displayName) if e.displayName else "",
                "mail": str(e.mail) if e.mail else ""}
    finally:
        conn.unbind()


def _connect():
    if not BIND_DN or not BIND_PW:
        raise RuntimeError("LDAP_APP_DN / LDAP_APP_PASSWORD not configured")
    server = Server(HOST, port=PORT, get_info=ALL, connect_timeout=10)
    return Connection(server, user=BIND_DN, password=BIND_PW, auto_bind=True, receive_timeout=25)


def list_groups() -> list[dict]:
    """AD groups with a direct-member count, for the bulk-import picker."""
    conn = _connect()
    try:
        conn.search(BASE, "(objectClass=group)", search_scope=SUBTREE,
                    attributes=["cn", "distinguishedName", "member"], paged_size=500)
        groups = []
        for e in conn.entries:
            members = e.member.values if "member" in e and e.member else []
            groups.append({"cn": str(e.cn) if e.cn else "",
                           "dn": str(e.distinguishedName),
                           "count": len(members)})
        groups.sort(key=lambda g: g["cn"].lower())
        return [g for g in groups if g["cn"]]
    finally:
        conn.unbind()


def group_members(group_dn: str) -> list[dict]:
    """Direct user members of a group (by memberOf)."""
    conn = _connect()
    try:
        flt = (f"(&(objectClass=user)(objectCategory=person)"
               f"(memberOf={escape_filter_chars(group_dn)}))")
        conn.search(BASE, flt, search_scope=SUBTREE,
                    attributes=["sAMAccountName", "mail", "displayName", "userAccountControl"])
        out = []
        for e in conn.entries:
            sam = str(e.sAMAccountName) if e.sAMAccountName else ""
            if not sam:
                continue
            uac = 0
            try:
                uac = int(e.userAccountControl.value or 0)
            except Exception:  # noqa: BLE001
                pass
            out.append({"username": sam,
                        "mail": str(e.mail) if e.mail else "",
                        "display_name": str(e.displayName) if e.displayName else "",
                        "disabled": bool(uac & UF_ACCOUNTDISABLE)})
        return out
    finally:
        conn.unbind()


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
