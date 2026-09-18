# MAPA DE ALCANCE, INTEGRACAO DIGAI

Levantado pelo coordenador antes do primeiro despacho (secao A.39 passo 1, secao A.40 regra 1).
Vai junto em TODO briefing. O agente nasce sem o contexto do coordenador: este documento e o
contexto.

## O QUE JA EXISTE, E MUDA O ESCOPO

Medido na varredura de 16/09/2026 (86/86 workspaces, 301 screenings, 13.248 registros unicos, 451
chamadas, zero falhas) e na leitura do codigo em 17/09.

| Item da OST | Estado real | Consequencia |
|---|---|---|
| Campo de ORIGEM | `as_candidatos.origem` JA EXISTE, enum `PANDAPE/MANUAL/INDICACAO/BANCO_TALENTOS`, com indice | E APPEND do valor `DIGAI` ao enum, nao campo novo |
| Etapas do funil | `as_etapas_funil` JA E CATALOGO do diretor (migration 0100), com codigo imutavel, rotulo editavel, ordem, tom, `inicial` unica e `ativa` | Etapa nova e LINHA no catalogo, nunca valor de enum |
| Reengajar | O link de triagem (`webAccessLink`/`whatsappAccessLink`) e FIXO POR VAGA | Reengajar e REENVIAR o link do NOSSO lado. NAO precisa escrever no Digai |
| Elo com a vaga | `partnerJobId` e `numerico[7]` em 12.686 de 13.248, mesmo formato de `vagas.id_vacancy_pandape` | HIPOTESE a PROVAR contra a base, nunca a assumir |
| Acoes em massa | `AcoesEmMassaDaVaga.tsx` + rotas `candidaturas/lote/*` ja existem e tem teste | REUSAR, nao criar segundo padrao |
| Grade de acesso | `/home/henrique/digai-investigacao/grade_digai.py`, Bearer GET-only, autoteste de 26 bloqueios e 11 leituras | O desenho da grade ja foi auditado. A grade de producao e a versao TypeScript dele |

## O QUE A VARREDURA JA DECIDIU, E NAO SE REABRE

- **`partnerUserId` e ZERO em 13.248 registros e em ZERO workspaces.** Nao ha marcador de origem no
  Digai. A origem e NOSSA: a plataforma sabe de onde puxou. Nao se pergunta ao Digai, nao se escreve
  la.
- **O CPF ATUALIZA NO MESMO REGISTRO.** `userId` e chave estavel, a reconsulta por `userId`
  funciona. Sem CPF = nao finalizou; com CPF = finalizou. 12% tem CPF (1.656 de 13.248).
- **Usar a v2.** A v1 nao tem `cpf`, `partnerUserId`, `stages` nem `appliedAt`.
- **Host: `api-screening.digai.ai`.** `api.hiring.digai.ai` da doc tem certificado invalido (cert
  `CN=digai.ai`, SAN `*.digai.ai`, wildcard cobre UM rotulo). Mesmos IPs, mesmo cert, mesmo
  balanceador. Desativar verificacao de TLS esta VETADO.
- **Paginacao por `page`**, confirmada em 44 screenings.
- **Webhook NAO confirmado.** O caminho hoje e POLLING. "Existe evento de candidato finalizou?" e
  pergunta ao Ivan.
- **Endpoints por e-mail, telefone e partner-user-id estao BARRADOS** na grade: poriam PII na URL, e
  o 401 do Digai ECOA o path.

## O QUE DEPENDE DO DIRETOR, E BLOQUEIA SO A EXECUCAO

- **O TOKEN BEARER FOI EXPURGADO** (`shred`, 16/09) e nao esta no `.env` do backend. Todo o codigo
  se constroi sem ele, e a rota nasce FECHADA E INERTE sem credencial (mesmo padrao do Pandape,
  secao A.5). **A leitura da producao do Digai nao roda ate o token voltar.**
- **Deduplicacao Digai x Pandape: SEGURADA por ordem do diretor**, aguardando o Ivan confirmar se o
  `userId` e o mesmo entre vagas e qual a chave de casamento. O ponto fica PREPARADO, nao
  construido.

## QUEM DEPENDE DO QUE VAI SER MEXIDO (a pergunta da secao A.27)

**`as_candidatos.origem`** (append do valor `DIGAI` ao enum):
- Le: a Central de Candidatos (`as/candidatos`), o filtro de origem da tela, o indice
  `idx_as_candidatos_origem`.
- **Enum do Postgres e APPEND-ONLY, e valor novo nao pode ser usado na transacao em que nasce.** A
  migration do valor e SEPARADA de qualquer migration que o utilize.
- Todo lugar que faz `switch` por origem ganha o caso novo. Quem varrer tem de PROVAR a lista
  completa, nao estimar.

**`as_etapas_funil`** (etapas de triagem novas):
- Le: o funil da vaga (`VagaPainelModal`), o seletor de etapa, o filtro, o historico
  (`as_candidatura_etapas`), a rota de lote `candidaturas/lote/etapa`.
- **`inicial` e UNICA por indice parcial.** Etapa nova NAO pode nascer marcada inicial sem
  desmarcar a atual, e isso muda onde TODA candidatura nova nasce, inclusive as do Pandape e as
  manuais. Mexer em `inicial` esta FORA desta frente.
- FK RESTRICT nas tres colunas: etapa por onde alguem passou nao se apaga, so se inativa.

**`as_candidaturas`** (candidatos do Digai entrando no funil):
- **UNIQUE PARCIAL `(candidato_id, vaga_id)` sobre as situacoes VIVAS.** Importacao que reprocessa
  o mesmo par bate no unique. A idempotencia tem de ser explicita, nao acidental.
- A OCUPACAO da vaga e DERIVADA contando `APROVADO` + `ENVIADO_PARA_ADMISSAO`. Candidato de triagem
  entrando com situacao errada MEXE NA CONTAGEM DE POSICOES da vaga, que e o numero que decide se
  ainda cabe alguem. **Candidato de triagem nasce em situacao que NAO consome posicao.**

**A tela da vaga (`VagaPainelModal`)**: e codigo JA VALIDADO pelo diretor. Vale a secao A.26: o que
for tocado nela se pergunta antes.

## O QUE PODE QUEBRAR DE LADO

1. **Contagem de posicoes da vaga**, se a situacao de nascimento consumir posicao (acima).
2. **Filtro de origem da Central de Candidatos**, se o valor novo do enum nao entrar no catalogo do
   filtro: a tela oferece e a consulta ignora, que e pior que filtro nenhum (secao A.28).
3. **O expurgo por retencao** (`retencao-candidatos.service.ts`): candidato do Digai e candidato de
   selecao que pode nunca virar funcionario. Ele entra na mesma regra de retencao, e isso precisa
   ser conferido, nao presumido.
4. **A migration de enum em transacao unica**, pelo motivo do Postgres acima.
5. **O teto de requisicao do Digai**, se a importacao varrer sem limitador.

## A REGRA QUE VALE PARA TUDO NESTA FRENTE

`docs/PROTOCOLO-LGPD-FABRICA.md`. Producao de terceiro, CPF real. Zero PII em log, em pulso e em
commit. A grade e obrigatoria e fail-closed. O reengajar, por reenviar link do nosso lado, NAO abre
caminho de escrita no Digai, e essa e a razao de ele ser o caminho escolhido (protocolo, secao 6,
regra zero).
