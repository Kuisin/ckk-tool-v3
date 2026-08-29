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

CMD ["python", "-m", "gateway.runner"]
