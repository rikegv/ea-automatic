"""PROCESSO FILHO COM MORTE DURA: leitor travado não segura o serviço (exigência 5).

POR QUE NÃO BASTA UM RELÓGIO. O único tempo limite que existe hoje no caminho da IA está do lado de
QUEM CHAMA (`ai-client.service.ts`, 120 segundos): ele aborta a ESPERA, e não o TRABALHO. O
interpretador do lado de cá continua mastigando o arquivo, e um PDF construído para isso deixa de ser
um documento recusado e passa a ser um trabalhador a menos, para sempre. Com um punhado deles, o
serviço para de atender sem nunca ter caído.

MORTE DURA, EM DOIS TEMPOS: estourado o prazo, o filho recebe o pedido de encerrar e, se ainda estiver
vivo, é MORTO. O segundo tempo existe porque o primeiro é um sinal que o processo preso dentro de uma
extensão em C pode simplesmente não processar, que é exatamente o caso de um laço de parser.

O CONTEXTO É `spawn`, E ISSO É ESCOLHA DE SEGURANÇA, NÃO DE PORTABILIDADE. `fork` seria mais barato,
mas entregaria ao processo que abre bytes hostis uma cópia da memória do pai, com a credencial do
Google que já está carregada. O filho nasce limpo, importa só o que precisa, recebe bytes e devolve
um dicionário pequeno. O custo de partida entra dentro do mesmo prazo.

§A.6: só bytes e números atravessam a fronteira. Nenhum nome, nenhum CPF e nenhum caminho de arquivo
são passados ao filho, e o erro que volta é o NOME do tipo da exceção, nunca a mensagem, que poderia
espelhar conteúdo do documento.
"""

from __future__ import annotations

import logging
import multiprocessing as mp

from app.portal_inspecao import inspecionar

__all__ = ["TempoEsgotado", "FalhaNaInspecao", "inspecionar_com_morte_dura"]

logger = logging.getLogger("ea.ai.portal")


class TempoEsgotado(Exception):
    """A inspeção passou do prazo e o processo filho foi morto."""


class FalhaNaInspecao(Exception):
    """O filho morreu ou devolveu erro. Carrega o TIPO da exceção, nunca a mensagem."""

    def __init__(self, tipo: str) -> None:
        super().__init__(tipo)
        self.tipo = tipo


def _alvo(conexao, conteudo: bytes, limites: dict) -> None:
    """Corpo do filho. Devolve o veredicto pelo cano e encerra. Nunca levanta para fora."""
    try:
        conexao.send(("ok", inspecionar(conteudo, **limites)))
    except BaseException as exc:  # noqa: BLE001 - o tipo volta, a mensagem não (§A.6)
        try:
            conexao.send(("erro", type(exc).__name__))
        except Exception:  # noqa: BLE001 - cano já fechado: o pai trata como filho morto
            pass
    finally:
        conexao.close()


def inspecionar_com_morte_dura(
    conteudo: bytes,
    *,
    paginas_max: int,
    lado_max: int,
    megapixels_max: float,
    tempo_max_s: float,
) -> dict:
    """Roda `inspecionar` no filho. `TempoEsgotado` no estouro, com o filho MORTO antes de voltar."""
    contexto = mp.get_context("spawn")
    receptor, emissor = contexto.Pipe(duplex=False)
    limites = {
        "paginas_max": paginas_max,
        "lado_max": lado_max,
        "megapixels_max": megapixels_max,
    }
    processo = contexto.Process(target=_alvo, args=(emissor, conteudo, limites), daemon=True)
    processo.start()
    # O pai fecha a ponta de escrita: sem isso, o `poll` nunca enxerga o cano fechar quando o filho
    # morre, e a morte do filho viraria espera até o prazo em vez de erro imediato.
    emissor.close()
    try:
        if not receptor.poll(tempo_max_s):
            raise TempoEsgotado()
        try:
            marca, carga = receptor.recv()
        except EOFError as exc:
            raise FalhaNaInspecao("ProcessoMorto") from exc
        if marca != "ok":
            raise FalhaNaInspecao(str(carga))
        return carga
    finally:
        receptor.close()
        _matar(processo)


def _matar(processo) -> None:
    """Encerra e, se preciso, MATA. Nenhum filho sobrevive ao retorno desta função."""
    if processo.is_alive():
        processo.terminate()
        processo.join(1.0)
    if processo.is_alive():
        processo.kill()
        processo.join(1.0)
    processo.close()
