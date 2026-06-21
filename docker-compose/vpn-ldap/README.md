# vpn-ldap — OpenVPN client + LDAP forwarder for Open WebUI SSO

Connects to the CKK VPN and bridges the LDAP/AD server onto the `ai-stack`
network so Open WebUI can authenticate users against Active Directory. Only this
container touches the VPN.

```
Open WebUI ──(ai-stack net)──> vpn-ldap:389 ──(socat over tun0)──> AD server:389
                                  └ OpenVPN client → ckkhda.heinelt.info:1196/udp
```

Deployed on `docker-mac-pro` at `~/stacks/vpn-ldap` (Dockge-managed).

## Secrets (not in git)

Place under `./vpn/` on the host and set `.env`:

| File / var | What |
|------------|------|
| `vpn/config.ovpn` | the `.ovpn` profile (CKK-Tool_Handa_k.sawada.ovpn) |
| `vpn/auth.txt` | two lines: VPN username, then password |
| `.env` `LDAP_HOST` | AD server address reachable over the VPN |
| `.env` `LDAP_PORT` | usually `389` |

```bash
mkdir -p vpn
cp /path/to/CKK-Tool_Handa_k.sawada.ovpn vpn/config.ovpn
printf '%s\n%s\n' 'VPN_USERNAME' 'VPN_PASSWORD' > vpn/auth.txt
chmod 600 vpn/auth.txt
cp .env.example .env   # set LDAP_HOST / LDAP_PORT
docker compose up -d --build
docker logs vpn-ldap --tail 20    # expect "VPN up — forwarding ..."
```

The container forces `auth-user-pass` to `vpn/auth.txt`, waits for `tun0`, then
`socat`-forwards `:389` to `LDAP_HOST:389` over the tunnel (pushed VPN routes make
the AD server reachable). It exits/restarts if the VPN drops.

## Shared LDAP credentials (`ldap.env`)

The AD connection + bind credentials live once in **`ldap.env`** (gitignored;
`ldap.env.example` is the template). Any app reuses them via `env_file` so there's
a single place to rotate the bind password:

```yaml
# in another stack's compose, for an LDAP-aware service:
services:
  some-app:
    env_file:
      - ../vpn-ldap/ldap.env     # LDAP_SERVER_HOST, LDAP_APP_DN, LDAP_APP_PASSWORD, ...
    environment:
      - ENABLE_LDAP=true         # the on/off toggle stays per app
    networks:
      - ldap                     # see below
```

Open WebUI is wired exactly this way (`ai-stack` stack). Var names match Open
WebUI; apps using different names (Grafana, the Next.js app) can map these values
in their own compose. Sign in with an AD username (`sAMAccountName`) on the app's
login page; TLS is off because traffic is already encrypted inside the VPN tunnel.

## Secured access (network segmentation)

`vpn-ldap` lives on its **own** network (`vpn-ldap_default`), not the shared
`ai-stack` network. Only apps that explicitly attach to it can reach `:389`/AD:

```yaml
# consumer stack:
networks:
  ldap:
    external: true
    name: vpn-ldap_default
```

So `ollama`, `searxng`, `po-extract`, `cloudflared`, etc. cannot reach the AD
forwarder — only `open-webui` (and any future opt-in app) can. To grant a new app
access, attach it to the `vpn-ldap_default` network the same way.
