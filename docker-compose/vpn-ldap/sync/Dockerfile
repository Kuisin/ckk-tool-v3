FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir ldap3==2.9.1 psycopg2-binary==2.9.10
COPY sync.py service.py ./
EXPOSE 8088
CMD ["python", "service.py"]
