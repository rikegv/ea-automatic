"""TESTE DE FONTE: o caminho do Drive só LÊ, e a planilha viva não vai para a IA nem para o disco.

POR QUE ISTO E UM TESTE, e não um comentário. A proibição de operação mutante no Drive existia só em
PROSA, no alto de `app/drive.py`. A §A.33 desta casa é explícita: guarda com teste, não com
lembrança. A credencial em uso tem escopo `auth/drive`, que é escopo de ESCRITA (não há escopo de
leitura autorizado nesta delegação), então a única mitigação possível é de código: nenhum método
mutante existe nestes módulos.

A ARMADILHA, e ela já custou rodada nesta casa: o próprio comentário de `app/drive.py` CONTEM as
palavras proibidas, porque ele as enumera para proibi-las. Varredura ingênua nasce vermelha de
mentira, alguém "conserta" afrouxando a asserção, e a guarda vira enfeite. Então a asserção roda
sobre a fonte COM COMENTARIOS E DOCSTRINGS REMOVIDOS, e há canário provando que o removedor
funciona e que a asserção ainda morde.
"""

import ast
import io
import pathlib
import re
import tokenize

import pytest

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ALVOS = [
    RAIZ / "app" / "drive.py",
    RAIZ / "app" / "planilha_viva.py",
    RAIZ / "app" / "routers" / "planilha_viva.py",
]


def fonte_sem_prosa(codigo: str) -> str:
    """Remove comentários e docstrings, preservando o resto (inclusive strings comuns).

    String comum é preservada de propósito: `getattr(svc, "delete")` tem de continuar sendo pego.
    """
    arvore = ast.parse(codigo)
    linhas_de_docstring: set[int] = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            primeiro = no.body[0] if no.body else None
            if (
                isinstance(primeiro, ast.Expr)
                and isinstance(primeiro.value, ast.Constant)
                and isinstance(primeiro.value.value, str)
            ):
                linhas_de_docstring.update(range(primeiro.lineno, (primeiro.end_lineno or 0) + 1))

    linhas = codigo.splitlines()
    for tok in tokenize.generate_tokens(io.StringIO(codigo).readline):
        if tok.type == tokenize.COMMENT:
            linha, coluna = tok.start
            atual = linhas[linha - 1]
            linhas[linha - 1] = atual[:coluna] + " " * (len(atual) - coluna)
    return "\n".join(
        "" if i + 1 in linhas_de_docstring else texto for i, texto in enumerate(linhas)
    )


def limpo(caminho: pathlib.Path) -> str:
    return fonte_sem_prosa(caminho.read_text(encoding="utf-8"))


# Operações MUTANTES do Drive. `delete`, `update`, `permissions`, `rename` e `move` entram como
# palavra; `trash` entra pelas formas que MUDAM o item, porque `trashed = false` na query e
# `fields=...,trashed` são LEITURA legítima (é assim que se filtra o que está na lixeira) e aparecem
# oito vezes no `drive.py`. Trashar é `trash(`, `untrash`, `emptyTrash` ou escrever `trashed`.
PROIBIDOS: dict[str, str] = {
    "delete": r"\bdelete\b",
    "update": r"\bupdate\b",
    "permissions": r"\bpermissions\b",
    "rename": r"\brename\b",
    "move": r"(?<!re)\bmove\b|addParents|removeParents",
    "trash (mutante)": r"\btrash\s*\(|untrash|emptyTrash|trashed\s*=\s*True|['\"]trashed['\"]\s*:",
}


@pytest.mark.parametrize("alvo", ALVOS, ids=lambda p: p.name)
@pytest.mark.parametrize("rotulo", list(PROIBIDOS))
def test_nenhuma_operacao_mutante_no_drive(alvo: pathlib.Path, rotulo: str):
    achado = re.search(PROIBIDOS[rotulo], limpo(alvo), re.IGNORECASE)
    assert achado is None, (
        f"{alvo.name}: operação mutante de Drive proibida ({rotulo}) em "
        f"{limpo(alvo)[: achado.start()].count(chr(10)) + 1 if achado else 0}. "
        "§A.6: este caminho só lê."
    )


@pytest.mark.parametrize("rotulo", list(PROIBIDOS))
def test_canario_a_assercao_morde(rotulo: str):
    """Canário: se o removedor de prosa apagasse código, ou o padrão não casasse mais, estes
    passariam em silêncio e a guarda viraria enfeite."""
    amostras = {
        "delete": "svc.files().delete(fileId=x)",
        "update": "svc.files().update(fileId=x, body=b)",
        "permissions": "svc.permissions().create(fileId=x)",
        "rename": "rename(x, y)",
        "move": "svc.files().update(fileId=x, addParents=p)",
        "trash (mutante)": 'svc.files().update(fileId=x, body={"trashed": True})',
    }
    codigo = f"def f(svc, x, y, b, p):\n    {amostras[rotulo]}\n"
    assert re.search(PROIBIDOS[rotulo], fonte_sem_prosa(codigo), re.IGNORECASE)


def test_canario_o_removedor_tira_a_prosa_do_drive():
    bruto = (RAIZ / "app" / "drive.py").read_text(encoding="utf-8")
    # A prosa do `drive.py` enumera as operações proibidas; o código não as usa.
    assert "files().delete" in bruto
    assert "delete" not in limpo(RAIZ / "app" / "drive.py").lower()


def test_canario_o_removedor_nao_apaga_string_comum():
    codigo = 'def f(svc):\n    return getattr(svc, "delete")\n'
    assert "delete" in fonte_sem_prosa(codigo)


# ── A planilha viva não chama IA, e não toca disco ────────────────────────────────────────────

MODULOS_DA_FRENTE = [
    RAIZ / "app" / "planilha_viva.py",
    RAIZ / "app" / "routers" / "planilha_viva.py",
]


@pytest.mark.parametrize("alvo", MODULOS_DA_FRENTE, ids=lambda p: p.name)
def test_nenhuma_linha_da_planilha_vai_para_o_vertex(alvo: pathlib.Path):
    fonte = limpo(alvo)
    for proibido in ["gemini", "vertex", "generative", "genai", "GenerativeModel"]:
        assert proibido.lower() not in fonte.lower(), f"{alvo.name}: {proibido}"


@pytest.mark.parametrize("alvo", MODULOS_DA_FRENTE, ids=lambda p: p.name)
def test_o_csv_nao_pode_ir_para_o_disco(alvo: pathlib.Path):
    fonte = limpo(alvo)
    for proibido in [
        r"\bopen\s*\(",
        r"escrever_staging",
        r"write_text",
        r"write_bytes",
        r"\btempfile\b",
        r"NamedTemporaryFile",
        r"shelve",
        r"lru_cache",
    ]:
        assert re.search(proibido, fonte) is None, f"{alvo.name}: {proibido}"


@pytest.mark.parametrize("alvo", MODULOS_DA_FRENTE, ids=lambda p: p.name)
def test_a_rota_e_o_modulo_nao_logam_conteudo(alvo: pathlib.Path):
    """Log só de contagem e de família. Nenhuma chamada de log recebe o CSV, a linha ou a célula."""
    fonte = limpo(alvo)
    for chamada in re.findall(r"logger\.\w+\([^)]*\)", fonte, re.DOTALL):
        for proibido in [
            "bruto",
            "texto",
            "csv_texto",
            "linha,",
            "partes",
            "pedaco",
            "resposta.text",
        ]:
            assert proibido not in chamada, f"{alvo.name}: log com {proibido}"


def test_a_rota_exige_o_token_interno_na_fonte():
    fonte = limpo(RAIZ / "app" / "routers" / "planilha_viva.py")
    assert fonte.count("Depends(require_internal_token)") == fonte.count("@router.")
