# intake-gateway — 受信箱を巡回して注文書の添付を取込フォルダへ置くサイドカー。
#
# nextjs-web と**同じ uid/gid (1001:1001)** で走らせるのが要点。取込フォルダは
# 両者が共有するバインドマウントで、こちらが書いたファイルを向こうが
# `.processing` へ改名し `processed/` へ移す。uid がずれると EACCES で
# 黙って止まる（画面上は「取込待ちのまま動かない」としか見えない）。
FROM python:3.12-slim

# img2pdf/Pillow の TIFF デコードに必要な共有ライブラリのみ。
RUN apt-get update \
  && apt-get install -y --no-install-recommends libtiff6 libjpeg62-turbo \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY gateway ./gateway
COPY tests ./tests

# nextjs-web の Dockerfile と揃える（groupadd -g 1001 nodejs / useradd -u 1001）。
RUN groupadd -g 1001 intake && useradd -u 1001 -g intake -m intake
USER intake

# 無いとポーリングの失敗が docker logs に出ない（ldap-sync で踏んだ罠）。
ENV PYTHONUNBUFFERED=1

# 生存の印（runner.touch_alive）が 15 分更新されなければ unhealthy。IMAP が
# 半開で固まってもプロセス自体は生きているので、これが無いと誰も気付かない。
HEALTHCHECK --interval=60s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import os,sys,time; p=os.environ.get('INTAKE_ALIVE_STAMP','/tmp/intake-gateway-alive'); sys.exit(0 if os.path.exists(p) and time.time()-os.stat(p).st_mtime < 900 else 1)"

CMD ["python", "-m", "gateway.runner"]
