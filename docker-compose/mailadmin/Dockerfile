# Playwright base image ships chromium + all system deps for headless browser sync.
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
