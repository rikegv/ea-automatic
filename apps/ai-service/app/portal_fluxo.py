"""ORÇAMENTO DE BYTES: o teto de tamanho aplicado DURANTE a leitura, não depois dela.

POR QUE ISTO NÃO É REDUNDANTE com o teto conferido no metadado do objeto. Metadado é DECLARAÇÃO, e
conferir declaração é conferir a palavra de quem está do outro lado. O orçamento aqui é a medida do
que de fato entrou na memória: passou do teto, a leitura é abortada no pedaço em que estourou, e o
que já tinha sido acumulado é descartado na hora. O arquivo de 400 MB nunca chega a existir inteiro
do nosso lado, nem para ser medido.

E ELE É A ÚNICA FORMA DE O ARQUIVO NÃO TOCAR O DISCO, se um dia a entrada vier por requisição. A
biblioteca web do Python (Starlette) atende `UploadFile` com um `SpooledTemporaryFile` de
`spool_max_size = 1024 * 1024`: acima de 1 MB ela GRAVA EM DISCO sozinha, sem ninguém pedir, e a
promessa de "nunca toca disco" morre em silêncio, com o arquivo já escrito. Ler por fluxo com
orçamento é o que dispensa o objeto de upload pronto. Hoje o leitor entra pelo bucket, e esta mesma
função mede o download; ela é escrita sobre pedaços de bytes justamente para servir aos dois.

§A.6: função pura, sem log, sem nome de arquivo, sem PII. O erro carrega só números.
"""

from __future__ import annotations

from collections.abc import Iterable

__all__ = ["OrcamentoEstourado", "ler_com_orcamento"]


class OrcamentoEstourado(Exception):
    """A leitura passou do teto. Carrega só o teto, nunca o conteúdo nem a origem."""

    def __init__(self, maximo: int) -> None:
        super().__init__(f"conteúdo acima do teto de {maximo} bytes")
        self.maximo = maximo


def ler_com_orcamento(pedacos: Iterable[bytes], maximo: int) -> bytes:
    """Junta os pedaços até `maximo` bytes. Passou disso, levanta `OrcamentoEstourado` e descarta.

    O descarte é explícito de propósito: sem ele, o acumulado do arquivo hostil ficaria vivo na
    memória até o coletor decidir passar, que é tempo demais para um serviço que atende vários
    candidatos ao mesmo tempo.
    """
    if maximo <= 0:
        raise ValueError("o teto de bytes tem de ser positivo")
    acumulado = bytearray()
    for pedaco in pedacos:
        if not pedaco:
            continue
        acumulado.extend(pedaco)
        if len(acumulado) > maximo:
            acumulado.clear()
            raise OrcamentoEstourado(maximo)
    return bytes(acumulado)
