# Metabase MCP server exposed to Open WebUI as an OpenAPI tool server via mcpo.
# mcpo spawns server.py (stdio MCP) and serves its tools as HTTP/OpenAPI on :8000.
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "mcp>=1.2" "mcpo>=0.0.16"
COPY server.py .
EXPOSE 8000
# --api-key (if MCPO_API_KEY set) protects the OpenAPI endpoints; Open WebUI sends it.
CMD ["sh","-c","exec mcpo --host 0.0.0.0 --port 8000 ${MCPO_API_KEY:+--api-key \"$MCPO_API_KEY\"} -- python server.py"]
