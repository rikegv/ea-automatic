"""Etapa 2 do Gerador de Kit: motor de extração. Testes com dados sintéticos (sem dado real).

Cobre os 4 cenários da OST no nível do motor (lógica pura, determinística):
 a. 3 funcionários, 4 documentos cada, com um documento de 2 páginas (2a página sem título).
 b. Dois funcionários com o mesmo nome, sem CPF: duas entradas separadas sinalizadas.
 c. Título fora do dicionário: vai para não reconhecidos (nunca descartado).
 d. Variação de acento e caixa no título: reconhecido pelo casamento tolerante.
Mais unidades de normalização/máscara de CPF (§A.6).
"""

from app.kit_motor import (
    MOTIVO_TITULO_FORA,
    REVISAO_NOME_SEM_CPF,
    PaginaClassificada,
    mascarar_cpf,
    normalizar,
    processar,
)

DIC = [
    "REGISTRO DE EMPREGADO",
    "CONTRATO DE TRABALHO TEMPORÁRIO",
    "TERMO DE RESPONSABILIDADE",
    "DECLARAÇÃO DE DEPENDENTES",
]


def pg(n: int, titulo: str | None, nome: str | None, cpf: str | None = None) -> PaginaClassificada:
    return PaginaClassificada(pagina=n, titulo=titulo, nome=nome, cpf=cpf)


# ── Unidades: normalização e máscara ─────────────────────────────────────────
def test_normalizar_tolera_acento_caixa_espacos():
    assert normalizar("  Registro   de  EMPREGÁDO ") == normalizar("registro de empregado")
    assert normalizar("Declaração") == "DECLARACAO"


def test_mascarar_cpf():
    assert mascarar_cpf("123.456.789-01") == "***.456.789-**"
    assert mascarar_cpf("12345678901") == "***.456.789-**"
    assert mascarar_cpf("123") is None
    assert mascarar_cpf(None) is None


# ── Cenário A: 3 funcionários, 4 docs cada, um doc de 2 páginas ──────────────
def test_a_tres_funcionarios_doc_de_duas_paginas():
    paginas = [
        (
            "stg/registro.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
                pg(2, "REGISTRO DE EMPREGADO", "Bruno Souza"),
                pg(3, "REGISTRO DE EMPREGADO", "Carla Dias"),
            ],
        ),
        (
            "stg/contrato.pdf",
            [
                pg(1, "CONTRATO DE TRABALHO TEMPORÁRIO", "Ana Lima"),
                pg(2, "CONTRATO DE TRABALHO TEMPORÁRIO", "Bruno Souza"),
                pg(3, "CONTRATO DE TRABALHO TEMPORÁRIO", "Carla Dias"),
            ],
        ),
        (
            "stg/termo.pdf",
            [
                pg(1, "TERMO DE RESPONSABILIDADE", "Ana Lima"),
                pg(2, None, None),  # continuação do TERMO da Ana (2a página, sem título)
                pg(3, "TERMO DE RESPONSABILIDADE", "Bruno Souza"),
                pg(4, "TERMO DE RESPONSABILIDADE", "Carla Dias"),
            ],
        ),
        (
            "stg/declaracao.pdf",
            [
                pg(1, "DECLARAÇÃO DE DEPENDENTES", "Ana Lima"),
                pg(2, "DECLARAÇÃO DE DEPENDENTES", "Bruno Souza"),
                pg(3, "DECLARAÇÃO DE DEPENDENTES", "Carla Dias"),
            ],
        ),
    ]
    res = processar(paginas, DIC)
    assert res.nao_reconhecidos == []
    assert len(res.funcionarios) == 3
    for f in res.funcionarios:
        assert len(f.documentos) == 4
        assert [d.ordem for d in f.documentos] == [1, 2, 3, 4]  # ordem do painel
        assert f.revisao is None
    ana = next(f for f in res.funcionarios if f.nome == "Ana Lima")
    termo = next(d for d in ana.documentos if d.titulo == "TERMO DE RESPONSABILIDADE")
    assert termo.paginas == [1, 2]  # documento de 2 páginas (título + continuação)


# ── Cenário B: dois funcionários com o mesmo nome, sem CPF ───────────────────
def test_b_mesmo_nome_sem_cpf_duas_entradas_sinalizadas():
    paginas = [
        (
            "stg/registro.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "João Silva"),
                pg(2, "REGISTRO DE EMPREGADO", "João Silva"),
            ],
        ),
        (
            "stg/contrato.pdf",
            [
                pg(1, "CONTRATO DE TRABALHO TEMPORÁRIO", "João Silva"),
                pg(2, "CONTRATO DE TRABALHO TEMPORÁRIO", "João Silva"),
            ],
        ),
    ]
    res = processar(paginas, DIC)
    assert res.nao_reconhecidos == []
    assert len(res.funcionarios) == 2  # duas entradas SEPARADAS, não fundidas
    for f in res.funcionarios:
        assert f.nome == "João Silva"
        assert f.cpf_mascarado is None
        assert f.revisao == REVISAO_NOME_SEM_CPF  # sinalizado para revisão
        assert [d.titulo for d in f.documentos] == [
            "REGISTRO DE EMPREGADO",
            "CONTRATO DE TRABALHO TEMPORÁRIO",
        ]


# ── CPF em só alguns documentos: mesma pessoa (não divide) ───────────────────
def test_cpf_parcial_mesma_pessoa_nao_divide():
    # O CPF aparece no REGISTRO mas não no TERMO; é o mesmo funcionário.
    paginas = [
        (
            "stg/registro.pdf",
            [pg(1, "REGISTRO DE EMPREGADO", "Ana Lima", cpf="123.456.789-01")],
        ),
        (
            "stg/termo.pdf",
            [pg(1, "TERMO DE RESPONSABILIDADE", "Ana Lima")],  # sem CPF
        ),
    ]
    res = processar(paginas, DIC)
    assert len(res.funcionarios) == 1  # uma pessoa, não duas
    f = res.funcionarios[0]
    assert f.nome == "Ana Lima"
    assert f.cpf_mascarado == "***.456.789-**"
    assert f.revisao is None
    assert [d.titulo for d in f.documentos] == [
        "REGISTRO DE EMPREGADO",
        "TERMO DE RESPONSABILIDADE",
    ]


# ── Cenário C: título fora do dicionário vai para não reconhecidos ───────────
def test_c_titulo_fora_do_dicionario():
    paginas = [
        (
            "stg/mix.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
                pg(2, "REGISTRO DE PONTO", "Ana Lima"),  # título inexistente no dicionário
            ],
        ),
    ]
    res = processar(paginas, DIC)
    assert len(res.nao_reconhecidos) == 1
    nr = res.nao_reconhecidos[0]
    assert nr.paginas == [2]
    assert nr.staging_path == "stg/mix.pdf"
    assert MOTIVO_TITULO_FORA in nr.motivo
    # o documento reconhecido continua atribuído normalmente
    assert len(res.funcionarios) == 1
    assert [d.titulo for d in res.funcionarios[0].documentos] == ["REGISTRO DE EMPREGADO"]


# ── Cenário D: variação de acento e caixa é reconhecida ──────────────────────
def test_d_variacao_acento_caixa_reconhecida():
    paginas = [
        (
            "stg/x.pdf",
            [
                pg(1, "  registro   de  EMPREGÁDO ", "Ana Lima"),  # minúscula + acento errado + espaços
                pg(2, "declaraçao de dependentes", "Ana Lima"),  # sem acento no ç/til, minúscula
            ],
        ),
    ]
    res = processar(paginas, DIC)
    assert res.nao_reconhecidos == []
    assert len(res.funcionarios) == 1
    titulos = {d.titulo for d in res.funcionarios[0].documentos}
    assert titulos == {"REGISTRO DE EMPREGADO", "DECLARAÇÃO DE DEPENDENTES"}  # títulos canônicos
