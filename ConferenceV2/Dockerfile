# Dockerfile for ConferenceV2 FastAPI backend
FROM python:3.13-slim-bookworm

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port (default for uvicorn)
EXPOSE 9210

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9210"]

