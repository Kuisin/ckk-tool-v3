FROM alpine:3.20
RUN apk add --no-cache openvpn socat bash iproute2 python3
COPY entrypoint.sh /entrypoint.sh
COPY ldap_proxy.py /ldap_proxy.py
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
