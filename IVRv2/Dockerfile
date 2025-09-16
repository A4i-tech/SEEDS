# Builder stage
FROM python:3.13-slim-bookworm AS builder

WORKDIR /app

COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

COPY . .

# Final, minimal image
FROM python:3.13-slim-bookworm

WORKDIR /app

COPY --from=builder /root/.local /root/.local
COPY --from=builder /app /app

ENV PATH=/root/.local/bin:$PATH

EXPOSE 8210

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8210"]