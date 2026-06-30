"""
FastAPI do motor de IA do EA AUTOMATIC (CLAUDE.md §A.2 / INT-3).

Fase 4: auditoria documental incremental por IA (F2), arquivamento no Drive (INT-2) e
gerador de kit (F9). Vertex AI / Gemini autenticado por service account (`ea-v2-automatic`).
Endpoints internos protegidos por X-Internal-Token (defesa em profundidade, sem porta pública).
"""

from fastapi import FastAPI

from app.config import get_settings
from app.routers import auditoria, drive, kit

# Fail-fast no boot: valida o ambiente (ex.: DRIVE_MOCK proibido em produção) antes de servir.
get_settings()

app = FastAPI(title="EA AUTOMATIC — AI Service", version="0.1.0")

app.include_router(auditoria.router)
app.include_router(drive.router)
app.include_router(kit.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ea-ai-service"}
