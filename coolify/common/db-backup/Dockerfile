# Same image as shared-db so pg_basebackup / pg_combinebackup / pg_verifybackup
# match the server major (17) exactly, and restore drills can start postgres on
# restored data with the pgroonga .so present.
FROM groonga/pgroonga:4.0.6-alpine-17

# logical-dump.sh も焼き込む。user 70:70 で動くコンテナは Coolify の 0750
# チェックアウトから bind mount したファイルを読めないため。
COPY entrypoint.sh backup.sh logical-dump.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh /usr/local/bin/logical-dump.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
