# Demo da vaga A&S (homologação 3120): passo a passo

Roteiro para o diretor demonstrar o fluxo vivo da esteira de vagas, da liberação ao envio para
admissão. Ambiente: **homologação, http://10.18.117.235:3120**. Produção não é tocada.

## O que já está montado na homologação

- **1 vaga** em `PENDENTE_REVISAO`: `SIM-2026-0501`, "Auxiliar Administrativo de Farmácia (Loja
  Corifeu)", cliente 26360, 3 posições.
- **4 candidatos** com nome de pessoa realista e CPF sintético (faixa 999, sem PII real):
  - **Vinculados** (já no funil, etapa Triagem): **Camila Ferreira dos Santos**, **Bruno Carvalho Oliveira**.
  - **Soltos** (para vincular ao vivo): **Larissa Moraes Pereira**, **Diego Ramos Teixeira**.

Todo o fluxo abaixo foi rodado fim a fim contra a base da homologação e **não trava** em nenhum passo.
Depois da prova, a base foi devolvida ao estado inicial (a vaga voltou para a fila de revisão).

## Passo a passo

1. **Liberar Vaga.** Menu lateral "Liberar Vaga" (a fila de revisão). A vaga `SIM-2026-0501` aparece
   na lista. Os obrigatórios já estão preenchidos, então a liberação sai com um clique, sem
   formulário: a demo começa pelo gesto de liberar, não pelo cadastro.
2. **Vaga abre.** Ao liberar, a vaga passa para "Aberta" e sai da fila de revisão.
3. **Central De Vagas, o funil.** Menu "Central De Vagas", abra a vaga aberta. O funil já mostra os
   dois vinculados, **Camila** e **Bruno**, na coluna **Triagem**.
4. **Vincular os soltos ao vivo.** Traga **Larissa** e **Diego** (candidatos soltos) para a vaga. Eles
   entram no funil junto dos outros.
5. **Mover pelas etapas.** Mova um candidato de **Triagem** para **Entrevista Soulan** e adiante, até
   **Aprovação**. Cada movimento é imediato e independente dos demais.
6. **Aprovar e enviar para admissão.** Aprove um candidato (a aprovação consome uma posição da vaga) e
   use "enviar para admissão". A ponte cria a admissão na esteira, que nasce em
   **Aguardando Liberação**: é o ponto em que a frente de vagas entrega para a frente de admissão.
7. **Conferir na esteira.** A admissão criada aparece na tela de liberação de admissões, pronta para o
   time completar os dados e liberar. As frentes de auditoria e exame nascem nesse momento da
   liberação.

## Se precisar reiniciar a demo

Os dois roteiros são idempotentes e travados por nome de banco (só homologação, produção é recusada).
Da raiz do repositório, com `DATABASE_URL` da homologação:

```
apps/backend/node_modules/.bin/tsx --tsconfig apps/backend/tsconfig.json \
  apps/backend/src/as/ingestao-pandape/arnes-limpeza-homolog.ts    # limpa a esteira A&S (faz backup antes)
apps/backend/node_modules/.bin/tsx --tsconfig apps/backend/tsconfig.json \
  apps/backend/src/as/ingestao-pandape/arnes-seed-demo-uma-vaga.ts # recria a vaga e os 4 candidatos
```

Isso devolve a vaga para `PENDENTE_REVISAO` e os 4 candidatos (2 vinculados, 2 soltos), o ponto de
partida do roteiro.
