FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8080
# 1 プロセスで足りる（送信は postfix に渡すだけで、ここに滞留しない）。
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
