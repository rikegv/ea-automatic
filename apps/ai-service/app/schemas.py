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
    # Auditoria por CONJUNTO: 1 ou mais arquivos do MESMO documento (frente e verso, páginas),
    # auditados numa única chamada para UM veredito. O backend garante a lista não vazia.
    staging_paths: list[str] = Field(default_factory=list)
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
    # Quantos arquivos foram PULADOS por já estarem no destino com o mesmo conteúdo (checar antes de
    # subir). Zero é o caso normal; maior que zero significa que a duplicação foi evitada.
    ignorados: int = 0
    # A pasta do prontuário já existia e foi REUTILIZADA, em vez de criada agora. Sobe até a tela.
    pasta_ja_existia: bool = False


# ── Coleta de VT (§A.17): bucket do GCS onde o app externo (Firebase) grava os PDFs ──────────
# A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do GCS; o EA só LÊ o bucket.
class ListarColetaVtRequest(_CamelModel):
    bucket: str


class ItemColetaVt(_CamelModel):
    """Um objeto do bucket. §A.6: o nome cru NUNCA sai do ai-service; sobe só o CPF.

    `id` é o NOME do objeto (o backend precisa dele para pedir o download); `md5` é hex.
    """

    id: str
    md5: str | None = None
    mime_type: str
    cpf: str | None = None
    eh_pdf: bool


class ListarColetaVtResponse(_CamelModel):
    arquivos: list[ItemColetaVt] = Field(default_factory=list)


class BaixarColetaVtRequest(_CamelModel):
    bucket: str
    # Nome do objeto no bucket (o `id` devolvido por /coleta-vt/listar).
    id: str


class BaixarColetaVtResponse(_CamelModel):
    staging_path: str


# ── Validação de pasta-pai do Drive (read-only, antes de o EA cadastrar o id) ─
class ValidarPastaRequest(_CamelModel):
    folder_id: str


class ValidarPastaResponse(_CamelModel):
    """Veredito da checagem read-only. `motivo` NUNCA contém PII (§A.6); o folderId não é PII."""

    valido: bool
    motivo: str | None = None


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


# ── Documento de VT (§A.17 etapa 2, Parte D) ─────────────────────────────────
class ConducaoVt(_CamelModel):
    """Uma linha do itinerário, já resolvida pelo backend (nada é calculado aqui)."""

    sentido: str = Field(description="IDA ou VOLTA")
    meio_transporte: str = Field(description='Coluna "Meio de transporte": tipo + cidade')
    cartao: str = Field(description='Coluna "Cartão/tipo"')
    valor: float


class DocumentoVtRequest(_CamelModel):
    """Dados do documento de VT. Leva PII por necessidade (§A.6): nunca logar o corpo."""

    tipo: str = Field(description="OPTANTE ou NAO_OPTANTE")
    nome: str
    cpf: str
    data_nascimento: str | None = None
    endereco: str
    cidade_uf: str
    conducoes: list[ConducaoVt] = []
    total_ida: float = 0
    total_volta: float = 0
    total_dia: float = 0
