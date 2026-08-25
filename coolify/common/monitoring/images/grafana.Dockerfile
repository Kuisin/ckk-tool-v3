# grafana — provisioning（データソース・アラート・ダッシュボード定義）を焼き込む。
# uid 472 = grafana。ダッシュボードの JSON も読み取り専用なので一緒に入れる。
FROM grafana/grafana:11.6.0
COPY --chown=472:472 grafana/provisioning /etc/grafana/provisioning
COPY --chown=472:472 grafana/dashboards   /var/lib/grafana/dashboards
