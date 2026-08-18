"""Melhorias EAC, item 8: o cadastro bancário no prompt da auditoria.

A regra "Os dados bancários devem coincidir com os informados no cadastro" existe na base desde
sempre e era LETRA MORTA: a IA recebia nome e CPF e mais nada, sem ter contra o que comparar. Estes
testes travam o bloco novo do prompt e as duas garantias que ele carrega: campo vazio não vira rótulo
sem valor, e divergência NÃO reprova o documento.
"""

from app.gemini import _AUDITORIA_SYSTEM, _bloco_cadastro_bancario, montar_prompt_auditoria


def _prompt(cadastro=None) -> str:
    return montar_prompt_auditoria(
        tipo_documento_nome="Comprovante de Conta Bancária",
        candidato_nome="FULANO",
        candidato_cpf="00000000000",
        regras=["Os dados bancários devem coincidir com os informados no cadastro."],
        hoje="2026-08-17",
        cadastro_bancario=cadastro,
    )


def test_sem_cadastro_o_prompt_nao_ganha_bloco_nenhum():
    """A esmagadora maioria das auditorias não recebe cadastro: o prompt tem de ficar como era."""
    assert "CADASTRO BANCÁRIO PARA CONFERÊNCIA" not in _prompt()
    assert "CADASTRO BANCÁRIO PARA CONFERÊNCIA" not in _prompt({})


def test_bloco_traz_os_campos_enviados():
    texto = _prompt({"banco": "NUBANK", "agencia": "0001", "conta": "12345-6"})
    assert "CADASTRO BANCÁRIO PARA CONFERÊNCIA" in texto
    assert "banco: NUBANK" in texto
    assert "agencia: 0001" in texto
    assert "conta: 12345-6" in texto


def test_campo_ausente_nao_vira_rotulo_vazio():
    """Rótulo com valor vazio convidaria o modelo a concluir divergência onde não há informação."""
    texto = _bloco_cadastro_bancario({"banco": "ITAU", "agencia": "", "conta": None})
    assert "banco: ITAU" in texto
    assert "agencia:" not in texto
    assert "conta:" not in texto


def test_cadastro_so_com_campos_vazios_nao_gera_bloco():
    assert _bloco_cadastro_bancario({"banco": "", "agencia": None}) == ""


def test_bloco_diz_que_divergencia_nao_reprova():
    """A instrução que custa mais caro se o modelo ignorar: reprovar travaria a régua."""
    texto = _bloco_cadastro_bancario({"agencia": "0001"})
    assert "NÃO reprova" in texto
    assert "não mude o status" in texto


def test_system_instruction_fecha_os_rotulos_e_a_nao_reprovacao():
    assert "divergenciasCadastro" in _AUDITORIA_SYSTEM
    assert "'banco', 'agencia' e 'conta'" in _AUDITORIA_SYSTEM
    # Formatação diferente não é divergência: traço, zero à esquerda e caixa são ruído.
    assert "formatação" in _AUDITORIA_SYSTEM
    assert "NÃO reprova o documento" in _AUDITORIA_SYSTEM


def test_o_resto_do_prompt_continua_intacto():
    """§A.26: o bloco novo é aditivo, não pode ter deslocado o que já existia."""
    texto = _prompt({"agencia": "0001"})
    assert "A DATA DE HOJE É 2026-08-17" in texto
    assert "TIPO DE DOCUMENTO ESPERADO: Comprovante de Conta Bancária" in texto
    assert "CADASTRO PARA CONFERÊNCIA. nome: FULANO; cpf: 00000000000" in texto
    assert "REGRAS (única fonte de critério" in texto
