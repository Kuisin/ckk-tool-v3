# loki — 設定を焼き込む（bind mount だと Coolify の 0750 チェックアウトを
# uid 10001 が読めない）。build context は monitoring/ ディレクトリ。
FROM grafana/loki:3.4.2
COPY --chown=10001:10001 loki/loki-config.yaml /etc/loki/loki-config.yaml
