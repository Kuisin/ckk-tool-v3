# prometheus — 設定を焼き込む（uid 65534 = nobody が読める必要がある）。
FROM prom/prometheus:v3.1.0
COPY --chown=65534:65534 prometheus/prometheus.yml /etc/prometheus/prometheus.yml
