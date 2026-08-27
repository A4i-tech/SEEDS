FROM python:3.12-slim AS builder

WORKDIR /app

RUN pip install poetry==1.8.3 && \
    poetry config virtualenvs.in-project true

COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-root --no-interaction

# OmniIngest needs starlette >=1.0 and the platform pins fastapi <0.119, so the
# textbook remediation pipelines get a venv of their own and are driven as a
# subprocess. Built only for the consumer tier: --build-arg INSTALL_REMEDIATION=true
ARG INSTALL_REMEDIATION=false
COPY app/remediation/requirements.txt remediation-requirements.txt
RUN mkdir -p /app/.venv-remediation && \
    if [ "$INSTALL_REMEDIATION" = "true" ]; then \
      python -m venv /app/.venv-remediation && \
      /app/.venv-remediation/bin/pip install --no-cache-dir -r remediation-requirements.txt; \
    fi


FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

COPY --from=builder /app/.venv .venv
COPY --from=builder /app/.venv-remediation .venv-remediation
COPY app/ app/

RUN chown -R appuser:appgroup /app

USER appuser

ENV PATH="/app/.venv/bin:$PATH" \
    REMEDIATION_PYTHON="/app/.venv-remediation/bin/python" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 4000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000"]
