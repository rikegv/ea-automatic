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


class CadastroBancarioIn(_CamelModel):
    """Dados bancários DIGITADOS pelo candidato, para a IA conferir contra o comprovante.

    Só chega na auditoria do comprovante bancário, e só com os campos que o candidato preencheu (os
    três são opcionais no Pandapé). O backend é quem decide o que mandar; aqui só se recebe.
    §A.6: transita em memória, nunca é logado.
    """

    banco: str | None = None
    agencia: str | None = None
    conta: str | None = None


class AuditoriaRequest(_CamelModel):
    # Auditoria por CONJUNTO: 1 ou mais arquivos do MESMO documento (frente e verso, páginas),
    # auditados numa única chamada para UM veredito. O backend garante a lista não vazia.
    staging_paths: list[str] = Field(default_factory=list)
    tipo_documento_codigo: str
    tipo_documento_nome: str
    candidato: CandidatoIn
    regras: list[RegraIn] = Field(default_factory=list)
    # Ausente na esmagadora maioria das auditorias: só o comprovante bancário o recebe.
    cadastro_bancario: CadastroBancarioIn | None = None


class ResultadoAuditoria(_CamelModel):
    """Espelha ResultadoAuditoria (shared-types). `motivo` NUNCA contém PII (§A.6)."""

    valido: bool
    status: AuditoriaStatus
    motivo: str
    campos_conferidos: list[str] = Field(default_factory=list)
    # Campos do cadastro que não conferem com o documento. Separado do `status` de propósito: é AVISO,
    # não reprovação (ver o comentário em shared-types). RÓTULOS, nunca valores (§A.6).
    divergencias_cadastro: list[str] = Field(default_factory=list)


# ── Portal do Candidato: o leitor (docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md) ──────────────
class PortalLerRequest(_CamelModel):
    """Pedido de leitura de UM objeto do bucket de entrada do Portal.

    Chega do BACKEND (X-Internal-Token), nunca do navegador do candidato: o celular só fala com o
    bucket do Google. O `objeto` é o nome que o próprio backend escolheu ao assinar a credencial de
    escrita, então ele nunca vem do aparelho de quem enviou.
    """

    bucket: str
    objeto: str
    tipo_documento_codigo: str
    tipo_documento_nome: str
    candidato: CandidatoIn
    regras: list[RegraIn] = Field(default_factory=list)


class PortalChegada(_CamelModel):
    """A PROVA de que o arquivo chegou, mais o que o backend precisa para tratar o objeto.

    §A.6: aqui não entra o nome do objeto (carrega nome e CPF), nem trecho do documento, nem valor
    extraído. São números e rótulos. O `tipoDeclarado` é o que o cliente disse e serve só para o
    backend corrigir o tipo do objeto depois da leitura; quem vale é o `mimeDetectado`, dos magic
    bytes.
    """

    tamanho_bytes: int
    mime_detectado: str | None = None
    tipo_declarado: str | None = None
    md5: str | None = None
    criado_em: str | None = None
    geracao: int | None = None
    paginas: int | None = None
    largura: int | None = None
    altura: int | None = None
    conteudo_ativo: list[str] = Field(default_factory=list)


class PortalSugestaoCampo(_CamelModel):
    """UM campo lido do documento, para o candidato conferir na tela. NUNCA é dado final.

    `lido=False` com `valor` vazio é resposta NORMAL e frequente: significa que a IA não conseguiu ler
    aquele campo com confiança suficiente e NÃO chutou. O consumidor mostra o campo em branco para a
    pessoa digitar. Campo chutado num formulário de admissão vira dado errado no eSocial, que é multa;
    campo vazio custa dez segundos de digitação.
    """

    campo: str
    rotulo: str
    valor: str = ""
    # 0.0 sempre que `lido=False`. Acima do piso de `portal_extracao.CONFIANCA_MINIMA` quando lido.
    confianca: float = 0.0
    lido: bool = False


class PortalSugestoes(_CamelModel):
    """O bloco de AUTO-PREENCHIMENTO. A forma diz o que ele é, para ninguém confundir com dado.

    Os dois campos fixos existem por causa do veto V12 (Camada G5): `origem` e
    `exigeConfirmacaoHumana` viajam em toda resposta para que nenhum consumidor, agora ou daqui a um
    ano, trate isto como valor conferido. Nada daqui escreve em dado autoritativo: CPF, nome e
    vínculo com a admissão vêm do link e da base, nunca do documento lido, e quem confirma é humano.

    §A.6: este é o ÚNICO lugar da resposta que carrega PII de conteúdo, e ele existe para ir à tela do
    candidato. Nenhum valor daqui pode aparecer em log, mensagem de erro ou rastro de exceção.
    """

    origem: Literal["IA_SUGESTAO"] = "IA_SUGESTAO"
    exige_confirmacao_humana: Literal[True] = True
    campos: list[PortalSugestaoCampo] = Field(default_factory=list)


class PortalLerResponse(_CamelModel):
    """Campos e veredicto, NUNCA o binário e NUNCA o texto integral do documento (§A.6).

    `aceito=False` com `recusa` preenchido é resposta NORMAL (arquivo que não serve), não erro: o
    HTTP segue 200 e o backend mostra o `motivo` ao candidato. Erro HTTP fica para falha nossa.
    """

    aceito: bool
    recusa: str | None = None
    motivo: str = ""
    chegada: PortalChegada
    auditoria: ResultadoAuditoria | None = None
    # ACRÉSCIMO, não troca: o `auditoria` acima responde "este documento serve?" e continua igual; o
    # `sugestoes` responde "e o que está escrito nele?", que é a metade do auto-preenchimento. Nulo
    # quando não houve leitura (arquivo recusado, sem regra ativa) ou quando o tipo de documento não
    # tem catálogo de campos mapeado.
    sugestoes: PortalSugestoes | None = None


# ── Drive ──────────────────────────────────────────────────────────────────
class ArquivoIn(_CamelModel):
    staging_path: str
    nome_final: str
    subpasta: DriveSubpasta


class ArquivarRequest(_CamelModel):
    parent_folder_id: str
    pasta_nome: str
    arquivos: list[ArquivoIn] = Field(default_factory=list)
    # ÂNCORA (OST da duplicação): id da pasta que a admissão JÁ tem gravada. Quando vem, o
    # arquivamento vai direto nela e NÃO procura por nome, que é o que matava a corrida na raiz
    # (duas execuções simultâneas procuravam, não achavam e criavam duas pastas). Só se a pasta
    # tiver sumido do Drive o fluxo cai de volta na busca por nome.
    pasta_id: str | None = None


class ArquivamentoDrive(_CamelModel):
    """Espelha ArquivamentoDrive (shared-types)."""

    pasta_url: str
    arquivados: int
    # Ids dos arquivos CRIADOS nesta chamada, na ordem em que subiram. Existe para quem precisa do
    # link do arquivo (a coleta de VT grava a URL para a tela de Benefícios abrir o formulário).
    # Arquivo ignorado por já estar no destino NÃO entra: ele não foi criado agora. §A.6: id do
    # Drive não é dado pessoal; o nome do arquivo, que carrega o nome do candidato, não sai daqui.
    arquivos_ids: list[str] = []
    # Quantos arquivos foram PULADOS por já estarem no destino com o mesmo conteúdo (checar antes de
    # subir). Zero é o caso normal; maior que zero significa que a duplicação foi evitada.
    ignorados: int = 0
    # A pasta do prontuário já existia e foi REUTILIZADA, em vez de criada agora. Sobe até a tela.
    pasta_ja_existia: bool = False
    # DUPLICATAS encontradas (OST da duplicação): as outras pastas do mesmo prontuário que NÃO foram
    # escolhidas. O módulo não apaga nada (§A.6), então elas sobem para o EA avisar o diretor, que
    # consolida e remove à mão. Lista de ids do Drive, que não são PII.
    duplicatas: list[str] = Field(default_factory=list)
    # Arquivos que NÃO subiram. Um arquivo que falha não derruba mais o lote: a pasta e o que subiu
    # são preservados, o link volta ao EA e a próxima tentativa completa o resto. Zero é o normal.
    falhas: int = 0
    # Motivos distintos das falhas (ex.: "TimeoutError"), para o EA gravar um aviso legível. Sem PII.
    motivo_falhas: list[str] = Field(default_factory=list)


# ── Coleta de VT (§A.17): bucket do GCS onde o app externo (Firebase) grava os PDFs ──────────
# A fonte deixou de ser uma pasta do Drive e passou a ser um bucket do GCS; o EA só LÊ o bucket.
class ListarColetaVtRequest(_CamelModel):
    bucket: str


class ItemColetaVt(_CamelModel):
    """Um objeto do bucket. §A.6: o nome cru NUNCA sai do ai-service; sobe só o handle já resolvido.

    `id` é o NOME do objeto (o backend precisa dele para pedir o download); `md5` é hex.

    HANDLE de casamento (dual-read da transição do vazamento 2). São campos IRMÃOS; no máximo UM vem
    preenchido, e o backend decide por presença: `if admissao_id` → casa por admissão; `elif cpf` →
    casa por CPF (legado); senão → nome fora do padrão.
    - LEGADO (nome antigo `NOME + 11 dígitos`): `cpf` preenchido, `admissao_id` nulo.
    - NOVO (nome opaco): `admissao_id` preenchido (lido do JSON irmão), `cpf` nulo.
    """

    id: str
    md5: str | None = None
    mime_type: str
    cpf: str | None = None
    admissao_id: str | None = None
    eh_pdf: bool


class ListarColetaVtResponse(_CamelModel):
    arquivos: list[ItemColetaVt] = Field(default_factory=list)


class BaixarColetaVtRequest(_CamelModel):
    bucket: str
    # Nome do objeto no bucket (o `id` devolvido por /coleta-vt/listar).
    id: str


class BaixarColetaVtResponse(_CamelModel):
    staging_path: str


class OrfaosColetaVtRequest(_CamelModel):
    bucket: str


class ItemOrfaoVt(_CamelModel):
    """Quem é o dono de um formulário que não casou. Leitura TRANSIENTE, nunca persistida (§A.6)."""

    # Nome do OBJETO no bucket. O backend já o recebe em `/listar` (é o handle para baixar o
    # arquivo), e sem ele o casamento manual não teria sobre o que agir.
    id: str
    md5: str | None = None
    cpf: str | None = None
    # Handle novo (nome opaco): o `admissaoId` lido do JSON irmão. Irmão do `cpf`; no máximo um vem.
    admissao_id: str | None = None
    # Nome que a PESSOA preencheu no app, extraído do nome do objeto ANTIGO. `None` no nome opaco: a
    # identidade do arquivo novo é o admissaoId, e o nome da pessoa não vive mais no nome do objeto.
    nome: str | None = None
    criado_em: str | None = None


class OrfaosColetaVtResponse(_CamelModel):
    arquivos: list[ItemOrfaoVt] = []


class DadosColetaVtRequest(_CamelModel):
    bucket: str
    # Nome do objeto do PDF (o `id` de /coleta-vt/listar). O JSON irmão é derivado DAQUI, no
    # servidor, trocando a extensão: o nome carrega o nome do candidato e não trafega montado
    # pelo backend (§A.6).
    id: str


class DadosColetaVtResponse(_CamelModel):
    """Campos estruturados do formulário, lidos do JSON irmão do PDF.

    `encontrado=False` é o caso NORMAL de todo formulário anterior ao JSON irmão: o PDF é arquivado
    do mesmo jeito, só não há valores para a tela somar. Nunca é erro.
    """

    encontrado: bool = False
    # Cru, como o app externo gravou. A validação de forma é feita no backend, junto com a escrita,
    # para não haver duas régua de validação do mesmo dado.
    dados: dict | None = None


# ── Validação de pasta-pai do Drive (read-only, antes de o EA cadastrar o id) ─
class ValidarPastaRequest(_CamelModel):
    folder_id: str


class LocalizarPastaRequest(_CamelModel):
    """Procura a pasta do prontuário SEM criar nada (reconciliação automática do Diagnóstico)."""

    parent_folder_id: str
    pasta_nome: str


class LocalizarPastaResponse(_CamelModel):
    """A pasta existe? Devolve a MAIS COMPLETA e as outras, com a mesma régua do arquivamento."""

    encontrada: bool
    pasta_id: str | None = None
    pasta_url: str | None = None
    arquivos: int = 0
    duplicatas: list[str] = Field(default_factory=list)


class InspecionarSubpastaRequest(_CamelModel):
    """A subpasta do prontuário já tem documento? SOMENTE LEITURA, não cria pasta nenhuma.

    Existe para a carga de ASO conferir o Drive ANTES de subir: documento salvo à mão pelo time não
    pode ser sobrescrito nem duplicado por rotina em lote.
    """

    parent_folder_id: str
    pasta_nome: str
    # Chave de `SUBPASTA_NOME` (ASO, ADMISSAO, BENEFICIOS, DOCUMENTOS_PESSOAIS).
    subpasta: str


class InspecionarSubpastaResponse(_CamelModel):
    """Estado da subpasta. Sem PII: só ids, contagens e booleanos (§A.6)."""

    pasta_encontrada: bool = False
    pasta_id: str | None = None
    pasta_url: str | None = None
    subpasta_encontrada: bool = False
    subpasta_id: str | None = None
    arquivos: int = 0


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


# ── Planilha de LOJAS: mapeamento de colunas por IA (cenário 1, etapa 2) ────
class PlanilhaMapearRequest(_CamelModel):
    """O que o backend manda: só o CABEÇALHO e uma AMOSTRA, nunca a planilha inteira.

    Quinze linhas bastam para reconhecer uma coluna; as outras 1.985 não acrescentam informação e
    custariam tokens. §A.6: nada disto é persistido nem logado.
    """

    cabecalho: list[str]
    amostra: list[list[str]] = []


class MapeamentoColunas(_CamelModel):
    """O que a IA devolve: ÍNDICE de cada coluna (base 0) ou nulo quando aquilo não existe.

    Índice e não nome, porque o nome pode vir vazio, repetido ou com acento, e é pelo índice que o
    backend aplica o mapeamento nas linhas todas.
    """

    coluna_nome: int | None = None
    coluna_endereco: int | None = None
    coluna_codigo: int | None = None
    confianca: str = "BAIXA"
    observacao: str = ""


# ── Planilha de CANDIDATOS: mapeamento de colunas por IA (Central de Candidatos, A&S) ────
# Espelha MapeamentoColunas (lojas). O request é o MESMO (cabeçalho + amostra), então reusa
# PlanilhaMapearRequest; muda só o que a IA devolve, porque candidato tem outras colunas.
class MapeamentoColunasCandidato(_CamelModel):
    """ÍNDICE (base 0) de cada coluna de CANDIDATO, ou nulo quando aquilo não existe na planilha.

    Índice e não nome, pelo mesmo motivo das lojas: o cabeçalho pode vir vazio, repetido ou com
    acento, e é pelo índice que o backend aplica o mapeamento nas linhas todas. Só `colunaNome` é
    essencial; os demais podem faltar (viram null) e o backend segue com o que veio.
    """

    coluna_nome: int | None = None
    coluna_cpf: int | None = None
    coluna_email: int | None = None
    coluna_telefone: int | None = None
    coluna_nascimento: int | None = None
    coluna_cidade: int | None = None
    coluna_uf: int | None = None
    confianca: str = "BAIXA"
    observacao: str = ""
