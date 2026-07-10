"""Motor de extração do Gerador de Kit (OST, etapa 2).

Recebe as páginas já classificadas (título detectado no topo, nome, CPF) de cada PDF e o dicionário
de títulos ATIVOS do kit selecionado, e monta um kit consolidado por funcionário na ordem do painel.

Lógica PURA (sem Gemini, sem banco, sem I/O): recebe dados já extraídos e devolve o resultado. Isso
torna o miolo determinístico e testável com PDFs sintéticos. A classificação por página (Gemini) e a
leitura do dicionário (banco) vivem fora deste módulo.

§A.6: este módulo NUNCA loga. Nome e CPF só transitam em memória; o CPF sai sempre mascarado.
§A.11: sem travessão.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field


# ── Normalização (fuzzy: tolerante a acento e caixa, rígido no resto) ─────────
def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def normalizar(texto: str | None) -> str:
    """Chave estável: sem acento, caixa alta, espaços colapsados. Usada para título e nome."""
    if not texto:
        return ""
    return re.sub(r"\s+", " ", _sem_acento(texto).strip()).upper()


def so_digitos(cpf: str | None) -> str:
    return re.sub(r"\D", "", cpf or "")


def mascarar_cpf(cpf: str | None) -> str | None:
    """Mascara o CPF (§A.6): mostra só os 6 dígitos do meio, ex.: ***.456.789-**. Nulo se inválido."""
    d = so_digitos(cpf)
    if len(d) != 11:
        return None
    return f"***.{d[3:6]}.{d[6:9]}-**"


# ── Estruturas ───────────────────────────────────────────────────────────────
@dataclass
class PaginaClassificada:
    """Uma página já lida: título detectado no topo (ou None = continuação), nome e CPF (ou None)."""

    pagina: int  # 1-based dentro do PDF de origem
    titulo: str | None
    nome: str | None
    cpf: str | None


@dataclass
class _Bloco:
    """Um documento contíguo (uma ou mais páginas) de um funcionário, dentro de um PDF."""

    titulo_canonico: str
    ordem: int
    nome: str
    cpf: str | None
    paginas: list[int]
    origem: str


@dataclass
class DocumentoKit:
    titulo: str
    ordem: int
    paginas: list[int]
    origem: str


@dataclass
class Funcionario:
    nome: str
    cpf_mascarado: str | None
    documentos: list[DocumentoKit]
    revisao: str | None = None


@dataclass
class NaoReconhecido:
    staging_path: str
    paginas: list[int]
    motivo: str


@dataclass
class ResultadoMotor:
    funcionarios: list[Funcionario] = field(default_factory=list)
    nao_reconhecidos: list[NaoReconhecido] = field(default_factory=list)
    pdfs: int = 0


MOTIVO_TITULO_FORA = "Título fora do dicionário do kit."
MOTIVO_SEM_ANCORA = "Página sem título no topo e sem documento anterior."
MOTIVO_SEM_NOME = "Documento reconhecido, mas sem nome de funcionário identificado."
REVISAO_NOME_SEM_CPF = "Nome coincide sem CPF para confirmar a identidade. Revisar."


def _indice_dicionario(dicionario: list[str]) -> dict[str, tuple[str, int]]:
    """Mapa {titulo_normalizado: (titulo_canonico, ordem)} a partir da lista ordenada do painel."""
    return {normalizar(t): (t, i + 1) for i, t in enumerate(dicionario)}


def _casar_titulo(bruto: str, indice: dict[str, tuple[str, int]]) -> tuple[str, int] | None:
    """Casa um título detectado contra o dicionário (exato após normalizar acento/caixa)."""
    return indice.get(normalizar(bruto))


# ── Segmentação: agrupa páginas contíguas por documento ──────────────────────
def _segmentar(
    paginas_por_pdf: list[tuple[str, list[PaginaClassificada]]],
    indice: dict[str, tuple[str, int]],
) -> tuple[list[_Bloco], list[NaoReconhecido]]:
    blocos: list[_Bloco] = []
    nao_rec: list[NaoReconhecido] = []

    for origem, paginas in paginas_por_pdf:
        atual_bloco: _Bloco | None = None
        atual_nao_rec: NaoReconhecido | None = None
        for pg in paginas:
            if pg.titulo:  # começa um novo documento
                match = _casar_titulo(pg.titulo, indice)
                if match:
                    titulo_canonico, ordem = match
                    atual_bloco = _Bloco(
                        titulo_canonico=titulo_canonico,
                        ordem=ordem,
                        nome=(pg.nome or "").strip(),
                        cpf=pg.cpf,
                        paginas=[pg.pagina],
                        origem=origem,
                    )
                    blocos.append(atual_bloco)
                    atual_nao_rec = None
                else:
                    atual_nao_rec = NaoReconhecido(
                        staging_path=origem,
                        paginas=[pg.pagina],
                        motivo=f"{MOTIVO_TITULO_FORA} (detectado: {pg.titulo.strip()})",
                    )
                    nao_rec.append(atual_nao_rec)
                    atual_bloco = None
            else:  # continuação: herda o documento anterior
                if atual_bloco is not None:
                    atual_bloco.paginas.append(pg.pagina)
                elif atual_nao_rec is not None:
                    atual_nao_rec.paginas.append(pg.pagina)
                else:
                    nao_rec.append(
                        NaoReconhecido(staging_path=origem, paginas=[pg.pagina], motivo=MOTIVO_SEM_ANCORA)
                    )

    # Documento reconhecido mas sem nome não dá para atribuir a um funcionário: vai para revisão.
    reconhecidos: list[_Bloco] = []
    for b in blocos:
        if b.nome:
            reconhecidos.append(b)
        else:
            nao_rec.append(NaoReconhecido(staging_path=b.origem, paginas=b.paginas, motivo=MOTIVO_SEM_NOME))
    return reconhecidos, nao_rec


def _dedup_por_titulo(blocos: list[_Bloco]) -> list[_Bloco]:
    """Deduplica por título (mesma pessoa confirmada): mantém o primeiro de cada título."""
    vistos: set[str] = set()
    saida: list[_Bloco] = []
    for b in blocos:
        if b.titulo_canonico in vistos:
            continue
        vistos.add(b.titulo_canonico)
        saida.append(b)
    return saida


def _distribuir_instancias(blocos: list[_Bloco]) -> list[list[_Bloco]]:
    """Sem CPF para desambiguar: distribui em instâncias sem repetir título dentro de cada uma.
    Um título repetido indica outra pessoa com o mesmo nome (abre nova instância)."""
    instancias: list[list[_Bloco]] = []
    titulos_por_inst: list[set[str]] = []
    for b in blocos:
        colocado = False
        for i, titulos in enumerate(titulos_por_inst):
            if b.titulo_canonico not in titulos:
                instancias[i].append(b)
                titulos.add(b.titulo_canonico)
                colocado = True
                break
        if not colocado:
            instancias.append([b])
            titulos_por_inst.append({b.titulo_canonico})
    return instancias


def _montar_funcionario(nome: str, cpf: str | None, blocos: list[_Bloco], revisao: str | None) -> Funcionario:
    docs = [
        DocumentoKit(titulo=b.titulo_canonico, ordem=b.ordem, paginas=b.paginas, origem=b.origem)
        for b in sorted(blocos, key=lambda b: b.ordem)
    ]
    return Funcionario(nome=nome, cpf_mascarado=mascarar_cpf(cpf), documentos=docs, revisao=revisao)


# ── Identificação, deduplicação e montagem por funcionário ───────────────────
def _identificar(blocos: list[_Bloco]) -> list[Funcionario]:
    por_nome: dict[str, list[_Bloco]] = defaultdict(list)
    for b in blocos:
        por_nome[normalizar(b.nome)].append(b)

    funcionarios: list[Funcionario] = []
    for _nome_norm, grupo in por_nome.items():
        com_cpf: dict[str, list[_Bloco]] = defaultdict(list)
        sem_cpf: list[_Bloco] = []
        for b in grupo:
            d = so_digitos(b.cpf)
            if len(d) == 11:
                com_cpf[d].append(b)
            else:
                sem_cpf.append(b)

        if len(com_cpf) == 0:
            # Nenhum CPF no grupo: distribui em instâncias para detectar homônimos. Mais de uma
            # instância = nomes iguais sem CPF, sinaliza para revisão (regra da OST).
            instancias = _distribuir_instancias(sem_cpf)
            revisao = REVISAO_NOME_SEM_CPF if len(instancias) > 1 else None
            for inst in instancias:
                funcionarios.append(_montar_funcionario(inst[0].nome, None, inst, revisao))
        elif len(com_cpf) == 1:
            # UMA pessoa: o CPF único identifica; os blocos do mesmo nome SEM CPF também são dela
            # (o CPF só aparece em alguns documentos). Une tudo e deduplica por título.
            ((cpf, bs),) = com_cpf.items()
            todos = bs + sem_cpf
            funcionarios.append(
                _montar_funcionario(todos[0].nome, cpf, _dedup_por_titulo(todos), None)
            )
        else:
            # Mesmo nome com CPFs DISTINTOS: cada CPF é uma pessoa (dedup). Os blocos sem CPF ficam
            # ambíguos (não dá para saber de quem são) e vão para revisão.
            for cpf, bs in com_cpf.items():
                funcionarios.append(_montar_funcionario(bs[0].nome, cpf, _dedup_por_titulo(bs), None))
            for inst in _distribuir_instancias(sem_cpf):
                funcionarios.append(
                    _montar_funcionario(inst[0].nome, None, inst, REVISAO_NOME_SEM_CPF)
                )

    return funcionarios


def processar(
    paginas_por_pdf: list[tuple[str, list[PaginaClassificada]]],
    dicionario: list[str],
) -> ResultadoMotor:
    """Monta o resultado: funcionários (kit ordenado pelo painel) + fila de não reconhecidos."""
    indice = _indice_dicionario(dicionario)
    blocos, nao_rec = _segmentar(paginas_por_pdf, indice)
    funcionarios = _identificar(blocos)
    # Ordena a saída de forma estável (por nome) sem revelar nada em log.
    funcionarios.sort(key=lambda f: normalizar(f.nome))
    return ResultadoMotor(
        funcionarios=funcionarios,
        nao_reconhecidos=nao_rec,
        pdfs=len(paginas_por_pdf),
    )
