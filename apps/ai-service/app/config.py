"""Configuração do ai-service — lê o ambiente (.env) via pydantic-settings.

Credencial Google unificada (service account) serve Vertex AI (INT-3) e Drive (INT-2).
Nenhum segredo é logado aqui (§A.6).
"""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Valores de APP_ENV tratados como ambiente produtivo (fail-fast contra mock em produção).
_PROD_ENVS = {"prod", "production", "producao", "produção"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    google_application_credentials: str = "./credentials.json"
    google_cloud_project: str = "ea-v2-automatic"
    vertex_ai_location: str = "us-central1"
    gemini_model: str = "gemini-2.5-flash"
    staging_dir: str = "/tmp/ea-staging"
    internal_token: str = ""
    # Banco (somente leitura): o motor de kit lê o dicionário de títulos ATIVOS do kit selecionado
    # em kit_regra_documento. Vazio = motor de kit inerte (endpoint responde 503).
    database_url: str = ""
    # Motor de kit, fila controlada + retry/backoff contra o 429 do Vertex (disputa temporária de
    # recurso, não limite fixo). Lotes em SEQUÊNCIA com espaçamento; no 429, backoff exponencial.
    kit_lote_paginas: int = 28
    kit_espaco_lote_s: float = 1.5
    kit_retry_max: int = 5
    kit_retry_base_s: float = 2.0
    # Janela de retenção do resultado processado (em memória): o consultor pode sair da tela e
    # voltar dentro dessa janela e reencontrar o último resultado, sem custo novo de I.A. Depois,
    # o job é expurgado (§A.6). Casa com o TTL de 2h da staging (StagingPurgeService).
    kit_job_ttl_s: int = 2 * 60 * 60
    # Domain-wide delegation (INT-2, padrão CentraAtend). Vazio = SA pura (só Shared Drives
    # aceitam upload; My Drive recusa por falta de quota). Preencha com o e-mail do usuário a
    # impersonar quando o destino for um My Drive compartilhado.
    drive_delegated_subject: str = ""
    # Modo mock do Drive (validação visual híbrida): não chama a API do Google; devolve um
    # ArquivamentoDrive plausível. Ligar enquanto a SA não tem acesso de escrita ao Shared Drive.
    drive_mock: bool = False

    @property
    def is_producao(self) -> bool:
        return self.app_env.strip().lower() in _PROD_ENVS

    @model_validator(mode="after")
    def _proibir_mock_em_producao(self) -> "Settings":
        # Fail-fast: o mock do Drive nunca pode subir em produção (§A.6 — risco de dado falso).
        if self.drive_mock and self.is_producao:
            raise ValueError(
                "DRIVE_MOCK=true é proibido em produção (APP_ENV de produção). "
                "Desligue o mock ou ajuste APP_ENV."
            )
        return self

    @property
    def credentials_path(self) -> Path:
        """Resolve o caminho da credencial relativo à raiz do ai-service."""
        p = Path(self.google_application_credentials)
        if p.is_absolute():
            return p
        return (Path(__file__).resolve().parent.parent / p).resolve()

    @property
    def kits_dir(self) -> Path:
        return Path(self.staging_dir) / "_kits"


@lru_cache
def get_settings() -> Settings:
    return Settings()
