"""A GUARDA DE PAPEL do Portal (condição 3 do Desenho 1, a "guarda V3"), forçada em CÓDIGO.

O isolamento entre LER e ARQUIVAR é o centro da postura de segurança VS3 (parecer do diretor em
docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md): *quem abre arquivo que veio da internet não pode
segurar a chave do prontuário*. O leitor (`/portal/ler`) lê o objeto e o entrega ao modelo; o
arquivador (`/portal/arquivar`) copia os bytes para o Drive. As duas capacidades NÃO podem conviver
no mesmo processo, e esta é a trava que garante isso sem depender de disciplina de deploy.

- Uma instância só vira ARQUIVADOR declarando `PORTAL_PAPEL=ARQUIVADOR` (`settings.is_arquivador`).
  Essa é a instância magra que carrega a service account `ea-portal-arquivador`, com escrita só na
  árvore do prontuário por compartilhamento de pasta (sem delegação domain-wide).
- Qualquer OUTRA instância (a operação na 8000, o leitor na 8020) NÃO é arquivador: ela é RECUSADA
  no `/portal/arquivar` e segue livre no `/portal/ler`.
- A instância ARQUIVADOR é RECUSADA no `/portal/ler`, ANTES de qualquer byte ser baixado ou de o
  modelo ser chamado: o processo que tem a chave de escrita do prontuário nunca interpreta documento.

As duas dependências abaixo são `Depends(...)` de FastAPI e recusam com 403 (fail-closed). §A.6: a
recusa não carrega nome de objeto, nome nem CPF, só o motivo da separação de papel.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.config import get_settings


def exigir_papel_arquivador() -> None:
    """Deixa passar SÓ a instância ARQUIVADOR. Usada no /portal/arquivar.

    Inerte por padrão: sem `PORTAL_PAPEL=ARQUIVADOR`, toda chamada é recusada, exatamente como o
    leitor fica inerte sem `PORTAL_BUCKET`. É o que mantém a rota de escrita desligada na operação e
    no leitor, que NÃO têm a service account de escrita.
    """
    if not get_settings().is_arquivador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta instância não é o arquivador do Portal (PORTAL_PAPEL).",
        )


def recusar_se_arquivador() -> None:
    """Recusa a instância ARQUIVADOR. Usada no /portal/ler (a guarda V3).

    Quem tem a chave de escrita do prontuário (o arquivador) não pode ser o processo que abre e
    interpreta arquivo de origem externa. A recusa é ANTES do download e da chamada ao modelo.
    """
    if get_settings().is_arquivador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O arquivador do Portal não lê documento (separação de papel, VS3).",
        )
