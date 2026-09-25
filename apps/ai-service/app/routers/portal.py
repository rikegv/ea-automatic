"""O LEITOR do Portal do Candidato: lê o objeto do bucket EM MEMÓRIA e devolve CAMPOS.

O CAMINHO APROVADO (docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md, seções 2, 3 e 6): o celular sobe o
arquivo UMA VEZ, direto para o bucket do Google; o backend então pede a leitura aqui, no mesmo ciclo,
com o candidato ainda na tela. GRAVA PRIMEIRO, LÊ DEPOIS, e a leitura vale também como CONFIRMAÇÃO DE
CHEGADA: o metadado do objeto é a prova, e o aviso do navegador não vale nada.

O QUE ESTA ROTA NÃO FAZ, E É O CENTRO DELA:
 - **não escreve em disco.** Não importa `app.staging`, não chama `escrever_staging` e não tem como
   chamar: o binário nasce em memória, é medido por orçamento de bytes e morre no fim da requisição.
 - **não devolve binário nem o texto do documento.** Saem o veredicto, os campos conferidos, números
   e, desde o auto-preenchimento, os VALORES dos campos mapeados daquele tipo de documento.
 - **não loga valor extraído, nome de objeto, nome ou CPF** (§A.6). O que vai ao log são números e
   rótulos de recusa. Isto é mais importante agora do que era: a resposta passou a carregar PII de
   conteúdo, e a única coisa que a separa do log é esta regra, escrita e testada.

O QUE A ROTA DEVOLVE, EM DUAS METADES QUE RESPONDEM A PERGUNTAS DIFERENTES:
 - `auditoria`, o VEREDICTO: "este documento serve?". Existia desde o início e não mudou de forma.
 - `sugestoes`, o AUTO-PREENCHIMENTO: "e o que está escrito nele?". É SUGESTÃO, nunca dado final
   (veto V12), e a forma da resposta diz isso: `origem` e `exigeConfirmacaoHumana` viajam junto.
   Campo que a IA não leu volta VAZIO e marcado, jamais chutado, porque chute aqui vira dado errado
   no eSocial. As duas metades saem da MESMA chamada ao modelo: o arquivo é lido uma vez só.

INERTE POR PADRÃO. O bucket de entrada ainda não existe. Sem `PORTAL_BUCKET` configurado, a rota
responde 503 e mais nada do serviço muda; é isso que permite o mesmo código subir numa SEGUNDA
INSTÂNCIA de ambiente magro, sem credencial de banco e sem Drive, sem quebrar no boot.

QUEM CHAMA É O BACKEND, com X-Internal-Token, igual a todo o resto do serviço. O navegador do
candidato nunca fala com esta porta: ele fala com o bucket, e o backend fala conosco.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from starlette.status import (
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_413_CONTENT_TOO_LARGE,
    HTTP_503_SERVICE_UNAVAILABLE,
)

from app import gemini, portal_bucket, portal_extracao
from app.auth import require_internal_token
from app.config import get_settings
from app.portal_fluxo import OrcamentoEstourado
from app.portal_processo import (
    FalhaNaInspecao,
    TempoEsgotado,
    inspecionar_com_morte_dura,
)
from app.routers.auditoria import DETALHE_POR_FAMILIA, HTTP_POR_FAMILIA
from app.schemas import (
    PortalChegada,
    PortalLerRequest,
    PortalLerResponse,
    PortalSugestaoCampo,
    PortalSugestoes,
    ResultadoAuditoria,
)
from app.vertex_erros import ErroVertex

router = APIRouter(prefix="/portal", tags=["portal"])
logger = logging.getLogger("ea.ai.portal")

# Recusa por tempo: o arquivo levou mais do que o teto e o processo filho foi MORTO. Para o candidato
# isso é "não deu para ler", e não um erro do sistema, então sai como recusa e não como 500.
_MOTIVO_TEMPO = (
    "Não foi possível processar o arquivo no tempo previsto. Enviar um arquivo menor ou uma foto do "
    "documento."
)


@router.post("/ler", response_model=PortalLerResponse, response_model_by_alias=True)
def portal_ler(
    req: PortalLerRequest, _: None = Depends(require_internal_token)
) -> PortalLerResponse:
    settings = get_settings()

    if not settings.portal_bucket:
        raise HTTPException(
            status_code=HTTP_503_SERVICE_UNAVAILABLE,
            detail="Leitor do Portal não configurado (bucket de entrada ausente).",
        )
    # ALLOWLIST DE UM BUCKET SÓ. Sem isto, quem tivesse o token interno transformaria o leitor num
    # baixador de qualquer bucket que a nossa service account alcança, inclusive o do VT.
    if req.bucket != settings.portal_bucket:
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
            detail="Bucket não permitido para o leitor do Portal.",
        )

    # 1. METADADO ANTES DO PRIMEIRO BYTE: confirma a chegada e corta o arquivo grande sem baixá-lo.
    try:
        meta = portal_bucket.obter_metadado(req.bucket, req.objeto)
    except portal_bucket.ObjetoAusente:
        raise HTTPException(
            status_code=HTTP_404_NOT_FOUND,
            detail="O arquivo não chegou ao armazenamento. Enviar de novo.",
        ) from None

    if meta.tamanho > settings.portal_bytes_max:
        raise HTTPException(
            status_code=HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Arquivo acima do limite de {settings.portal_bytes_max // (1024 * 1024)} MB.",
        )

    # 2. DOWNLOAD EM MEMÓRIA, sob orçamento de bytes. O metadado é declaração; isto é medida.
    try:
        conteudo = portal_bucket.baixar_em_memoria(
            req.bucket, req.objeto, maximo_bytes=settings.portal_bytes_max
        )
    except OrcamentoEstourado:
        raise HTTPException(
            status_code=HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Arquivo acima do limite de {settings.portal_bytes_max // (1024 * 1024)} MB.",
        ) from None
    except portal_bucket.ObjetoAusente:
        raise HTTPException(
            status_code=HTTP_404_NOT_FOUND,
            detail="O arquivo não chegou ao armazenamento. Enviar de novo.",
        ) from None

    try:
        # 3. INSPEÇÃO NO PROCESSO FILHO, com morte dura no estouro do tempo.
        try:
            veredicto = inspecionar_com_morte_dura(
                conteudo,
                paginas_max=settings.portal_paginas_max,
                lado_max=settings.portal_imagem_lado_max,
                megapixels_max=settings.portal_imagem_megapixels_max,
                tempo_max_s=settings.portal_tempo_max_s,
            )
        except TempoEsgotado:
            logger.warning("Leitor do Portal: inspeção excedeu o tempo e o processo foi encerrado.")
            return _resposta_recusada("TEMPO", _MOTIVO_TEMPO, meta)
        except FalhaNaInspecao as falha:
            # Falha NOSSA, não do arquivo: 503, para o backend poder retentar sem culpar o candidato.
            logger.error("Leitor do Portal: inspeção falhou (%s).", falha.tipo)
            raise HTTPException(
                status_code=HTTP_503_SERVICE_UNAVAILABLE,
                detail="Leitor de documentos indisponível.",
            ) from falha

        chegada = _chegada(meta, veredicto)
        if not veredicto["ok"]:
            logger.info("Leitor do Portal: arquivo recusado (%s).", veredicto["recusa"])
            return PortalLerResponse(
                aceito=False,
                recusa=veredicto["recusa"],
                motivo=veredicto["motivo"],
                chegada=chegada,
            )

        # 4. A LEITURA PELO MODELO. Sem regra ativa não há critério: é escalada, não reprovação
        # (§A.9), exatamente como na auditoria da esteira.
        regras = [r.descricao_regra for r in req.regras if r.descricao_regra.strip()]
        if not regras:
            return PortalLerResponse(
                aceito=True,
                motivo="",
                chegada=chegada,
                auditoria=ResultadoAuditoria(
                    valido=False,
                    status="PENDENTE",
                    motivo=(
                        "Não há regras de auditoria ativas para este tipo de documento; "
                        "validação manual necessária."
                    ),
                    campos_conferidos=[],
                ),
            )

        # O AUTO-PREENCHIMENTO viaja na MESMA chamada da auditoria, não numa segunda: o documento já
        # está em memória e já vai ao modelo aqui. Tipo sem catálogo de campos não extrai nada, e a
        # auditoria segue igual (`portal_extracao` explica por que extrair "algum campo" é pior).
        alvos = portal_extracao.campos_para(req.tipo_documento_codigo)
        try:
            resultado = gemini.auditar_documento(
                partes=[(conteudo, veredicto["mime"])],
                tipo_documento_nome=req.tipo_documento_nome,
                candidato_nome=req.candidato.nome,
                candidato_cpf=req.candidato.cpf,
                regras=regras,
                campos_a_extrair=[
                    {"campo": a.campo, "rotulo": a.rotulo, "formato": a.formato} for a in alvos
                ]
                or None,
            )
        except ErroVertex as erro:
            # Mesma taxonomia da auditoria da esteira: quota (429) não é documento errado. §A.6: a
            # mensagem é fixa e nunca ecoa o corpo devolvido pelo provedor.
            raise HTTPException(
                status_code=HTTP_POR_FAMILIA[erro.familia],
                detail=DETALHE_POR_FAMILIA[erro.familia],
            ) from erro

        status = resultado["status"]
        sugestoes = None
        if alvos:
            campos = portal_extracao.normalizar(alvos, resultado.get("camposExtraidos"))
            # §A.6: o log conta QUANTOS campos vieram lidos, nunca QUAIS valores. Contagem é métrica,
            # valor é PII, e a diferença entre as duas é a frente inteira.
            logger.info(
                "Leitor do Portal: auto-preenchimento (%d de %d campos lidos).",
                sum(1 for c in campos if c["lido"]),
                len(campos),
            )
            sugestoes = PortalSugestoes(campos=[PortalSugestaoCampo(**c) for c in campos])
        return PortalLerResponse(
            aceito=True,
            motivo="",
            chegada=chegada,
            auditoria=ResultadoAuditoria(
                valido=status == "VALIDADO",
                status=status,
                motivo=resultado["motivo"],
                campos_conferidos=resultado["camposConferidos"],
                divergencias_cadastro=resultado.get("divergenciasCadastro", []),
            ),
            sugestoes=sugestoes,
        )
    finally:
        # §A.6: o binário sai da memória ao fim da requisição, em qualquer caminho, inclusive no erro.
        del conteudo


def _chegada(meta, veredicto: dict | None = None) -> PortalChegada:
    """Metadados da chegada. §A.6: números e rótulos, nunca o nome do objeto nem valor extraído."""
    veredicto = veredicto or {}
    return PortalChegada(
        tamanho_bytes=meta.tamanho,
        mime_detectado=veredicto.get("mime"),
        tipo_declarado=meta.tipo_declarado,
        md5=meta.md5_hex,
        criado_em=meta.criado_em,
        geracao=meta.geracao,
        paginas=veredicto.get("paginas"),
        largura=veredicto.get("largura"),
        altura=veredicto.get("altura"),
        conteudo_ativo=veredicto.get("conteudo_ativo", []),
    )


def _resposta_recusada(recusa: str, motivo: str, meta) -> PortalLerResponse:
    return PortalLerResponse(aceito=False, recusa=recusa, motivo=motivo, chegada=_chegada(meta))
