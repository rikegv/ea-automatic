"""Etapa 2 do Gerador de Kit: motor de extração. Testes com dados sintéticos (sem dado real).

Cobre os 4 cenários da OST no nível do motor (lógica pura, determinística):
 a. 3 funcionários, 4 documentos cada, com um documento de 2 páginas (2a página sem título).
 b. Dois funcionários com o mesmo nome, sem CPF: duas entradas separadas sinalizadas.
 c. Título fora do dicionário: vai para não reconhecidos (nunca descartado).
 d. Variação de acento e caixa no título: reconhecido pelo casamento tolerante.
Mais unidades de normalização/máscara de CPF (§A.6).
"""

from app.kit_motor import (
    MOTIVO_SEM_NOME,
    MOTIVO_TITULO_FORA,
    REVISAO_NOME_AMBIGUO,
    REVISAO_NOME_SEM_CPF,
    PaginaClassificada,
    TituloKit,
    cpf_valido,
    mascarar_cpf,
    mesma_pessoa_por_nome,
    normalizar,
    processar,
)

DIC = [
    "REGISTRO DE EMPREGADO",
    "CONTRATO DE TRABALHO TEMPORÁRIO",
    "TERMO DE RESPONSABILIDADE",
    "DECLARAÇÃO DE DEPENDENTES",
]

# Dicionário com um documento PADRÃO no meio (instrução geral, sem nome de funcionário).
DIC_COM_PADRAO = [
    TituloKit("REGISTRO DE EMPREGADO"),
    TituloKit("MANUAL DE PROCEDIMENTOS", padrao=True),
    TituloKit("TERMO DE RESPONSABILIDADE"),
]

# CPFs sintéticos com dígito verificador VÁLIDO (o motor agora confere o verificador).
CPF_A = "529.982.247-25"
CPF_B = "390.533.447-05"
CPF_C = "111.444.777-35"


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


def test_cpf_valido_confere_digito_verificador():
    assert cpf_valido(CPF_A) and cpf_valido("52998224725")
    assert not cpf_valido("529.982.247-26")  # um dígito trocado (erro típico de leitura)
    assert not cpf_valido("111.111.111-11")  # sequência repetida passa no cálculo, não é CPF
    assert not cpf_valido("5299822472")  # 10 dígitos
    assert not cpf_valido(None)


def test_mesma_pessoa_por_nome_so_aceita_truncamento():
    # O caso real: o documento cortou o sobrenome no meio.
    assert mesma_pessoa_por_nome(
        "ELAINE CRISTINA LOPES FERNANDES DA S", "Elaine Cristina Lopes Fernandes da Silva"
    )
    assert mesma_pessoa_por_nome("Ana Lima", "ANA  LIMA")  # igual a menos de caixa e espaço
    # Recusas deliberadas: token sobrando e último token igual não são truncamento.
    assert not mesma_pessoa_por_nome("JOSE CARLOS SILVA", "JOSE CARLOS SILVA JUNIOR")
    assert not mesma_pessoa_por_nome("ANA LIMA", "ANA COSTA")
    assert not mesma_pessoa_por_nome("ANA LIMA", "")


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
            [pg(1, "REGISTRO DE EMPREGADO", "Ana Lima", cpf="123.456.789-09")],
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


# ═════════════════════════════════════════════════════════════════════════════
# AJUSTE 1: documento PADRÃO x INDIVIDUAL
# ═════════════════════════════════════════════════════════════════════════════
def test_ajuste1_padrao_nao_trava_e_entra_no_kit_de_todos():
    """O manual não tem nome, não vai para 'não reconhecidos' e entra no kit de cada funcionário."""
    paginas = [
        (
            "stg/registro.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
                pg(2, "REGISTRO DE EMPREGADO", "Bruno Souza"),
            ],
        ),
        (
            "stg/manual.pdf",
            [
                pg(1, "MANUAL DE PROCEDIMENTOS", None),  # instrução geral: SEM nome, de propósito
                pg(2, None, None),  # continuação do manual
            ],
        ),
    ]
    res = processar(paginas, DIC_COM_PADRAO)

    # Não trava: o manual não cai na fila de revisão.
    assert res.nao_reconhecidos == []
    assert len(res.funcionarios) == 2

    for f in res.funcionarios:
        titulos = [d.titulo for d in f.documentos]
        assert titulos == ["REGISTRO DE EMPREGADO", "MANUAL DE PROCEDIMENTOS"]  # ordem do painel
        manual = f.documentos[1]
        assert manual.paginas == [1, 2]  # as duas páginas do manual, replicadas
        assert manual.origem == "stg/manual.pdf"
        assert f.revisao is None


def test_ajuste1_individual_continua_exigindo_nome():
    """Espelho do teste acima: documento INDIVIDUAL sem nome continua indo para revisão."""
    paginas = [
        (
            "stg/mix.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
                pg(2, "TERMO DE RESPONSABILIDADE", None),  # INDIVIDUAL sem nome: não dá para atribuir
                pg(3, "MANUAL DE PROCEDIMENTOS", None),  # PADRÃO sem nome: legítimo
            ],
        ),
    ]
    res = processar(paginas, DIC_COM_PADRAO)

    assert len(res.nao_reconhecidos) == 1
    nr = res.nao_reconhecidos[0]
    assert nr.motivo == MOTIVO_SEM_NOME and nr.paginas == [2]

    assert len(res.funcionarios) == 1
    assert [d.titulo for d in res.funcionarios[0].documentos] == [
        "REGISTRO DE EMPREGADO",
        "MANUAL DE PROCEDIMENTOS",
    ]


def test_ajuste1_padrao_repetido_no_lote_entra_uma_vez_por_kit():
    """O manual impresso uma vez por pessoa no PDF-mãe não duplica dentro do kit de ninguém."""
    paginas = [
        (
            "stg/lote.pdf",
            [
                pg(1, "REGISTRO DE EMPREGADO", "Ana Lima"),
                pg(2, "MANUAL DE PROCEDIMENTOS", None),
                pg(3, "REGISTRO DE EMPREGADO", "Bruno Souza"),
                pg(4, "MANUAL DE PROCEDIMENTOS", None),  # o mesmo manual outra vez
            ],
        ),
    ]
    res = processar(paginas, DIC_COM_PADRAO)
    assert res.nao_reconhecidos == []
    assert len(res.funcionarios) == 2
    for f in res.funcionarios:
        manuais = [d for d in f.documentos if d.titulo == "MANUAL DE PROCEDIMENTOS"]
        assert len(manuais) == 1
        assert manuais[0].paginas == [2]  # a primeira ocorrência


def test_ajuste1_sem_marcacao_nada_muda():
    """Dicionário sem nenhum PADRÃO: comportamento anterior intacto (o sem nome vai para revisão)."""
    paginas = [("stg/x.pdf", [pg(1, "REGISTRO DE EMPREGADO", None)])]
    res = processar(paginas, DIC)
    assert res.funcionarios == []
    assert len(res.nao_reconhecidos) == 1
    assert res.nao_reconhecidos[0].motivo == MOTIVO_SEM_NOME


# ═════════════════════════════════════════════════════════════════════════════
# AJUSTE 2: o CPF é a chave primária (o caso da Elaine)
# ═════════════════════════════════════════════════════════════════════════════
def test_ajuste2_elaine_duas_grafias_mesmo_cpf_viram_uma_pessoa():
    """O caso real: o sobrenome truncado partia a funcionária em duas entradas."""
    truncado = "ELAINE CRISTINA LOPES FERNANDES DA S"
    completo = "ELAINE CRISTINA LOPES FERNANDES DA SILVA"
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", truncado, cpf=CPF_A)]),
        (
            "stg/b.pdf",
            [
                pg(1, "CONTRATO DE TRABALHO TEMPORÁRIO", completo, cpf=CPF_A),
                pg(2, "TERMO DE RESPONSABILIDADE", completo, cpf=CPF_A),
            ],
        ),
    ]
    res = processar(paginas, DIC)

    assert len(res.funcionarios) == 1  # uma pessoa, não duas
    f = res.funcionarios[0]
    assert f.nome == completo  # a grafia MAIS COMPLETA, não a truncada
    assert f.cpf_mascarado == "***.982.247-**"
    assert f.revisao is None
    assert [d.titulo for d in f.documentos] == [  # documentos consolidados, na ordem do painel
        "REGISTRO DE EMPREGADO",
        "CONTRATO DE TRABALHO TEMPORÁRIO",
        "TERMO DE RESPONSABILIDADE",
    ]


def test_ajuste2_cpfs_distintos_nunca_fundem_mesmo_com_nome_truncado():
    """GUARDA ABSOLUTA: nomes que casariam pela regra de truncamento, mas com CPFs diferentes."""
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "MARIA SOUZA LIM", cpf=CPF_A)]),
        ("stg/b.pdf", [pg(1, "REGISTRO DE EMPREGADO", "MARIA SOUZA LIMA", cpf=CPF_B)]),
    ]
    res = processar(paginas, DIC)
    assert len(res.funcionarios) == 2  # duas pessoas, o CPF manda
    assert {f.cpf_mascarado for f in res.funcionarios} == {"***.982.247-**", "***.533.447-**"}


def test_ajuste2_nomes_iguais_cpfs_distintos_continuam_duas_pessoas():
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "João Silva", cpf=CPF_A)]),
        ("stg/b.pdf", [pg(1, "REGISTRO DE EMPREGADO", "João Silva", cpf=CPF_B)]),
    ]
    res = processar(paginas, DIC)
    assert len(res.funcionarios) == 2
    assert all(f.revisao is None for f in res.funcionarios)  # o CPF resolve, nada a revisar


def test_ajuste2_sem_cpf_ambiguo_vira_entrada_propria_com_tarja():
    """Bloco sem CPF cujo nome casa com MAIS DE UM funcionário: não funde, sinaliza."""
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "Ana Lima", cpf=CPF_A)]),
        ("stg/b.pdf", [pg(1, "REGISTRO DE EMPREGADO", "Ana Lima", cpf=CPF_B)]),
        ("stg/c.pdf", [pg(1, "TERMO DE RESPONSABILIDADE", "Ana Lima")]),  # de quem é?
    ]
    res = processar(paginas, DIC)

    assert len(res.funcionarios) == 3
    orfa = [f for f in res.funcionarios if f.cpf_mascarado is None]
    assert len(orfa) == 1
    assert orfa[0].revisao == REVISAO_NOME_AMBIGUO
    assert [d.titulo for d in orfa[0].documentos] == ["TERMO DE RESPONSABILIDADE"]
    # As duas pessoas com CPF seguem intactas, cada uma com o seu REGISTRO.
    for f in res.funcionarios:
        if f.cpf_mascarado:
            assert [d.titulo for d in f.documentos] == ["REGISTRO DE EMPREGADO"]


def test_ajuste2_sem_cpf_com_nome_truncado_anexa_ao_dono():
    """Um único candidato: o documento sem CPF vai para o funcionário certo."""
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "ANA LIMA", cpf=CPF_A)]),
        ("stg/b.pdf", [pg(1, "TERMO DE RESPONSABILIDADE", "ANA LIM")]),  # truncado, sem CPF
    ]
    res = processar(paginas, DIC)
    assert len(res.funcionarios) == 1
    f = res.funcionarios[0]
    assert f.nome == "ANA LIMA"
    assert [d.titulo for d in f.documentos] == [
        "REGISTRO DE EMPREGADO",
        "TERMO DE RESPONSABILIDADE",
    ]


def test_ajuste2_token_sobrando_nao_anexa():
    """'JUNIOR' não é truncamento: continua sendo outra pessoa."""
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "JOSE CARLOS SILVA", cpf=CPF_A)]),
        ("stg/b.pdf", [pg(1, "TERMO DE RESPONSABILIDADE", "JOSE CARLOS SILVA JUNIOR")]),
    ]
    res = processar(paginas, DIC)
    assert len(res.funcionarios) == 2


def test_ajuste2_cpf_com_digito_errado_cai_no_nome_e_nao_funde_errado():
    """CPF reprovado no verificador não vira chave: o bloco cai no casamento por nome."""
    paginas = [
        ("stg/a.pdf", [pg(1, "REGISTRO DE EMPREGADO", "Ana Lima", cpf="529.982.247-26")]),
        ("stg/b.pdf", [pg(1, "TERMO DE RESPONSABILIDADE", "Ana Lima", cpf=CPF_C)]),
    ]
    res = processar(paginas, DIC)
    # O bloco do CPF inválido tem o mesmo nome do válido, então anexa a ele (identidade fraca).
    assert len(res.funcionarios) == 1
    f = res.funcionarios[0]
    assert f.cpf_mascarado == "***.444.777-**"  # o CPF exibido é o VÁLIDO, não o corrompido
    assert len(f.documentos) == 2


# ── OST do acento/encoding no matching do kit ────────────────────────────────
def test_normalizar_desfaz_mojibake_e_casa_com_a_regra():
    """O nome do documento chega com o encoding torto e MESMO ASSIM casa com a regra cadastrada.

    O caso real: "marcações" chegava como "marcaÃ§Ãµes" (UTF-8 lido como Latin-1) e reprovava por
    divergência que não existe. Acento e caixa JÁ funcionavam antes desta OST; o buraco era só o
    encoding.
    """
    from app.kit_motor import normalizar

    esperado = normalizar("marcações")
    for variante in ("marcações", "MARCAÇÕES", "marcacoes", "MarcaÇões", "marcaÃ§Ãµes"):
        assert normalizar(variante) == esperado, variante


def test_corrigir_mojibake_nao_estraga_texto_legitimo():
    """Sem assinatura de mojibake, o texto passa intacto: a correção nunca corrompe o que está certo."""
    from app.kit_motor import corrigir_mojibake

    for texto in ("Declaração", "TERMO DE RESPONSABILIDADE", "Contrato de Trabalho", ""):
        assert corrigir_mojibake(texto) == texto


def test_titulo_com_encoding_torto_casa_no_dicionario():
    """Ponta a ponta do matching: o dicionário tem o título certo, a página chega torta, e casa."""
    from app.kit_motor import _casar_titulo, _indice_dicionario, normalizar_dicionario

    indice = _indice_dicionario(normalizar_dicionario(["Declaração de Marcações"]))
    assert _casar_titulo("DeclaraÃ§Ã£o de marcaÃ§Ãµes", indice) is not None
    assert _casar_titulo("declaracao de marcacoes", indice) is not None
