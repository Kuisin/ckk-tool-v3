#!/bin/bash
# Connect to the OpenVPN server, then TCP-forward :LISTEN_PORT to the LDAP server
# over the tunnel so other containers (Open WebUI) can reach LDAP at vpn-ldap:389.
set -euo pipefail

: "${LDAP_HOST:?set LDAP_HOST (LDAP server address reachable via the VPN)}"
: "${VPN_USERNAME:?set VPN_USERNAME in .env}"
: "${VPN_PASSWORD:?set VPN_PASSWORD in .env}"
LDAP_PORT="${LDAP_PORT:-389}"
LISTEN_PORT="${LISTEN_PORT:-389}"

# Generate the OpenVPN auth file from env (single source of truth = .env).
umask 077
printf '%s\n%s\n' "$VPN_USERNAME" "$VPN_PASSWORD" > /tmp/auth.txt

# Config (CA + tls-auth) is mounted read-only at /vpn; copy so we can adjust.
cp /vpn/config.ovpn /tmp/config.ovpn
# Force username/password auth to use the generated file.
sed -i -E "s#^auth-user-pass.*#auth-user-pass /tmp/auth.txt#" /tmp/config.ovpn

echo "[vpn-ldap] starting OpenVPN to the configured remote..."
openvpn --config /tmp/config.ovpn --auth-nocache --suppress-timestamps &
OVPN_PID=$!

echo "[vpn-ldap] waiting for tun device..."
for _ in $(seq 1 60); do
  ip link show tun0 >/dev/null 2>&1 && break
  kill -0 "$OVPN_PID" 2>/dev/null || { echo "[vpn-ldap] OpenVPN exited early"; exit 1; }
  sleep 1
done
ip link show tun0 >/dev/null 2>&1 || { echo "[vpn-ldap] tun0 never came up"; exit 1; }

# Optional: bridge Authentik (SSO IdP, VPN 内) onto docker networks.
# アプリコンテナは coolify ネットワークの alias auth.ckk-tools.loc 経由で到達。
if [ -n "${AUTHENTIK_HOST:-}" ]; then
  echo "[vpn-ldap] authentik bridge 0.0.0.0:${AUTHENTIK_LISTEN_PORT:-9000} -> ${AUTHENTIK_HOST}:${AUTHENTIK_PORT:-9000}"
  socat TCP-LISTEN:"${AUTHENTIK_LISTEN_PORT:-9000}",fork,reuseaddr TCP:"${AUTHENTIK_HOST}":"${AUTHENTIK_PORT:-9000}" &
fi

echo "[vpn-ldap] VPN up — bind-aware forward 0.0.0.0:${LISTEN_PORT} -> ${LDAP_HOST}:${LDAP_PORT}"
# Transparent forwarder that also fires a directory sync on user login (bind).
python3 /ldap_proxy.py &
PROXY_PID=$!
# Safety net: if the proxy ever exits, fall back to plain socat so LDAP auth
# (which every app depends on) never stays down.
(
  while kill -0 "$PROXY_PID" 2>/dev/null; do sleep 5; done
  echo "[vpn-ldap] proxy exited — falling back to socat forwarder"
  socat TCP-LISTEN:"${LISTEN_PORT}",fork,reuseaddr TCP:"${LDAP_HOST}":"${LDAP_PORT}"
) &

# Exit (and let Docker restart us) if the VPN process dies.
wait "$OVPN_PID"
echo "[vpn-ldap] OpenVPN process ended; exiting for restart."
