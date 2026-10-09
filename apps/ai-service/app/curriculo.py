"""Catálogo e normalização da EXTRAÇÃO DE CURRÍCULO (import de candidato por currículo, §A.1/F6).

POR QUE EXISTE SEPARADO DA ROTA E DO MOTOR: o mapeador de planilha (`/planilha/mapear-colunas-*`)
devolve ÍNDICE DE COLUNA; um currículo não tem coluna. Aqui a IA extrai VALOR (campo -> valor lido),
no mesmo molde do auto-preenchimento do Portal (`portal_extracao`), com a MESMA disciplina do
`_EXTRACAO_SYSTEM`: campo que a IA não leu volta VAZIO, NUNCA chutado. Dado chutado num cadastro de
admissão vira dado errado no eSocial.

O QUE ESTE MÓDULO FAZ: define o catálogo de campos que a extração de currículo mira (o conjunto real
do candidato A&S) e NORMALIZA o bruto do modelo na forma do contrato HTTP (candidato + confianca),
sem jamais devolver o bruto cru do modelo nem confiar em chave que o catálogo não previu.

§A.6, PONTO MAIS SENSÍVEL: os valores que passam por aqui são PII pura (nome, CPF, e-mail, telefone).
Eles viajam só na RESPOSTA (vão para a tela de revisão do consultor) e NÃO PODEM aparecer em log, em
mensagem de erro nem em rastro de exceção. Por isso nenhuma função daqui tem logger e nenhuma levanta
exceção carregando o valor; a normalização devolve só o que o catálogo previa.
"""

from __future__ import annotations

from datetime import date

from app.portal_extracao import (
    TAMANHO_MAX_VALOR,
    CampoAlvo,
    _DESISTENCIAS,  # noqa: PLC2701 — mesma lista de "nulos disfarçados de texto" do Portal
)

# Nível de confiança por campo, espelhando o enum do mapeador de colunas (ALTA/MEDIA/BAIXA).
_CONFIANCAS_VALIDAS = {"ALTA", "MEDIA", "BAIXA"}

# Instruções de normalização reusadas do Portal, para o modelo devolver no formato de destino.
_DATA = "data no formato AAAA-MM-DD"
_TEXTO = "texto exatamente como aparece no currículo"
_EMAIL = "endereço de e-mail como aparece no currículo"
_CIDADE = "somente o nome da cidade de residência, sem a UF e sem sigla de estado"

# CATÁLOGO DO CURRÍCULO. É o conjunto real do candidato A&S (origem IMPORTACAO): nome, cpf, email,
# dataNascimento, cidade, uf (escalares) + telefones (ARRAY, a forma que o currículo pede e que o
# esquema de candidato tabular não tinha). Extensível no mesmo estilo de `CAMPOS_POR_TIPO`.
CAMPOS_ESCALARES: tuple[CampoAlvo, ...] = (
    CampoAlvo("nome", "Nome completo", _TEXTO),
    CampoAlvo("cpf", "CPF", "somente dígitos, sem pontuação"),
    CampoAlvo("email", "E-mail", _EMAIL),
    CampoAlvo("nascimento", "Data de nascimento", _DATA),
    CampoAlvo("cidade", "Cidade de residência", _CIDADE),
    CampoAlvo("uf", "UF de residência", "sigla de duas letras maiúsculas"),
)

# Chaves do contrato (escalares + telefones). O modelo preenche EXATAMENTE estas, nada mais.
CAMPO_TELEFONES = "telefones"
CHAVES = tuple(c.campo for c in CAMPOS_ESCALARES) + (CAMPO_TELEFONES,)


def candidato_vazio() -> dict:
    """Candidato com todos os campos em branco (campo ausente => vazio, telefones => [])."""
    base: dict = {c.campo: "" for c in CAMPOS_ESCALARES}
    base[CAMPO_TELEFONES] = []
    return base


def _texto_limpo(bruto: object) -> str:
    """Valor escalar saneado: string, aparada, descartada se vazia/desistência/absurdamente longa."""
    if not isinstance(bruto, (str, int, float)):
        return ""
    valor = str(bruto).strip()
    if not valor or len(valor) > TAMANHO_MAX_VALOR or valor.lower() in _DESISTENCIAS:
        return ""
    return valor


def _nascimento_iso(bruto: object) -> str:
    """Data de nascimento em ISO AAAA-MM-DD, ou vazio se não ler/parsear (NUNCA inventa)."""
    valor = _texto_limpo(bruto)
    if not valor:
        return ""
    try:
        return date.fromisoformat(valor).isoformat()
    except ValueError:
        return ""


def _uf(bruto: object) -> str:
    """UF de duas letras maiúsculas, ou vazio. Sigla inválida vira vazio, não chute."""
    valor = _texto_limpo(bruto).upper()
    return valor if len(valor) == 2 and valor.isalpha() else ""


def _telefones(bruto: object) -> list[str]:
    """TODOS os telefones encontrados, na ordem, normalizados LEVEMENTE (dígitos+separadores como
    escritos). Entradas vazias/desistência são descartadas; nenhum número válido é descartado."""
    if not isinstance(bruto, list):
        return []
    saida: list[str] = []
    for item in bruto:
        valor = _texto_limpo(item)
        if valor:
            saida.append(valor)
    return saida


def _confianca(bruto: object) -> dict[str, str]:
    """Mapa campo->ALTA|MEDIA|BAIXA, só com chaves do catálogo e níveis válidos. Resto é descartado."""
    if not isinstance(bruto, dict):
        return {}
    saida: dict[str, str] = {}
    for chave, nivel in bruto.items():
        if chave in CHAVES and isinstance(nivel, str) and nivel.strip().upper() in _CONFIANCAS_VALIDAS:
            saida[chave] = nivel.strip().upper()
    return saida


def mapear_resposta(bruto: object) -> dict:
    """Casa o bruto do modelo com o catálogo e devolve {candidato, confianca} no formato do contrato.

    Tudo o que o catálogo não previu é descartado. Campo não lido sai vazio; telefones vazio sai [].
    §A.6: não loga, não levanta com PII dentro; devolve só o que o catálogo previa.
    """
    dado = bruto if isinstance(bruto, dict) else {}
    candidato = {
        "nome": _texto_limpo(dado.get("nome")),
        "cpf": _texto_limpo(dado.get("cpf")),
        "email": _texto_limpo(dado.get("email")),
        "telefones": _telefones(dado.get("telefones")),
        "nascimento": _nascimento_iso(dado.get("nascimento")),
        "cidade": _texto_limpo(dado.get("cidade")),
        "uf": _uf(dado.get("uf")),
    }
    return {"candidato": candidato, "confianca": _confianca(dado.get("confianca"))}
