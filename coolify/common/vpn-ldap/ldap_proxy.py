#!/usr/bin/env python3
"""Bind-aware LDAP TCP forwarder (replaces socat in the vpn-ldap container).

Transparently relays :LISTEN_PORT to the AD server over the VPN — byte-for-byte,
exactly like socat. Additionally it *observes* (never modifies) the client→server
stream for LDAP simple-bind requests; when a real user logs in (a bind whose DN
is neither the service account nor anonymous), it fires a fire-and-forget POST to
the ldap-sync service so that user's directory row is refreshed on login.

Robustness first: data is forwarded BEFORE any parsing, all parsing/trigger
errors are swallowed, and a parse failure never affects the relay. If anything
about the observation breaks, LDAP auth still works.
"""
import asyncio
import os
import urllib.request

LISTEN = int(os.environ.get("LISTEN_PORT", "389"))
TARGET_HOST = os.environ["LDAP_HOST"]
TARGET_PORT = int(os.environ.get("LDAP_PORT", "389"))
SYNC_URL = os.environ.get("SYNC_TRIGGER_URL", "http://ldap-sync:8088/sync")
APP_DN = (os.environ.get("LDAP_APP_DN", "") or "").strip().lower()


def _read_len(b, i):
    n = b[i]
    i += 1
    if n < 0x80:
        return n, i
    k = n & 0x7F
    if k == 0 or i + k > len(b):
        raise ValueError("bad length")
    return int.from_bytes(b[i:i + k], "big"), i + k


def parse_bind_dn(data: bytes):
    """Return the bind DN if `data` begins with an LDAP simple BindRequest, else None."""
    try:
        i = 0
        if data[i] != 0x30:  # LDAPMessage SEQUENCE
            return None
        _, i = _read_len(data, i + 1)
        if data[i] != 0x02:  # messageID INTEGER
            return None
        ln, i = _read_len(data, i + 1)
        i += ln
        if data[i] != 0x60:  # [APPLICATION 0] BindRequest
            return None
        _, i = _read_len(data, i + 1)
        if data[i] != 0x02:  # version INTEGER
            return None
        ln, i = _read_len(data, i + 1)
        i += ln
        if data[i] != 0x04:  # name OCTET STRING (the bind DN)
            return None
        ln, i = _read_len(data, i + 1)
        return data[i:i + ln].decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None


def _trigger():
    try:
        urllib.request.urlopen(urllib.request.Request(SYNC_URL, data=b"", method="POST"), timeout=3).read()
    except Exception:  # noqa: BLE001
        pass


async def _pipe(reader, writer, observe=False):
    loop = asyncio.get_event_loop()
    observed = False
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)            # forward FIRST — never delayed by parsing
            await writer.drain()
            if observe and not observed:
                dn = parse_bind_dn(data)
                if dn is not None:
                    observed = True       # only react to the bind once per connection
                    if dn.strip() and dn.strip().lower() != APP_DN:
                        loop.run_in_executor(None, _trigger)
    except Exception:  # noqa: BLE001
        pass
    finally:
        try:
            writer.close()
        except Exception:  # noqa: BLE001
            pass


async def _handle(client_r, client_w):
    try:
        srv_r, srv_w = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
    except Exception:  # noqa: BLE001
        try:
            client_w.close()
        except Exception:  # noqa: BLE001
            pass
        return
    await asyncio.gather(
        _pipe(client_r, srv_w, observe=True),
        _pipe(srv_r, client_w),
    )


async def main():
    server = await asyncio.start_server(_handle, "0.0.0.0", LISTEN)
    print(f"[vpn-ldap] bind-aware forward 0.0.0.0:{LISTEN} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
