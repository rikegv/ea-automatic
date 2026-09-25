# DEMO Portal do Candidato: validar na tela (com os 4 ajustes)

> Homologacao / DEMO (3120). Nada aqui toca a producao. Os 4 ajustes que voce pediu ja estao no ar.
> A candidata sintetica e "Maria Simulada" (dados SIMULADOS, §A.6, sem PII real).

## Os 4 ajustes, e como VER cada um

1. **Casa do RG vazia:** a admissao sintetica abaixo nasce SEM o RG anexado. Voce sobe o RG e ve a
   IA processar ao vivo.
2. **Motivo da reprova claro:** quando a IA reprova, a tela diz o motivo em linguagem de candidato.
   Ex.: RG sem foto/assinatura nitidas: *"Nao conseguimos ver bem a foto ou a assinatura do
   documento. Envie uma foto nitida, com o rosto e a assinatura bem visiveis, sem reflexo."*
3. **Mensagem de "processando" maior:** enquanto a IA valida, aparece em destaque
   *"Estamos processando o seu documento. Voce pode enviar o proximo agora. No final, a gente avisa
   se algum precisar de ajuste."*
4. **Sem campos vazios de auditoria:** a tela de conferencia mostra so os campos preenchiveis
   (numero do RG, orgao, nome, nascimento, filiacao), sem as linhas vazias de "Legibilidade",
   "Foto", "Assinatura".

## O que voce precisa

- **Endereco:** `http://10.18.117.235:3120` (§A.32, ambiente unico).
- **Link da candidata (pristino, emitido agora, vale ate 26/09):**
  `http://10.18.117.235:3120/portal#t=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTY5MjcyZC00YjcxLTQwZjUtODFkMi03MWMyZTM1MDgyOGIiLCJqdGkiOiJhZGM4YmY1Ny01NjRjLTQ5ODYtYjM0My1iMzhjNWNmNDRhMTAiLCJ0eXAiOiJwb3J0YWwtbGluayIsImlhdCI6MTc5MDE4ODkyMiwiZXhwIjoxNzkwNDQ4MTIyfQ.v4KFFaNflYvwBoyGx4Xj2b_Q8BGnjaI9vZ15txJ-LEOd8lYW4G_pKyUmtCmjMF7Eh0tBCnUojTILd7XqyK1tAQ`
- **Dados para identificar:** CPF `111.444.777-35`, nascimento `10/05/1990`.
- **Dois documentos de teste** que a fabrica te mandou:
  - `demo-portal-rg-simulado.png` (RG BOM: foto e assinatura nitidas, dados batem) -> a IA APROVA.
  - `demo-portal-rg-simulado-ruim.png` (RG RUIM: so a silhueta, sem assinatura) -> a IA REPROVA
    com o motivo claro (ajuste 2).

## Passo a passo

1. Abra o link. Digite o CPF `111.444.777-35` e nascimento `10/05/1990`, clique **Entrar**.
   - Se aparecer *"Muitas tentativas"*, e a trava anti-abuso do CPF (5 tentativas / 15 min, LGPD).
     Espere ~15 min e repita. A fabrica testou muito neste CPF hoje, entao ele pode estar em
     descanso; passa sozinho.
2. Aceite o termo, **Comecar**. Na tela "O Que Reunir", **Continuar**. Em "Como Funciona",
   **Comecar a enviar**.
3. Voce cai no **RG** (primeiro documento).
   - **Para ver a APROVACAO (ajustes 3 e 4):** suba o `demo-portal-rg-simulado.png`. A IA processa
     (mensagem grande do ajuste 3) e abre a **conferencia** com os campos lidos, **sem linhas
     vazias** (ajuste 4). Confira/corrija e **Confirmar e continuar**.
   - **Para ver a REPROVA com motivo claro (ajuste 2):** suba o `demo-portal-rg-simulado-ruim.png`.
     A IA reprova e a tela diz *"Nao conseguimos ver bem a foto ou a assinatura..."*.

## Observacoes (§A.31: registro, nao mexi)

- **Motivo cru no canal do time:** o texto tecnico que a IA gera fica guardado no campo interno da
  admissao (atras de login/RBAC, na aba de Auditoria), igual a esteira ja faz. Ao candidato so vai
  a frase curta e sem PII. Se voce quiser tolerancia zero de PII de terceiro nesse campo interno, e
  decisao sua e alcanca esteira + portal juntos (o `seguranca` levantou isso na auditoria).

## Se algo nao abrir

- **"Link Invalido":** um link novo revoga o anterior da mesma admissao. Me peca outro.
- **"Muitas tentativas":** trava de 15 min do CPF. Espere e repita.
- **"Portal indisponivel" / 503:** lacuna de config do homolog, nao regressao. Me avise.
