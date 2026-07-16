# restore-agent — thin FastAPI service. All heavy IO (pg_dump/pg_restore/tar)
# runs in one-shot postgres:17-alpine / alpine containers launched via the
# Docker socket, so this image needs only Python + the docker SDK.
FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
EXPOSE 9000
CMD ["uvicorn", "agent:app", "--host", "0.0.0.0", "--port", "9000"]
