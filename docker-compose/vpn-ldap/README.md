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

## Open WebUI LDAP config

Set on the `open-webui` service (in the `ai-stack` stack), pointing at this
forwarder, then sign in with AD credentials on the login page:

```yaml
- ENABLE_LDAP=true
- LDAP_SERVER_LABEL=CKK AD
- LDAP_SERVER_HOST=vpn-ldap
- LDAP_SERVER_PORT=389
- LDAP_APP_DN=<bind/service account DN>
- LDAP_APP_PASSWORD=<bind password>
- LDAP_SEARCH_BASE=<e.g. DC=ckk,DC=local>
- LDAP_ATTRIBUTE_FOR_USERNAME=sAMAccountName   # AD; use uid for OpenLDAP
- LDAP_ATTRIBUTE_FOR_MAIL=mail
- LDAP_USE_TLS=false   # traffic is already encrypted inside the VPN tunnel
```
