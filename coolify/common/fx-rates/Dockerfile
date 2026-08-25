# fx-rates — app.currencies の対円レートを日次更新する小さな cron コンテナ。
# 毎日 07:15 JST（為替 API 側の日次更新は 09:00 JST 頃までに反映されるため、
# 前日レートで一日ズレることはあるが分析用途では許容）。起動時にも 1 回実行する
# ので、コンテナ再起動 = 即時リフレッシュとして使える。
FROM alpine:3.21

RUN apk add --no-cache curl jq postgresql17-client tzdata

COPY update-rates.sh /usr/local/bin/update-rates.sh
RUN chmod +x /usr/local/bin/update-rates.sh \
 && echo '15 7 * * * /usr/local/bin/update-rates.sh' > /etc/crontabs/root

# 起動時に 1 回流してから crond をフォアグラウンドで
CMD ["sh", "-c", "/usr/local/bin/update-rates.sh || true; exec crond -f -l 8"]
