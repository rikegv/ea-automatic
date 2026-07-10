"""Schemas Pydantic — espelham os contratos congelados em packages/shared-types/src/index.ts.

Campos JSON em camelCase (alias). Os enums replicam AUDITORIA_STATUS e DRIVE_SUBPASTA.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# Espelha AUDITORIA_STATUS / DRIVE_SUBPASTA do shared-types.
AuditoriaStatus = Literal["VALIDADO", "INCONFORME", "PENDENTE"]
DriveSubpasta = Literal["ASO", "ADMISSAO", "BENEFICIOS", "DOCUMENTOS_PESSOAIS"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── Auditoria ──────────────────────────────────────────────────────────────
class CandidatoIn(_CamelModel):
    nome: str
    cpf: str


class RegraIn(_CamelModel):
    descricao_regra: str


class AuditoriaRequest(_CamelModel):
    staging_path: str
    tipo_documento_codigo: str
    tipo_documento_nome: str
    candidato: CandidatoIn
    regras: list[RegraIn] = Field(default_factory=list)


class ResultadoAuditoria(_CamelModel):
    """Espelha ResultadoAuditoria (shared-types). `motivo` NUNCA contém PII (§A.6)."""

    valido: bool
    status: AuditoriaStatus
    motivo: str
    campos_conferidos: list[str] = Field(default_factory=list)


# ── Drive ──────────────────────────────────────────────────────────────────
class ArquivoIn(_CamelModel):
    staging_path: str
    nome_final: str
    subpasta: DriveSubpasta


class ArquivarRequest(_CamelModel):
    parent_folder_id: str
    pasta_nome: str
    arquivos: list[ArquivoIn] = Field(default_factory=list)


class ArquivamentoDrive(_CamelModel):
    """Espelha ArquivamentoDrive (shared-types)."""

    pasta_url: str
    arquivados: int


# ── Kit (F9) ───────────────────────────────────────────────────────────────
class KitRequest(_CamelModel):
    staging_path: str
    nome_candidato: str


class KitResponse(_CamelModel):
    staging_path_kit: str


# ── Kit: motor de extração (OST etapa 2/3) ───────────────────────────────────
class DocumentoStagingIn(_CamelModel):
    staging_path: str
    # Nome do arquivo enviado (rótulo amigável na tela; o caminho de staging nunca é exposto, §A.6).
    arquivo: str


class KitExtrairRequest(_CamelModel):
    kit_tipo_id: str
    documentos: list[DocumentoStagingIn]


# Reimportação de PDFs para UM funcionário já identificado (anexa os documentos que faltavam).
class KitReimportarRequest(_CamelModel):
    documentos: list[DocumentoStagingIn]


# Início do job assíncrono (fila): o processamento roda em segundo plano, a tela acompanha por polling.
class KitJobStart(_CamelModel):
    job_id: str
    total_lotes: int


# Progresso/estado do job. `resultado` (dict já em camelCase) só vem quando status == "concluido".
class KitJobStatus(_CamelModel):
    status: str  # processando | concluido | erro
    lote_atual: int
    total_lotes: int
    mensagem: str
    retries: int
    resultado: dict | None = None
    erro: str | None = None
