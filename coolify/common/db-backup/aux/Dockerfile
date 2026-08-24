# aux-backup — docker CLI（周辺 DB の docker exec pg_dump 用）+ openssl（秘密情報の
# 暗号化 tar 用）。docker.sock を使うのは restore-agent と同じ非公開サービスのみ。
FROM docker:27-cli
RUN apk add --no-cache bash tzdata openssl coreutils
COPY aux-backup.sh /aux-backup.sh
ENTRYPOINT ["/bin/bash", "/aux-backup.sh"]
