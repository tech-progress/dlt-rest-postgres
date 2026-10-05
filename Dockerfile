FROM ghcr.io/astral-sh/uv:0.12.22@sha256:f513a91fc62fe7c17567eee97230dd198e43edb8a9fbecca843714a4358fe1bc AS uv
FROM python:3.12.15-slim-bookworm@sha256:54c85f3c47607a77f32adec749d3c81d1348bf25833671f512b26a9b6d778cb3 AS dependencies
COPY --from=uv /uv /bin/uv
WORKDIR /app
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 RUNTIME__DLTHUB_TELEMETRY=false UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev libpq-dev=15.19-0+deb12u1 \
    && uv sync --frozen --no-dev --no-install-project

FROM python:3.12.15-slim-bookworm@sha256:54c85f3c47607a77f32adec749d3c81d1348bf25833671f512b26a9b6d778cb3 AS app
WORKDIR /app
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 RUNTIME__DLTHUB_TELEMETRY=false
RUN apt-get update && apt-get install -y --no-install-recommends libpq5=15.19-0+deb12u1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home loader
COPY --from=dependencies /app/.venv /app/.venv
COPY pipeline.py ./
COPY LICENSE ./LICENSE
COPY THIRD_PARTY_NOTICES.md ./
COPY licenses/ ./licenses/
USER 10001:10001
CMD ["python", "pipeline.py"]

FROM app AS test
COPY tests/ tests/
COPY sql/ sql/
COPY scripts/smoke.py scripts/smoke.py
COPY scripts/draft.py scripts/draft.py
COPY scripts/verify-runtime.py scripts/verify-runtime.py
COPY template-defaults.json template-descriptions.json template-networking.json template-volumes.json ./

FROM app AS runtime
