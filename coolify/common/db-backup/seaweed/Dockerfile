# seaweed-backup — スクリプトを焼き込むだけの薄いイメージ。
# bind mount をやめた理由は ../Dockerfile のコメントと同じ。
FROM alpine:3.20
RUN apk add --no-cache docker-cli tar gzip
COPY seaweed-backup.sh /seaweed-backup.sh
RUN chmod +x /seaweed-backup.sh
