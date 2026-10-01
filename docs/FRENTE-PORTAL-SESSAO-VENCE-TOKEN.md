# Frente mapeada: sessão guardada vence o token novo do link (prioridade quando abrir)

Levantada em 01/10/2026 na validação da Fase 1. NÃO introduzida nesta frente: já existia. Registrada
para o diretor acionar no gatilho certo. §A.11.

## O defeito

Na carga do Portal (`apps/frontend/src/app/portal/page.tsx:574-580`), se há uma **sessão guardada**
no navegador (`sessionStorage`, chave `portal:sessao`), a página a **retoma ANTES** de olhar o token
do link novo no fragmento (`#t=`). Se essa sessão guardada está morta (de um link anterior já
revogado/travado), a leitura falha e a tela mostra **"Este link não é mais válido. Procure o RH para
receber um link novo."**, e o **token novo do link é ignorado**.

## Por que importa (muda decisão)

O contorno hoje é **aba anônima** (sem sessão guardada), e foi assim que o diretor validou. Mas o
**candidato real não sabe disso**: ele recebe um link novo legítimo, abre no mesmo navegador onde
abriu um link antigo, vê "link não é mais válido", e **liga para o RH achando que o link quebrou**. O
link está vivo; o que está velho é a sessão no navegador dele.

## O conserto (quando a frente abrir)

Um **link novo no fragmento deve SOBREPOR a sessão guardada**, não o contrário: ao detectar `#t=` na
URL, descartar a sessão guardada e identificar com o token novo. Hoje a ordem é inversa.

Medido na validação: em contexto limpo (aba anônima) o link abre a trilha de primeira
(identificar 201, documentos 200); com sessão velha guardada, cai no "link não é mais válido".

**Prioridade quando a frente do Portal for aberta.** *(Registro solicitado pelo diretor.)*
