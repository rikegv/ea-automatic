# Revalidar os 6 bugs de tela do Portal (na 3120)

> Os 6 bugs foram corrigidos e ja estao no ar na homolog. A raiz era comum: o resultado da IA era
> efemero (so vivia na memoria da tela). Agora ele e persistido (tabela `portal_conferencia`, TTL
> 48h) e a trilha devolve, entao a tela nao regride nem perde dado ao navegar/atualizar. Candidata
> sintetica: Maria Simulada, CPF 111.444.777-35, nascimento 10/05/1990.

## Link e documentos
- Endereco: `http://10.18.117.235:3120`
- Link pristino (vale ate 26/09): `http://10.18.117.235:3120/portal#t=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTk3NTkzYi03ZGNmLTQzOTYtOGNhYy1kNWI4NTU4ZTk0OWMiLCJqdGkiOiJlYjNmYjJkZi04MjJkLTRkNDQtYmMwOS0zY2YzNGRmN2U3NGUiLCJ0eXAiOiJwb3J0YWwtbGluayIsImlhdCI6MTc5MDE5NjMzOCwiZXhwIjoxNzkwNDU1NTM4fQ.EIZaMi-8AZ667QYwsG4aJzF7V6Ud_ge_sCSHEJ7uAEJ3c8QPiViBo0i7kW1IcmH-j8l7oVL48jfbaE1_TGNqCA`
- CPF `111.444.777-35`, nascimento `10/05/1990`.
- RG BOM: `demo-portal-rg-simulado.png` (a IA aprova). RG RUIM: `demo-portal-rg-simulado-ruim.png`
  (a IA reprova por foto/assinatura).
- Se aparecer "Muitas tentativas", e a trava de 15 min do CPF (LGPD): espere e repita.

## Como revalidar cada bug

**Bug 1, termo aceito uma vez.** Aceite o termo e comece. Depois, dentro da trilha, atualize a
pagina (F5): voce volta direto para a lista de documentos, o termo NAO reaparece.

**Bug 2, atualizar nao expulsa.** Suba um documento, depois atualize a pagina (F5). Voce NAO e
expulso ("abra o link de novo"): a trilha retoma de onde estava.

**Bug 3, reprovado pode substituir.** No RG, suba o RG RUIM. A IA reprova e a casa mostra o motivo
e um botao "Escolher um arquivo" para voce enviar OUTRO no lugar. Um documento APROVADO nao oferece
troca.

**Bug 4, a tela mostra o que a IA leu.** No RG, suba o RG BOM. A IA aprova e mostra os campos que
leu para conferir, SEM linhas vazias de auditoria. Navegue para outro documento e volte ao RG: os
campos continuam la, a tela NAO regride para "processando".

**Bug 5, a tela atualiza sozinha.** Ao subir, o resultado aparece na hora; ao voltar/atualizar, a
tela reflete o estado real (aprovado, reprovado ou recebido), sem travar em "processando" nem
sumir os dados. E o mesmo motor do bug 4.

**Bug 6, motivo claro e sem campos vazios.** Ja estava feito e foi mantido: o reprovado diz o
motivo em linguagem de candidato, e a conferencia mostra so os campos preenchiveis.

## O que ficou fora (infra e follow-up)
- **Acesso publico:** o `POST /portal/termo` (novo) precisa entrar na allowlist da barreira do
  Fernando quando o portal for ao ar, como as outras rotas `/portal/*`. Na homolog ja funciona.
- **Refresh depois de 30 min:** dentro de 30 min o refresh retoma sem pedir nada; a sessao dura 30
  min. Voce escolheu persistir o link no aparelho, que e PII-free, entao mesmo apos 30 min a
  retomada nao depende de reabrir o link do WhatsApp.
- **Snapshot do drizzle:** a migration 0126 subiu sem o `0126_snapshot.json` (nao trava nada,
  aplica pelo journal), mas o proximo `drizzle-kit generate` precisa dele. Follow-up pequeno.
