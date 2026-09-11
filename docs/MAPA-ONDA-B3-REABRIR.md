# MAPA DE ALCANCE, ONDA B3: aviso do cancelar, reabertura da vaga, ações no modal

Montado pelo coordenador ANTES de qualquer despacho (§A.39 passo 1, §A.40 regra 1).
Este arquivo vai junto em TODOS os briefings. Quem construir sem ele reinventa a investigação.

## 0. AS QUATRO PEÇAS DA OST

1. **AVISO ao cancelar com gente encerrada dentro.** O modal conta, ANTES do clique, quantos
   candidatos daquela vaga já estão com o processo encerrado. **Informa, não trava.**
2. **REABRIR a vaga cancelada.** Só Master. Lista quem estava, o Master SELECIONA quem volta, cada
   selecionado volta para a SITUAÇÃO DE ORIGEM gravada. Cancelamento antigo (sem origem) volta como
   em seleção. Status volta ao papel ABERTURA, trilha registra. Só vaga CANCELADA.
3. **Todas as ações da linha vão para dentro do modal Gestão da Vaga.** Na linha fica só o botão de
   abrir o modal.
4. **Terminar os testes do reabrir** (o `tester` reassume o fake interrompido).

## 1. MEDIÇÕES CONTRA O BANCO (feitas hoje, 11/09, `ea_automatic_homolog`)

Não são suposições. Cada uma muda uma decisão de desenho.

| # | medição | consequência |
|---|---|---|
| M1 | `as_vaga_status_eventos` tem **ZERO linhas**, e existem **2 vagas CANCELADA** (`9999001`, `1234567`). **CAUSA MEDIDA (corrigida em 11/09):** o código servido na 3120 estava ATRÁS da worktree principal e o `cancelar` dele ainda não escrevia a trilha. Ver §9. | **O PRIMEIRO REABRIR QUE O DIRETOR CLICAR SERÁ UM "ANTIGO SEM ORIGEM".** As duas vagas já canceladas não têm evento e nunca terão. O caminho novo passa a existir para todo cancelamento feito a partir de agora. Os dois caminhos precisam estar prontos na mesma entrega, e o antigo NÃO é caso de borda: é o que já está no banco. |
| M2 | A migration 0104 não estava aplicada em lugar nenhum (homolog em 103, produção em 101). **RESOLVIDO em 11/09 pelo coordenador: a homologação está em 104** e as três colunas existem. Produção segue em 101, e nada desta onda subiu para lá. | As três colunas da origem já existem na 3120. Produção continua intocada, como tem de ser até a validação. |
| M3 | Catálogo de status: `ABERTA`=papel **ABERTURA**, `CANCELADA`=papel **CANCELAMENTO**, e existe `as_vaga_status_papel_unico` (unique em papel, exceto LIVRE) | "Status volta pra ABERTA" resolve-se por **`regua.codigoDoPapel("ABERTURA")`**, NUNCA pelo literal `"ABERTA"`. O papel é único, então a resolução não é ambígua. Escrever o literal é repetir exatamente o defeito que a B2 matou. A coluna do catálogo chama-se `movivel_manualmente`, não `movivel`. |
| M4 | Nas duas vagas canceladas: `APROVADO` 1, `DESCARTADO` 2, `DESISTIU` 1. **Nenhuma tem `posicao_lado`.** | O `APROVADO` numa vaga CANCELADA é o caso de LGPD que a onda corrigiu (viva em vaga encerrada). O `DESISTIU` é o caso do diretor no DIARIO: ele não segurava o cancelamento, e por isso o sistema deixou cancelar. |
| M5 | `uq_as_candidaturas_viva`: unique em `(candidato_id, vaga_id)` **where situação não encerrada** | **Reativar alguém que já voltou à MESMA vaga por outro caminho (reentrada) estoura 23505 e derruba a transação inteira.** Tem de ser recusado com frase própria, antes do insert. |

## 2. QUEM MAIS ESCREVE O DADO (a linha fixa do briefing de backend, §A.40 regra 3)

**`vagas.status` e `vagas.encerrada_em`, escritores hoje (enumerados por `grep "update(vagas)"`, 5 pontos):**

| linha | quem | escreve encerrada_em? |
|---|---|---|
| `vagas.service.ts:742` | `create`/`atualizar` (trilha do rascunho) | não |
| `vagas.service.ts:1115` | `editarPosicoes` | não |
| `vagas.service.ts:1316` | **`fechar`** | **SIM** (`new Date()`, linha 1333) |
| `vagas.service.ts:1569` | **`cancelar`** | **SIM** (`new Date()`, linha 1603) |
| `vagas.service.ts:1763` | `moverStatus` (só status, e NÃO encerra) | não |

**`reabrir` vira o SEXTO escritor, e é o PRIMEIRO que DESFAZ um encerramento.** Nenhum outro ponto
do sistema limpa `encerrada_em`. Provar que a lista está completa é requisito, não zelo.

**Risco já registrado (DIARIO 10-11/09, §10):** a importação da base histórica (2.363 vagas) será o
sétimo escritor e não passa por nenhuma das portas que carimbam.

## 3. O RELÓGIO DA LGPD, e por que reabrir o PARA (peça 2)

`retencao-candidatos.service.ts` anonimiza candidato sem NENHUMA candidatura viva em vaga não
encerrada. A cláusula de proteção é:

```
and (s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null)
```

**Consequência para o reabrir:** devolver a vaga ao papel ABERTURA (`encerra = false`) faz a
candidatura reativada VOLTAR A PROTEGER a pessoa inteira, automaticamente. O prazo para de correr
por construção, sem nenhuma régua nova no expurgo. **Não escrever régua nova lá.**

**E `encerrada_em` TEM DE SER LIMPO na reabertura**, por duas razões:
- honestidade do dado: vaga reaberta não está encerrada, e a coluna descreve o estado ATUAL;
- o relógio usa `case when situacao in (VIVAS) then v.encerrada_em end` dentro de um `greatest`.
  Deixar o carimbo velho não apressa ninguém (o `greatest` só empurra para frente), mas mente, e
  mente de novo no dia em que a vaga for encerrada outra vez.

**Quem NÃO for selecionado continua DESCARTADO, e o relógio dele conta do `atualizado_em` dele**,
exatamente como hoje. A reabertura não pode tocar em quem não foi escolhido.

## 4. A TRILHA JÁ DEPENDE DA REABERTURA (escrito no código do `cancelar`)

O comentário do `cancelar` (linha ~1490) já diz: *"a REABERTURA limpa os carimbos de cancelamento
da linha da vaga, e limpar só deixou de apagar o fato porque o fato passou a viver AQUI"*. Ou seja,
o desenho do `cancelar` **já assumiu** que o reabrir limpa `cancelamento_motivo`,
`cancelamento_observacao`, `cancelada_por_id`, `cancelada_em` e os três campos do forçado. A cópia
do fato sobrevive em `as_vaga_status_eventos.observacao`. **Limpar é o combinado, não uma escolha
nova.** O que a reabertura acrescenta é o SEU evento na mesma trilha.

## 5. COMO SE SABE QUEM VOLTA (o ponto mais perigoso da frente)

**PROIBIDO casar por TEXTO.** O motivo da saída (`"Vaga cancelada: X"`) é digitável à mão por
qualquer consultor (`RegistrarSaidaDto` pede dois caracteres). Casar por texto ressuscitaria quem a
SELEÇÃO descartou de propósito e viraria atalho para burlar a ciência de reentrada. Está escrito na
migration 0104 e vale como régua.

**Caminho NOVO (cancelamento com evento):** o conjunto é exatamente
`as_candidatura_etapas where vaga_status_evento_id = <id do evento do cancelamento>`. Cada linha traz
`situacao_origem` e `posicao_lado_origem`. Volta EXATA.

**Caminho ANTIGO (M1, e hoje é o ÚNICO que existe em homologação):** não há evento, então **o sistema
não sabe quem saiu por causa do cancelamento**. Proposta do coordenador, a ser auditada:
- oferecer só as candidaturas **DESCARTADO** daquela vaga (é o que o cancelamento escreve);
- **não oferecer `DESISTIU`**, que é saída por vontade da própria pessoa, e ressuscitá-la é falsear
  um fato dela. É literalmente o caso do diretor no DIARIO;
- todo selecionado volta como **em seleção (`ATIVO`) sem posição**, nunca alocado, nunca aprovado.
  Inventar entrega enche o cilindro com gente que nunca foi entregue;
- a tela **diz, com todas as letras**, que aquele cancelamento é anterior ao registro de origem e que
  o sistema não sabe onde cada pessoa estava.

A trava contra ressuscitar quem não devia, neste caminho, é o **Master escolhendo um a um**, e não
uma dedução do sistema.

## 6. ALCANCE DO ITEM 3 (as ações para dentro do modal), achados que economizam uma rodada

A linha da tabela tem HOJE 5 gatilhos (`page.tsx`, célula de Ações, a partir da linha ~2960):
`fechar` (cadeado, só ABERTA), `cancelar` (x, só ABERTA), `editar posições` (users, só ABERTA),
`continuar rascunho` (pen, só RASCUNHO), `clonar` (copy, sempre), e o `Gestão Vaga` (que fica).

**ACHADO 1, EMPILHAMENTO.** Todos os modais do sistema saem do mesmo `ui/Modal`, todos em portal com
**`z-[55]` idêntico**. Em `page.tsx` o `CancelarVagaModal` é renderizado na linha ~4364 e o
`VagaPainelModal` na ~4395: **o painel é renderizado DEPOIS, então ele pinta POR CIMA**. Hoje isso
não aparece porque os dois nunca estão abertos juntos. **Com as ações dentro do painel, passam a
estar.** A ordem de renderização tem de mudar, ou a ação abre atrás do painel e o consultor clica num
modal que não vê.

**ACHADO 2, O ESCAPE FECHA OS DOIS.** `ui/Modal` registra um listener de `keydown` em `document` por
instância. Com dois modais abertos, um Escape dispara os dois `onClose`: o consultor fecha o
formulário de cancelamento e o painel junto, perdendo o contexto. §A.41 manda manter o Escape, então
a saída é a ordem de fechamento, não tirar a tecla.

**ACHADO 3 (a meia linha que evita a rodada extra, §A.40, a parte do coordenador).** A barra de ações
nasce com **SEIS** lugares, não cinco: o **"Reabrir Vaga"** da peça 2 entra nela, e só aparece na vaga
CANCELADA. Quem construir a barra para cinco vai refazê-la na rodada seguinte.

**ACHADO 4, §A.41.** O painel de gestão **não pode ficar sem saída** e os modais de ação que ele abrir
seguem a mesma régua: preenchimento sai por Cancelar/Salvar, leitura sai por Fechar.

## 7. AS ARMADILHAS JÁ PAGAS NESTA ONDA, que não podem voltar

- **Literal de status.** `"ABERTA"` escrito à mão em vez do papel do catálogo. A B2 matou isso e o
  reabrir é o primeiro código novo que pode ressuscitá-lo (M3).
- **Heurística de posição.** *"tem `posicao_lado`, logo estava alocado"* é **FALSA e medida**: existe
  candidatura `ATIVO` com `posicao_lado = OFICIAL` na base, porque `reverterEnvioParaAdmissao`
  devolve para ATIVO sem limpar o lado. Chutar por ali devolve à vaga uma ENTREGA que nunca houve.
  É por isso que a 0104 grava a origem em vez de deduzir.
- **Régua do cancelamento vs. régua do fechamento.** `seguraOCancelamento` (ATIVO e ALOCADO seguram)
  NÃO é `pendentesDeTratamento` (que considera ALOCADO tratado). Trocar uma pela outra inverte a
  decisão do diretor. Nenhuma lista nova de situação é escrita: o vocabulário é de
  `@ea/shared-types`.
- **Autoridade na rota vs. no service.** `fechar` e `cancelar` não têm `@Roles` de propósito (todo
  consultor fecha e cancela; só FORÇAR é de Master, e isso mora no service). **O `reabrir` é
  diferente: ele é Master INTEIRO, por decisão do diretor.** Mesmo assim o servidor é a autoridade, e
  a tela mostra AVISO em vez de esconder o botão (pedido explícito da OST).
- **Dono único do arquivo compartilhado.** `packages/shared-types/src/index.ts` é do COORDENADOR
  (§A.39). Nenhum agente escreve nele. Ele é arquivo único: `export *` para outro arquivo quebra um
  dos dois lados, e const nova só chega como valor depois de `pnpm build` do pacote.

## 8. REGRAS DA CASA QUE ESTA FRENTE TOCA

§A.11 (travessão proibido) · §A.12/§A.20 (tabela e largura) · §A.24 (title case em título e tag;
botão é ação) · §A.29 (ordenação) · §A.35 (Select do design system, com busca) · §A.41 (modal não
fecha ao clicar fora, e nenhum modal sem saída) · §A.6 (nenhum CPF em log, nenhuma URL persistida).

## 9. A HOMOLOGAÇÃO VIVE EM OUTRA WORKTREE, e isso quase custou uma rodada

**O código servido na 3120 NÃO é o desta pasta.** São duas worktrees do mesmo repositório:

| | produção | homologação |
|---|---|---|
| código | `/home/henrique/apps/ea-automatic` (branch `main`) | `/home/henrique/apps/ea-homolog` (branch `homolog`) |
| banco | `ea_automatic` | `ea_automatic_homolog` (clone anonimizado) |
| backend | `ea-backend`, 127.0.0.1:3011 | `ea-homolog-backend`, 127.0.0.1:3111 |
| frontend | `ea-frontend` atrás do Caddy, 0.0.0.0:3010 | `ea-homolog-frontend`, **0.0.0.0:3120** |

**Editar aqui NÃO muda a 3120.** O que aparece lá é o que foi COPIADO para a outra worktree e
construído lá.

**O que o coordenador achou e corrigiu em 11/09, antes de despachar o `backend`:** a homologação
estava **15 arquivos atrás** da worktree principal, e entre eles estava o `vagas.service.ts` **sem a
gravação da trilha no `cancelar`**. É essa a causa da M1: os dois cancelamentos que existem no banco
foram feitos pelo código VELHO, que não escrevia evento nenhum. Os 15 arquivos foram sincronizados, a
0104 foi aplicada (homolog em **104**), `shared-types` e backend reconstruídos, serviço reiniciado,
**health 200 na 3111 e 200 na 3120**.

**A rotina de publicar na homologação, e o `BACKEND_ORIGIN` não é opcional:**

```bash
# copiar os arquivos tocados de ea-automatic para ea-homolog, e então:
cd /home/henrique/apps/ea-homolog
pnpm --filter @ea/shared-types build && pnpm --filter @ea/backend build
cd apps/frontend && BACKEND_ORIGIN=http://127.0.0.1:3111 pnpm build
systemctl --user restart ea-homolog-backend ea-homolog-frontend
```

**Buildar o frontend da homologação SEM `BACKEND_ORIGIN` aponta a 3120 para o backend de PRODUÇÃO**,
e ela passa a ler e escrever na base real sem nenhum aviso. O rewrite `/api` do Next é resolvido em
BUILD TIME. O sintoma, quando acontece, é 403 "Origin não permitida".

**E NUNCA rodar `next dev` ou `next build` em `/home/henrique/apps/ea-automatic/apps/frontend`** com o
serviço de produção no ar: clobbera o `.next` e a produção passa a servir 500.
