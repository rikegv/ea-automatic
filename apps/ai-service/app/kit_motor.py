"""Motor de extração do Gerador de Kit (OST, etapa 2).

Recebe as páginas já classificadas (título detectado no topo, nome, CPF) de cada PDF e o dicionário
de títulos ATIVOS do kit selecionado, e monta um kit consolidado por funcionário na ordem do painel.

Lógica PURA (sem Gemini, sem banco, sem I/O): recebe dados já extraídos e devolve o resultado. Isso
torna o miolo determinístico e testável com PDFs sintéticos. A classificação por página (Gemini) e a
leitura do dicionário (banco) vivem fora deste módulo.

DUAS REGRAS DE IDENTIDADE (OST dos dois ajustes):

 1. Documento PADRÃO x INDIVIDUAL. Um título do dicionário marcado como PADRÃO é instrução geral
    (o mesmo manual para todo mundo), então NÃO tem nome de funcionário e NÃO pode ser cobrado por
    nome. Ele não vai para a fila de não reconhecidos: entra no kit de TODOS os funcionários do
    lote, na posição de ordem dele. A marcação é DADO (coluna `padrao` em `kit_regra_documento`),
    nunca dedução pelo nome do título.

 2. O CPF é a chave PRIMÁRIA de identidade, o nome é secundário. Blocos com CPF válido (dígito
    verificador conferido) agrupam por CPF IGNORANDO o nome, o que une as grafias divergentes da
    mesma pessoa (o caso do sobrenome truncado, "... DA S" e "... DA SILVA"). Blocos sem CPF
    anexam a um grupo por nome, com regra determinística de truncamento de token (nunca por
    similaridade numérica). GUARDA ABSOLUTA: dois CPFs válidos DISTINTOS nunca se fundem.

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


# Sinais de MOJIBAKE: sequências que só aparecem quando bytes UTF-8 foram lidos como Latin-1/CP1252.
# "ç" (0xC3 0xA7) vira "Ã§", "õ" vira "Ãµ", "ã" vira "Ã£". O "Ã"/"Â" seguido de um caractere da faixa
# latina é a assinatura, e ela não ocorre em português escrito corretamente.
_MOJIBAKE = re.compile(r"[ÃÂ][\x80-\xbf\u00a0-\u00ff]")


def corrigir_mojibake(texto: str) -> str:
    """Desfaz o UTF-8 lido como Latin-1 ("marcaÃ§Ãµes" -> "marcações"). Sem sinal, devolve intacto.

    POR QUE EXISTE (OST do acento no matching do kit). O `normalizar` abaixo já era tolerante a ACENTO
    e CAIXA: "marcações", "MARCAÇÕES" e "marcacoes" sempre casaram entre si. O que ele NÃO resolvia é
    o nome que chega com o ENCODING TORTO, e aí "marcaÃ§Ãµes" virava "MARCAA§AΜES", que não casa com
    "MARCACOES" e reprovava o documento por uma divergência que não existe.

    A reversão é o caminho inverso exato do estrago: reinterpreta o texto como Latin-1 e decodifica
    como UTF-8. Só age quando há ASSINATURA de mojibake e quando a volta é bem-sucedida; qualquer
    falha devolve o original, então texto legítimo com "Ã" (raro, mas existe) nunca é corrompido.
    """
    if not texto or not _MOJIBAKE.search(texto):
        return texto
    try:
        corrigido = texto.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return texto
    # Só aceita se de fato melhorou: a assinatura tem de sumir. Senão, mantém o original.
    return corrigido if not _MOJIBAKE.search(corrigido) else texto


def normalizar(texto: str | None) -> str:
    """Chave estável: encoding corrigido, sem acento, caixa alta, espaços colapsados.

    A ordem importa: o mojibake é desfeito ANTES de tirar o acento, senão "Ã§" viraria "A§" e a
    informação de que aquilo era um "ç" já teria sido perdida.
    """
    if not texto:
        return ""
    return re.sub(r"\s+", " ", _sem_acento(corrigir_mojibake(texto)).strip()).upper()


def so_digitos(cpf: str | None) -> str:
    return re.sub(r"\D", "", cpf or "")


def mascarar_cpf(cpf: str | None) -> str | None:
    """Mascara o CPF (§A.6): mostra só os 6 dígitos do meio, ex.: ***.456.789-**. Nulo se inválido.

    Mascarar é EXIBIÇÃO: basta ter 11 dígitos. Servir de CHAVE de identidade é outra coisa e exige
    `cpf_valido` (dígito verificador), ver abaixo.
    """
    d = so_digitos(cpf)
    if len(d) != 11:
        return None
    return f"***.{d[3:6]}.{d[6:9]}-**"


def cpf_valido(cpf: str | None) -> bool:
    """CPF aceitável como CHAVE de identidade: 11 dígitos com o dígito verificador conferido.

    Endurecido de propósito (antes bastava o comprimento). O CPF é lido de um PDF por OCR, e um
    dígito trocado pela leitura vira uma chave de fusão errada: juntaria duas pessoas ou partiria
    uma. O verificador rejeita a esmagadora maioria dos erros de um dígito. Reprova também as
    sequências repetidas (00000000000 ... 99999999999), que passam no cálculo mas não são CPF.
    Reprovado aqui, o bloco não perde o documento: cai no casamento por NOME (identidade fraca).
    """
    d = so_digitos(cpf)
    if len(d) != 11 or len(set(d)) == 1:
        return False
    for tamanho in (9, 10):
        soma = sum(int(d[i]) * (tamanho + 1 - i) for i in range(tamanho))
        resto = (soma * 10) % 11
        if resto == 10:
            resto = 0
        if resto != int(d[tamanho]):
            return False
    return True


# ── Identidade fraca: casamento de nome por truncamento (determinístico) ─────
def _tokens(nome: str | None) -> list[str]:
    return [t for t in normalizar(nome).split(" ") if t]


def mesma_pessoa_por_nome(a: str | None, b: str | None) -> bool:
    """Dois nomes são da mesma pessoa quando são iguais OU quando um é TRUNCAMENTO do outro.

    Truncamento, e nada além disso: mesma quantidade de tokens, todos os tokens anteriores
    idênticos, e o último token do menor é prefixo PRÓPRIO do último token do maior. É exatamente o
    modo de falha real (o campo do documento corta o sobrenome no meio): "... DA S" casa com
    "... DA SILVA".

    O que a regra recusa de propósito, para não fundir pessoas diferentes:
     - token sobrando, "JOSE CARLOS SILVA" contra "JOSE CARLOS SILVA JUNIOR" (contagem diferente);
     - último token igual, que não é truncamento e sim outro nome;
     - qualquer parecença que não seja prefixo, porque não existe limiar numérico aqui. Ratio de
       similaridade (Jaro, difflib) é justamente onde nasce o falso-positivo, e resolveria erro de
       DIGITAÇÃO, que não é o problema desta entrega.
    """
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    if len(ta) != len(tb):  # token sobrando não é truncamento
        return False
    if ta[:-1] != tb[:-1]:  # tudo antes do último token tem de bater exatamente
        return False
    curto, longo = sorted((ta[-1], tb[-1]), key=len)
    return len(curto) < len(longo) and longo.startswith(curto)


# ── Estruturas ───────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class TituloKit:
    """Uma linha do dicionário do kit: o título e se ele é PADRÃO (instrução geral, sem nome).

    `padrao=False` é o INDIVIDUAL, documento da pessoa, que continua exigindo nome. É o default em
    todos os caminhos (banco, conversão e testes), então nada muda para quem já existia.
    """

    titulo: str
    padrao: bool = False


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
    padrao: bool = False


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
REVISAO_NOME_AMBIGUO = (
    "Documento sem CPF cujo nome é compatível com mais de um funcionário. Revisar antes de baixar."
)


def normalizar_dicionario(dicionario: "list[str] | list[TituloKit]") -> list[TituloKit]:
    """Aceita a lista do painel como `TituloKit` ou como texto puro (nesse caso, tudo INDIVIDUAL)."""
    return [t if isinstance(t, TituloKit) else TituloKit(titulo=t) for t in dicionario]


def _indice_dicionario(dicionario: list[TituloKit]) -> dict[str, tuple[str, int, bool]]:
    """Mapa {titulo_normalizado: (titulo_canonico, ordem, padrao)} na ordem do painel."""
    return {normalizar(t.titulo): (t.titulo, i + 1, t.padrao) for i, t in enumerate(dicionario)}


def _casar_titulo(bruto: str, indice: dict[str, tuple[str, int, bool]]) -> tuple[str, int, bool] | None:
    """Casa um título detectado contra o dicionário (exato após normalizar acento/caixa)."""
    return indice.get(normalizar(bruto))


# ── Segmentação: agrupa páginas contíguas por documento ──────────────────────
def _segmentar(
    paginas_por_pdf: list[tuple[str, list[PaginaClassificada]]],
    indice: dict[str, tuple[str, int, bool]],
) -> tuple[list[_Bloco], list[_Bloco], list[NaoReconhecido]]:
    """Devolve (blocos INDIVIDUAIS, blocos PADRÃO, não reconhecidos)."""
    blocos: list[_Bloco] = []
    nao_rec: list[NaoReconhecido] = []

    for origem, paginas in paginas_por_pdf:
        atual_bloco: _Bloco | None = None
        atual_nao_rec: NaoReconhecido | None = None
        for pg in paginas:
            if pg.titulo:  # começa um novo documento
                match = _casar_titulo(pg.titulo, indice)
                if match:
                    titulo_canonico, ordem, padrao = match
                    atual_bloco = _Bloco(
                        titulo_canonico=titulo_canonico,
                        ordem=ordem,
                        nome=(pg.nome or "").strip(),
                        cpf=pg.cpf,
                        paginas=[pg.pagina],
                        origem=origem,
                        padrao=padrao,
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

    # Separação PADRÃO x INDIVIDUAL (Ajuste 1).
    #  - PADRÃO: instrução geral, igual para todos. Não pertence a ninguém e por isso NUNCA é cobrado
    #    por nome, mesmo que a página traga um nome por acaso. Vai para a lista própria e depois é
    #    replicado no kit de cada funcionário.
    #  - INDIVIDUAL: documento da pessoa. Sem nome não dá para atribuir, então continua indo para a
    #    fila de revisão, exatamente como antes.
    individuais: list[_Bloco] = []
    padroes: list[_Bloco] = []
    for b in blocos:
        if b.padrao:
            padroes.append(b)
        elif b.nome:
            individuais.append(b)
        else:
            nao_rec.append(NaoReconhecido(staging_path=b.origem, paginas=b.paginas, motivo=MOTIVO_SEM_NOME))
    return individuais, _dedup_por_titulo(padroes), nao_rec


def _dedup_por_titulo(blocos: list[_Bloco]) -> list[_Bloco]:
    """Deduplica por título (mesma pessoa confirmada, ou o mesmo PADRÃO repetido no lote): mantém o
    primeiro de cada título."""
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


def _nome_canonico(blocos: list[_Bloco]) -> str:
    """A grafia MAIS COMPLETA do grupo (a mais longa), com empate resolvido pela primeira ocorrência.

    É o que conserta a exibição quando o documento truncou o sobrenome: entre "... DA S" e
    "... DA SILVA", o painel mostra a inteira.
    """
    melhor = blocos[0].nome
    for b in blocos[1:]:
        if len(normalizar(b.nome)) > len(normalizar(melhor)):
            melhor = b.nome
    return melhor


def _montar_funcionario(
    nome: str,
    cpf: str | None,
    blocos: list[_Bloco],
    revisao: str | None,
    padroes: list[_Bloco],
) -> Funcionario:
    """Kit de UM funcionário: os documentos individuais dele MAIS os PADRÃO do lote (Ajuste 1,
    opção A), tudo na ordem do painel. O PADRÃO é replicado em cada kit e sai no PDF consolidado."""
    docs = [
        DocumentoKit(titulo=b.titulo_canonico, ordem=b.ordem, paginas=b.paginas, origem=b.origem)
        for b in sorted(_dedup_por_titulo(blocos + padroes), key=lambda b: b.ordem)
    ]
    return Funcionario(nome=nome, cpf_mascarado=mascarar_cpf(cpf), documentos=docs, revisao=revisao)


# ── Identificação, deduplicação e montagem por funcionário ───────────────────
def _identificar(blocos: list[_Bloco], padroes: list[_Bloco]) -> list[Funcionario]:
    """Agrupa os blocos em funcionários com o CPF como chave PRIMÁRIA (Ajuste 2).

    A ordem das decisões é o ponto da mudança. Antes o balde era o NOME e o CPF só desempatava
    dentro dele, então duas grafias da mesma pessoa nunca chegavam a ter os CPFs comparados e
    viravam dois funcionários. Agora o CPF agrupa primeiro, ignorando o nome.
    """
    # 1. CHAVE PRIMÁRIA: um grupo por CPF válido, o nome não interfere.
    grupos: dict[str, list[_Bloco]] = {}
    sem_cpf: list[_Bloco] = []
    for b in blocos:
        if cpf_valido(b.cpf):
            grupos.setdefault(so_digitos(b.cpf), []).append(b)
        else:
            sem_cpf.append(b)

    # 2. Identidade fraca: o bloco sem CPF anexa a um grupo pelo nome (igual ou truncado). Casou com
    #    MAIS DE UM grupo, não escolhe: vira entrada própria com tarja para o consultor decidir.
    anexos: dict[str, list[_Bloco]] = defaultdict(list)
    ambiguos: list[_Bloco] = []
    orfaos: list[_Bloco] = []
    for b in sem_cpf:
        candidatos = [
            cpf
            for cpf, bs in grupos.items()
            if any(mesma_pessoa_por_nome(b.nome, x.nome) for x in bs)
        ]
        if len(candidatos) == 1:
            anexos[candidatos[0]].append(b)
        elif len(candidatos) > 1:
            ambiguos.append(b)
        else:
            orfaos.append(b)

    funcionarios: list[Funcionario] = []

    # 3. Um funcionário por CPF. GUARDA ABSOLUTA: dois CPFs válidos distintos são duas pessoas,
    #    por mais parecidos que sejam os nomes, e nada aqui os aproxima.
    for cpf, bs in grupos.items():
        todos = bs + anexos.get(cpf, [])
        funcionarios.append(
            _montar_funcionario(_nome_canonico(todos), cpf, _dedup_por_titulo(todos), None, padroes)
        )

    # 4. Ambíguos: entrada própria com tarja, nunca fusão silenciosa.
    for inst in _distribuir_instancias(ambiguos):
        funcionarios.append(
            _montar_funcionario(inst[0].nome, None, inst, REVISAO_NOME_AMBIGUO, padroes)
        )

    # 5. Sem CPF em lugar nenhum: comportamento anterior intacto (balde por nome exato, homônimo
    #    detectado por título repetido e sinalizado).
    por_nome: dict[str, list[_Bloco]] = defaultdict(list)
    for b in orfaos:
        por_nome[normalizar(b.nome)].append(b)
    for _nome_norm, grupo in por_nome.items():
        instancias = _distribuir_instancias(grupo)
        revisao = REVISAO_NOME_SEM_CPF if len(instancias) > 1 else None
        for inst in instancias:
            funcionarios.append(_montar_funcionario(inst[0].nome, None, inst, revisao, padroes))

    return funcionarios


def processar(
    paginas_por_pdf: list[tuple[str, list[PaginaClassificada]]],
    dicionario: "list[str] | list[TituloKit]",
) -> ResultadoMotor:
    """Monta o resultado: funcionários (kit ordenado pelo painel) + fila de não reconhecidos.

    Sem nenhum funcionário identificado não existe kit, então os PADRÃO do lote simplesmente não
    têm onde entrar (não há a quem replicar).
    """
    indice = _indice_dicionario(normalizar_dicionario(dicionario))
    blocos, padroes, nao_rec = _segmentar(paginas_por_pdf, indice)
    funcionarios = _identificar(blocos, padroes)
    # Ordena a saída de forma estável (por nome) sem revelar nada em log.
    funcionarios.sort(key=lambda f: normalizar(f.nome))
    return ResultadoMotor(
        funcionarios=funcionarios,
        nao_reconhecidos=nao_rec,
        pdfs=len(paginas_por_pdf),
    )
