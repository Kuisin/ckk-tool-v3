FROM python:3.11-slim
WORKDIR /app
# System libs required by OpenCV / ONNXRuntime at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
# Warm the OCR engine (RapidOCR ships its PP-OCR models in the wheel — no download).
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()" || true
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
