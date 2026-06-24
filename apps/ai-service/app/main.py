"""
FastAPI do motor de IA do EA AUTOMATIC (CLAUDE.md §A.2 / INT-3).

Fase 0: apenas o esqueleto e um healthcheck. A integração com Vertex AI / Gemini
(autenticada por service account no projeto `ea-v2-automatic`) entra na Fase 4.
Este serviço NÃO sobe na Fase 0.
"""

from fastapi import FastAPI

app = FastAPI(title="EA AUTOMATIC — AI Service", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ea-ai-service"}
