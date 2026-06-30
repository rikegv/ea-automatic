# EA AUTOMATIC — ai-service (FastAPI + Vertex AI/Gemini). Fase 4.
# Imagem isolada; porta interna 8000. Sem porta pública (defesa em profundidade via X-Internal-Token).
FROM python:3.12-slim

# uv: gestor de dependências (CLAUDE.md §A.2).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Camada de deps (cacheável): instala a partir do lock antes de copiar o código.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Código da aplicação.
COPY app ./app
COPY README.md ./
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

# credentials.json e .env são montados em runtime (NUNCA copiados para a imagem — §A.6).
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
