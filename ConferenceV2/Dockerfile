# Builder stage: install dependencies
FROM python:3.13-slim-bookworm AS builder

WORKDIR /app

RUN pip install poetry

ENV POETRY_VENV_IN_PROJECT=false
ENV POETRY_CACHE_DIR=/tmp/poetry_cache

COPY pyproject.toml poetry.lock* ./

RUN poetry config virtualenvs.create false \
    && poetry install --only=main --no-root \
    && rm -rf $POETRY_CACHE_DIR

COPY . .

# Final stage: minimal runtime
FROM python:3.13-slim-bookworm

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app /app

EXPOSE 9210

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9210"]