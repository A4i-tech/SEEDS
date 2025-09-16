# Builder stage: install dependencies
FROM python:3.13-slim-bookworm AS builder

WORKDIR /app

COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

COPY . .

# Final stage: minimal runtime
FROM python:3.13-slim-bookworm

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local
COPY --from=builder /app /app

ENV PATH=/root/.local/bin:$PATH

EXPOSE 9210

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9210"]