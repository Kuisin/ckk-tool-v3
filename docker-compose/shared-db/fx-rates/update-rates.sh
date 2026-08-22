#!/bin/sh
# app.currencies の rate_per_100_jpy（100 円で買えるその通貨の量）を為替 API から更新する。
#
# API: open.er-api.com（ExchangeRate-API の無料オープンエンドポイント。キー不要・
# 日次更新。Rates By Exchange Rate API — https://www.exchangerate-api.com）。
# JPY 基準で「1 JPY = X 通貨」が返るので rate_per_100_jpy = X × 100。
# JPY 行（= 100）は更新対象外。
#
# 更新対象は DB に登録済みの有効通貨（JPY 除く）だけ — 通貨の追加/削除はマスタ側
# （app.currencies）が正で、このジョブはレートしか触らない。API に無い通貨・
# 0 以下の値はスキップして残りを続行する（部分失敗で全体を落とさない）。
# 書き込みは専用ロール fx_rates（app.currencies の rate_per_100_jpy/updated_at の
# UPDATE のみ — grants.sql）。レートは分析用換算（会計処理用ではない）。
set -u

API_URL="${FX_API_URL:-https://open.er-api.com/v6/latest/JPY}"
export PGPASSWORD="${FX_DB_PASSWORD:?FX_DB_PASSWORD is required}"
PSQL="psql -h ${FX_DB_HOST:-shared-db} -U fx_rates -d ${FX_DB_NAME:-ckk} -v ON_ERROR_STOP=1 -Atq"

json=$(curl -fsS --max-time 30 "$API_URL") || { echo "fx-rates: API fetch failed"; exit 1; }
result=$(printf '%s' "$json" | jq -r '.result // empty')
if [ "$result" != "success" ]; then
  echo "fx-rates: unexpected API response (result=$result)"; exit 1
fi

codes=$($PSQL -c "SELECT code FROM app.currencies WHERE is_active AND code <> 'JPY' ORDER BY code") \
  || { echo "fx-rates: DB read failed"; exit 1; }

updated=0
for c in $codes; do
  per_jpy=$(printf '%s' "$json" | jq -r --arg c "$c" '.rates[$c] // empty')
  case "$per_jpy" in
    ''|null) echo "fx-rates: $c not in API response, skipped"; continue ;;
  esac
  n=$($PSQL -c "UPDATE app.currencies
                SET rate_per_100_jpy = round(($per_jpy)::numeric * 100, 6), updated_at = now()
                WHERE code = '$c' AND ($per_jpy)::numeric > 0
                RETURNING code" | wc -l)
  if [ "$n" -ge 1 ]; then
    echo "fx-rates: $c -> rate_per_100_jpy $(printf '%s' "$json" | jq -r --arg c "$c" '.rates[$c] * 100')"
    updated=$((updated + 1))
  else
    echo "fx-rates: $c not updated (non-positive rate?)"
  fi
done
echo "fx-rates: done, $updated currencies updated ($(date '+%Y-%m-%d %H:%M:%S %Z'))"
