FROM alpine:3.20
RUN apk add --no-cache openvpn socat bash iproute2
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
