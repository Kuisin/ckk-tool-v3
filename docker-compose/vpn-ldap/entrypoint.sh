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

echo "[vpn-ldap] VPN up — forwarding 0.0.0.0:${LISTEN_PORT} -> ${LDAP_HOST}:${LDAP_PORT}"
socat TCP-LISTEN:"${LISTEN_PORT}",fork,reuseaddr TCP:"${LDAP_HOST}":"${LDAP_PORT}" &

# Exit (and let Docker restart us) if the VPN process dies.
wait "$OVPN_PID"
echo "[vpn-ldap] OpenVPN process ended; exiting for restart."
