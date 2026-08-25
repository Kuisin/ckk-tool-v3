# alloy — ログ収集の設定を焼き込む。alloy は root で動く（docker ソケットを
# 読むため）ので今の bind mount でも動くが、他と揃えておく方が
# 「設定はイメージに入っている」という一つの規則で読める。
FROM grafana/alloy:v1.7.5
COPY alloy/config.alloy /etc/alloy/config.alloy
