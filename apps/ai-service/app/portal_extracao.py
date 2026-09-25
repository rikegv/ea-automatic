"""O AUTO-PREENCHIMENTO do Portal: QUAIS campos se extrai de cada documento, e o que se aceita.

POR QUE ESTE MÓDULO EXISTE SEPARADO DA ROTA E DO MOTOR: a metade do Portal que o diretor pediu é
"a IA lê na hora, extrai os dados e AUTO-PREENCHE para o candidato validar ali". O veredicto de
auditoria (VALIDADO/INCONFORME) responde "este documento serve?"; ele nunca respondeu "e o que
está escrito nele?". São perguntas diferentes, e a segunda tem regra própria, que é esta:

 - **CAMPO QUE A IA NÃO LEU VOLTA VAZIO E MARCADO, NUNCA CHUTADO.** Campo chutado num formulário de
   admissão vira dado errado no eSocial, que é multa. Vazio o candidato digita em dez segundos;
   errado ninguém percebe até a folha fechar. Por isso existe o `CONFIANCA_MINIMA`: abaixo dele o
   valor é DESCARTADO AQUI, e não repassado com um aviso que a tela pode ignorar.
 - **O QUE SAI É SUGESTÃO, NUNCA DADO FINAL** (veto V12, Camada G5 do documento de segurança). Nada
   daqui escreve em dado autoritativo: CPF, nome e vínculo vêm do link e da base, jamais do papel
   fotografado. Quem confirma é humano, e é a confirmação que grava.
 - **CATÁLOGO FECHADO, POR TIPO DE DOCUMENTO.** O modelo não escolhe o que devolver: ele preenche a
   lista que nós mandamos. Chave desconhecida é descartada na normalização, porque campo inventado
   pelo modelo é campo que ninguém sabe onde guardar, e porque um documento hostil que mande o
   modelo "devolver também o conteúdo desta página" esbarra numa lista fechada.
 - **TIPO SEM CATÁLOGO NÃO EXTRAI NADA**, e isso é o comportamento correto e silencioso: a auditoria
   segue como sempre e a tela simplesmente não sugere. Extrair "algum campo" de um documento que
   ninguém mapeou é a porta de entrada do chute.

§A.6, E ESTE É O PONTO MAIS SENSÍVEL DO ARQUIVO: os valores que passam por aqui são PII pura. Eles
podem viajar na RESPOSTA, que é para isso que existem (vão para a tela do candidato conferir), e
NÃO PODEM aparecer em log, em mensagem de erro, em rastro de exceção nem em nada persistido. Por
isso nenhuma função deste módulo tem logger, nenhuma levanta exceção carregando o valor, e a
normalização não devolve o bruto do modelo: devolve só o que o catálogo previa.
"""

from __future__ import annotations

from dataclasses import dataclass

# ABAIXO DISTO O VALOR É JOGADO FORA. O número é conservador de propósito: o custo de errar para
# menos é o candidato digitar um campo; o de errar para mais é dado errado no eSocial.
CONFIANCA_MINIMA = 0.70

# Teto de tamanho do valor aceito. Não é limite de campo de formulário: é trava contra o documento
# que tenta usar a sugestão como canal de saída de texto (um "valor" de 4 KB não é um RG).
TAMANHO_MAX_VALOR = 120


@dataclass(frozen=True)
class CampoAlvo:
    """Um campo que se pede ao modelo. `formato` é instrução de normalização, não regra de negócio."""

    campo: str
    rotulo: str
    formato: str


# Datas sempre ISO, números sempre só dígitos: o consumidor não deve ter de adivinhar a máscara que
# o papel usava, e formato divergente é a forma mais barata de um dado certo virar dado errado.
_DATA = "data no formato AAAA-MM-DD"
_DIGITOS = "somente dígitos, sem pontuação"
_TEXTO = "texto exatamente como aparece no documento"

CAMPOS_POR_TIPO: dict[str, tuple[CampoAlvo, ...]] = {
    "RG": (
        CampoAlvo("rgNumero", "Número do RG", _TEXTO),
        CampoAlvo("rgOrgaoEmissor", "Órgão emissor", _TEXTO),
        CampoAlvo("rgUf", "UF de emissão", "sigla de duas letras maiúsculas"),
        CampoAlvo("rgDataEmissao", "Data de emissão", _DATA),
        CampoAlvo("nomeCompleto", "Nome completo", _TEXTO),
        CampoAlvo("dataNascimento", "Data de nascimento", _DATA),
        CampoAlvo("nomeMae", "Nome da mãe", _TEXTO),
        CampoAlvo("nomePai", "Nome do pai", _TEXTO),
    ),
    "CPF": (
        CampoAlvo("cpf", "CPF", _DIGITOS),
        CampoAlvo("nomeCompleto", "Nome completo", _TEXTO),
        CampoAlvo("dataNascimento", "Data de nascimento", _DATA),
    ),
    "CTPS": (
        CampoAlvo("ctpsNumero", "Número da CTPS", _DIGITOS),
        CampoAlvo("ctpsSerie", "Série", _TEXTO),
        CampoAlvo("ctpsUf", "UF", "sigla de duas letras maiúsculas"),
        CampoAlvo("ctpsDataExpedicao", "Data de expedição", _DATA),
        CampoAlvo("pis", "PIS/PASEP", _DIGITOS),
        CampoAlvo("nomeCompleto", "Nome completo", _TEXTO),
        CampoAlvo("dataNascimento", "Data de nascimento", _DATA),
    ),
    "CNH": (
        CampoAlvo("cnhRegistro", "Número de registro", _DIGITOS),
        CampoAlvo("cnhCategoria", "Categoria", _TEXTO),
        CampoAlvo("cnhValidade", "Validade", _DATA),
        CampoAlvo("cnhDataEmissao", "Data de emissão", _DATA),
        CampoAlvo("cnhPrimeiraHabilitacao", "Primeira habilitação", _DATA),
        CampoAlvo("nomeCompleto", "Nome completo", _TEXTO),
        CampoAlvo("dataNascimento", "Data de nascimento", _DATA),
    ),
    "PIS_PASEP": (CampoAlvo("pis", "PIS/PASEP", _DIGITOS),),
    "TITULO_ELEITOR": (
        CampoAlvo("tituloNumero", "Número do título", _DIGITOS),
        CampoAlvo("tituloZona", "Zona", _DIGITOS),
        CampoAlvo("tituloSecao", "Seção", _DIGITOS),
    ),
    "RESERVISTA": (
        CampoAlvo("reservistaNumero", "Número", _TEXTO),
        CampoAlvo("reservistaCategoria", "Categoria", _TEXTO),
    ),
    "COMPROVANTE_RESIDENCIA": (
        CampoAlvo("cep", "CEP", _DIGITOS),
        CampoAlvo("logradouro", "Logradouro", _TEXTO),
        CampoAlvo("numeroEndereco", "Número", _TEXTO),
        CampoAlvo("complemento", "Complemento", _TEXTO),
        CampoAlvo("bairro", "Bairro", _TEXTO),
        CampoAlvo("cidade", "Cidade", _TEXTO),
        CampoAlvo("uf", "UF", "sigla de duas letras maiúsculas"),
        CampoAlvo("dataEmissaoComprovante", "Data do comprovante", _DATA),
    ),
    "DADOS_BANCARIOS": (
        CampoAlvo("banco", "Banco", _TEXTO),
        CampoAlvo("agencia", "Agência", _TEXTO),
        CampoAlvo("conta", "Conta", _TEXTO),
        CampoAlvo("tipoConta", "Tipo de conta", _TEXTO),
    ),
    "CERTIDAO_NASC_CASAMENTO": (
        CampoAlvo("estadoCivil", "Estado civil", _TEXTO),
        CampoAlvo("nomeCompleto", "Nome completo", _TEXTO),
        CampoAlvo("dataNascimento", "Data de nascimento", _DATA),
        CampoAlvo("nomeMae", "Nome da mãe", _TEXTO),
        CampoAlvo("nomePai", "Nome do pai", _TEXTO),
    ),
    "CARTAO_SUS": (CampoAlvo("cartaoSus", "Cartão SUS", _DIGITOS),),
    "COMPROVANTE_ESCOLARIDADE": (
        CampoAlvo("escolaridade", "Escolaridade", _TEXTO),
        CampoAlvo("instituicao", "Instituição", _TEXTO),
        CampoAlvo("anoConclusao", "Ano de conclusão", "ano com quatro dígitos"),
    ),
}


def campos_para(tipo_documento_codigo: str) -> list[CampoAlvo]:
    """O catálogo do tipo, ou lista vazia quando ninguém mapeou este tipo (e aí não se extrai nada)."""
    return list(CAMPOS_POR_TIPO.get((tipo_documento_codigo or "").strip().upper(), ()))


def _confianca(bruto: object) -> float:
    """Confiança em [0, 1]. Qualquer coisa que não seja número vira 0, ou seja, não leu."""
    try:
        valor = float(bruto)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if valor != valor:  # NaN
        return 0.0
    return max(0.0, min(1.0, valor))


def normalizar(alvos: list[CampoAlvo], bruto: object) -> list[dict]:
    """Casa o que o modelo devolveu com o catálogo e devolve UMA entrada POR CAMPO PEDIDO.

    Sempre todos os campos, inclusive os que não foram lidos: a tela precisa saber que perguntou e
    não obteve, para pedir ao candidato. Campo não lido sai com `valor` VAZIO e `lido=False`.

    O que derruba um valor para não lido, e cada um já aconteceu com modelo de linguagem:
     - confiança abaixo do piso (o modelo "achou", e achar não preenche formulário de admissão);
     - valor vazio, ou os textos de desistência que o modelo escreve no lugar de deixar em branco;
     - valor absurdamente longo, que não é dado de documento e sim texto vazando pelo campo.

    §A.6: nada aqui é logado, e a função nunca levanta exceção com o valor dentro, porque exceção
    com PII vira rastro em log sem ninguém ter escrito uma linha de log.
    """
    por_chave: dict[str, object] = {}
    if isinstance(bruto, list):
        for item in bruto:
            if isinstance(item, dict) and isinstance(item.get("campo"), str):
                por_chave[item["campo"]] = item

    saida: list[dict] = []
    for alvo in alvos:
        item = por_chave.get(alvo.campo)
        valor = ""
        confianca = 0.0
        if isinstance(item, dict):
            confianca = _confianca(item.get("confianca"))
            cru = item.get("valor")
            if isinstance(cru, (str, int, float)):
                valor = str(cru).strip()
        if (
            not valor
            or len(valor) > TAMANHO_MAX_VALOR
            or valor.lower() in _DESISTENCIAS
            or confianca < CONFIANCA_MINIMA
        ):
            valor, confianca = "", 0.0
        saida.append(
            {
                "campo": alvo.campo,
                "rotulo": alvo.rotulo,
                "valor": valor,
                "confianca": round(confianca, 2),
                "lido": bool(valor),
            }
        )
    return saida


# O modelo, mandado a não chutar, às vezes escreve a desistência em vez de deixar vazio. Estes são
# valores nulos disfarçados de texto, e passariam direto para o formulário do candidato.
_DESISTENCIAS = {
    "n/a",
    "na",
    "nao informado",
    "não informado",
    "nao consta",
    "não consta",
    "nao identificado",
    "não identificado",
    "ilegivel",
    "ilegível",
    "desconhecido",
    "null",
    "none",
    "-",
    "--",
    "?",
}
