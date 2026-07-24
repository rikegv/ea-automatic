"""
FastAPI do motor de IA do EA AUTOMATIC (CLAUDE.md §A.2 / INT-3).

Fase 4: auditoria documental incremental por IA (F2), arquivamento no Drive (INT-2) e
gerador de kit (F9). Vertex AI / Gemini autenticado por service account (`ea-v2-automatic`).
Endpoints internos protegidos por X-Internal-Token (defesa em profundidade, sem porta pública).
"""

from fastapi import FastAPI

from app.config import get_settings
from app import drive as drive_mod
from app import gemini
from app.auth import require_internal_token
from fastapi import Depends
from app.routers import auditoria, drive, kit, vt

# Fail-fast no boot: valida o ambiente (ex.: DRIVE_MOCK proibido em produção) antes de servir.
get_settings()

app = FastAPI(title="EA AUTOMATIC — AI Service", version="0.1.0")

app.include_router(auditoria.router)
app.include_router(drive.router)
app.include_router(kit.router)
app.include_router(vt.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ea-ai-service"}


@app.get("/readiness")
def readiness(_: None = Depends(require_internal_token)) -> dict:
    """Caminho REAL do Vertex (não /health): geração mínima. Protegido por X-Internal-Token."""
    return gemini.readiness_vertex()


@app.get("/readiness/drive")
def readiness_drive(_: None = Depends(require_internal_token)) -> dict:
    """Caminho REAL do Drive: about.get com a credencial em uso. Protegido por X-Internal-Token."""
    return drive_mod.readiness_drive()
