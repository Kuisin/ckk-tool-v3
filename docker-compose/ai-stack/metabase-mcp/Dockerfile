# Metabase MCP server exposed to Open WebUI as an OpenAPI tool server via mcpo.
# mcpo spawns server.py (stdio MCP) and serves its tools as HTTP/OpenAPI on :8000.
FROM python:3.12-slim
WORKDIR /app
# バージョンは**固定**する（techstack のバージョン方針どおり）。以前は
# `mcp>=1.2` / `mcpo>=0.0.16` と開いていたため、再ビルドしたときに mcp 2.0.0 が
# 入り、mcpo が使う `mcp.client.streamable_http.streamablehttp_client` が
# 消えて ImportError で起動ループに落ちた。上げるときは 2 つ一緒に検証する。
RUN pip install --no-cache-dir "mcp==1.29.0" "mcpo==0.0.20"
COPY server.py .
EXPOSE 8000
# --api-key (if MCPO_API_KEY set) protects the OpenAPI endpoints; Open WebUI sends it.
CMD ["sh","-c","exec mcpo --host 0.0.0.0 --port 8000 ${MCPO_API_KEY:+--api-key \"$MCPO_API_KEY\"} -- python server.py"]
