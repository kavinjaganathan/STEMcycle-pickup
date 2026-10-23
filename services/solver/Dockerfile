FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY solver.py app.py ./
RUN useradd --create-home solver
USER solver
# Render sets $PORT. Access logs are off: request bodies never contain PII, but keep logs minimal anyway.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
