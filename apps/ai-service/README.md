# ai-service (EA AUTOMATIC)

Motor de IA isolado (FastAPI + Python 3.12, gerido por `uv`). Consome **Vertex AI / Gemini
(Google)** via SDK do Google Cloud, autenticado por **service account** no projeto
`ea-v2-automatic` — **não usa Claude/Anthropic API** (CLAUDE.md §A.2/§A.5 INT-3).

Fase 0: apenas esqueleto + `/health`. Não sobe nesta fase.

## Dev

```bash
uv sync --all-extras       # instala deps + grupo dev
uv run pytest -q           # testes
uv run ruff check .        # lint
uv run uvicorn app.main:app --host 127.0.0.1 --port 8010   # (fases futuras)
```
