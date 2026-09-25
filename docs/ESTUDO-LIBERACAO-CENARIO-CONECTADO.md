# Estudo Da Liberação Admissional No Cenário Conectado

Segunda rodada, somente leitura. Nada foi alterado no código nem no banco. Contraponto de
`docs/ESTUDO-LIBERACAO-E-SALA-DE-ESPERA.md`, que continua valendo para o cenário de HOJE e não foi
tocado.

Pergunta desta rodada: quando o candidato já estiver DENTRO da plataforma desde o processo seletivo
e não vier mais pelo Pandapé, a Liberação Admissional ainda é necessária.

Medições no banco de produção (`ea_automatic`, container `ea-db`), somente `select`, em 21/09/2026.
Nenhum dado pessoal extraído: só contagens, estados e rótulos (§A.6).

**O cenário conectado NÃO EXISTE em código.** A ponte A&S para Esteira é frente separada e não foi
construída: `as_candidaturas.admissao_id` existe e ninguém a escreve. Este documento lista o que
PRECISARIA ser verdade, e o valor dele está na precisão dessa lista.

---

## 0. O Achado Que Muda A Pergunta

**Nascer direto nas frentes, sem passar pela Liberação, JÁ É UM CAMINHO DE CÓDIGO VIVO.**

Em `apps/backend/src/pandape/pandape-sync.service.ts:539-575` existe uma bifurcação:

- `resolverClienteCargo(idVacancy)` resolve (linha 539): chama `admissoes.create` (linha 568) com
  `origem: "PANDAPE"` e `bypassAceite: true`, e a admissão nasce **direta em `EM_ADMISSAO`**, com
  régua, frentes AUDITORIA e EXAME e documentos, seguida do pull de documentos (linha 574).
- não resolve (linha 555): chama `criarPreAdmissao`, que é a **pré-admissão** em
  `AGUARDANDO_LIBERACAO`, sem cliente, sem cargo, sem régua, sem frentes, sem documentos.

Ou seja: **a Liberação não é o portão do desenho, é o FALLBACK de um de/para que não resolve.**

**Medido: o caminho direto NUNCA disparou em produção.** Das 540 admissões de origem PANDAPE, 516
têm `consultor_id` (carimbo exclusivo de `aplicarLiberacao`) e as outras 24 são exatamente as que
ainda estão nos dois faróis da Liberação. **Zero** nasceram pelo `create`.

| Medição | Valor |
|---|---|
| Admissões PANDAPE no total | 540 |
| Passaram pela Liberação | 516 |
| Em `AGUARDANDO_LIBERACAO` | 9 (todas PANDAPE) |
| Em `LIBERACAO_RECUSADA` | 15 (todas PANDAPE) |
| Nascidas pelo caminho direto | **0** |

O cenário conectado **não precisa inventar** um jeito de o candidato nascer nas frentes. Precisa
**alimentar com dado bom** uma porta que já existe e hoje fica fechada por falta de de/para. A vaga
do A&S é esse dado bom: ela tem `cod_cliente`, `cargo_id` e `id_vacancy_pandape`.

---

## 1. A Liberação Ainda É Necessária?

**Como PORTÃO, não.** Como porta de exceção e como recusa, sim.

O que a torna desnecessária:
1. A decisão central dela é "de quem é este candidato" (cliente e cargo), e o funil já responde.
2. O nascimento completo já tem código pronto e compartilhado (`admissoes.create`): régua, frentes,
   documentos, dados da folha, pacote de benefícios e vínculo de Alto Volume.
3. O gancho do Portal já está plantado no A&S e nasce inerte: o ramo de `ENVIADO_PARA_ADMISSAO` de
   `registrarSaida` chama o envio, que hoje devolve `SEM_ADMISSAO` porque `admissao_id` é nula.
   **Escrever aquela coluna liga o envio do link sozinho.**

O que ela passa a ser, e é decisão de produto:
- **Porta de exceção**, enquanto qualquer entrada chegar sem par (cliente + cargo) resolvido.
- **A recusa com trilha**, gesto de Master, reversível, que o funil não tem (o descarte da
  candidatura é outro gesto, em outro momento, por outro papel).

---

## 2. O Que A Liberação Ainda Faria, Decisão Por Decisão

| Decisão de hoje | O funil tem? | No cenário conectado |
|---|---|---|
| Cliente | **Sim** | Resolve sozinho |
| Cargo | **Sim** | Resolve sozinho |
| Salário | **Sim** | Resolve, com a escolha de qual campo (produto) |
| Pacote de benefícios | **Sim** | Espelho exato, copia 1 para 1 |
| Centro de custo | **Sim** | Resolve |
| Motivo (e substituído) | **Sim** | Resolve. Atenção ao TTL de 48h do CPF do substituído |
| Tempo de contrato | **Sim** | Resolve |
| Escala | **Parcial** (texto livre) | Precisa de de/para ou vira pendência |
| Endereço / local | **Parcial** (texto) | Resolve como texto |
| Tipo de contrato | **Parcial** | `EFETIVO` e `PJ` não têm par. Precisa de de/para |
| **Data de admissão** | **Não** | Alguém informa. 512 de 516 receberam na liberação |
| **Setor** e **Departamento** | **Não** | Alguém informa. Setor é pendência obrigatória |
| **Gestor BP** | **Não** | Alguém informa. Pendência obrigatória |
| **Uniforme** | **Não** | Hoje é trava dura para liberar. 385 de 516 responderam |
| **EPI** | **Não** | Alguém informa. Não trava |
| **Loja** | **Não** | Só 33 de 516 têm loja |
| **Vínculo do cliente** | **Não** | Ver o furo do item 3.3 |
| **Sexo** | **Não** (`as_candidatos` não tem a coluna) | Sem ele, o Reservista da régua nasce errado |
| **Aceite de CPF duplicado** | **Não** | Existe só no `liberar`. Ver 3.4 |
| **Projeto de Alto Volume** | **Não** | Dos 197 vínculos, só 37 nasceram pela liberação e 160 à mão |
| **Observação livre** | **Não** | Some sem consequência |
| **Recusar / Reativar** | **Não** | **Não tem equivalente** |
| **Liberação em lote** | **Não** | Some. Nascendo uma a uma, não há leva |

**Das 24 decisões, o funil resolve 9 de graça, 3 com de/para, e 11 passam a precisar de alguém que
informe** (ou de virar pendência obrigatória, §A.19, o que é legítimo pela regra 5 do §A.3). A
recusa não tem substituto.

---

## 3. O Que Precisa Acontecer No Envio Para Admissão

### 3.1 O CPF é condição dura
`as_candidatos.cpf` é **nulável**; `admissoes.candidato_cpf` é a chave e `create` rejeita na
primeira linha. **Candidatura sem CPF não vira admissão.** O envio precisa passar a exigir CPF
válido, com mensagem própria, ou o gesto falha no meio.

### 3.2 O carimbo do `id_vacancy` impede a admissão em dobro
Na convivência, a mesma pessoa pode ser enviada pelo A&S e movida para "Contratados" no Pandapé. A
defesa existe (`uq_admissao_cpf_vaga_viva`, unique parcial em CPF + `id_vacancy`, **só quando
`id_vacancy` não é nulo**), e o sync adota o evento na admissão existente em vez de criar. **Sem o
carimbo, o unique não se aplica e nasce uma segunda admissão.** Hoje `create` só aceita `idVacancy`
dentro de `opts.pandape`, que exige `idPrecollaborator`: o contrato precisa mudar, e é mudança em
código validado (§A.26).

### 3.3 O furo do vínculo, dormente e real
`aplicarLiberacao` lê a régua por vínculo; **`create` NÃO faz isso** e nunca escreve
`cliente_vinculo_id`. As duas portas de nascimento divergem. Medido, está dormente (nenhum cliente
com 2 vínculos, 0 régua por vínculo), mas uma ponte que use `create` herda o furo no dia em que o
primeiro cliente ganhar o segundo contrato.

### 3.4 O aceite de CPF duplicado não existe no `create`
`travarDuplicidadeDeCpf` só protege a liberação individual. A ponte, usando `create`, cria a segunda
admissão viva do mesmo CPF **sem perguntar nada**. É ponto de auditoria (§A.38).

### 3.5 O farol deixa de ser escrito, e nada quebra
`create` nasce em `EM_ADMISSAO`; só `criarPreAdmissao` escreve `AGUARDANDO_LIBERACAO`. As
superfícies que excluem o farol são `notInArray` sobre um conjunto que passa a não ter linha nova, e
**exclusão de conjunto vazio é no-op**. O que elas exigem é que as **24 admissões que JÁ estão nos
dois faróis tenham destino**: enquanto existir uma linha, o código que as exclui e a tela que as
consome têm de continuar de pé, senão são 24 pessoas abandonadas no escuro. **Esse ponto do estudo
anterior sobrevive inteiro.**

Nota de enum: os dois valores são de `farol_global` no Postgres, e `ALTER TYPE ... DROP VALUE` não
existe. Removê-los é migração de recriação de tipo, não item de limpeza.

### 3.6 A assimetria do envio do Portal
O caminho MANUAL exclui os faróis da Liberação; o caminho AUTOMÁTICO **não filtra farol nenhum**. Se
a ponte escrevesse `admissao_id` apontando para uma pré-admissão, o sistema emitiria credencial de
Portal para uma admissão **sem régua e sem documentos**, e o candidato abriria um prontuário vazio.
A ponte deve escrever `admissao_id` apenas de admissão nascida completa.

---

## 4. A Sala De Espera No Cenário Conectado

**O veredito "PODE SAIR EM PARTE" se mantém, e a parte que fica DIMINUI.**

Melhora, por dois motivos medidos:
1. **O match morre por construção.** A consulta de "admissões para vincular" é literalmente
   `farol = AGUARDANDO_LIBERACAO`. Sem produtor, a lista fica permanentemente vazia.
2. **A objeção do "sem CPF" CAI.** O estudo anterior listava "a Sala aceita registro sem CPF, o A&S
   precisa aceitar". **Ele já aceita**: `as_candidatos.cpf` é nulável, com unique parcial.

Não muda, e continua sendo o que segura: os **quatro pontos de leitura do painel da Diretoria**, as
**133 linhas de histórico** (86 com ponteiro para admissão) e o **catálogo de status**, editado pelo
diretor por tela própria.

**Piora em nada.** A lista do que fica passou de quatro itens para três.

---

## 5. A Transição: Convivência Ou Corte Seco

**O código permite convivência hoje, sem alteração nenhuma, porque a fila da Liberação é definida
por FAROL, não por origem.** Admissão nascida pela ponte nunca entra na tela, porque nasce em
`EM_ADMISSAO`. **Não existe corte a dar: a fila esvazia sozinha quando o produtor parar.** Medido:
24 de 24 nos dois faróis são PANDAPE, e nenhuma admissão manual jamais entrou neles.

| Chave | Serve para separar as populações? |
|---|---|
| `admissoes.origem` (MANUAL 2.387 / PANDAPE 540) | **Parcialmente.** A admissão vinda do A&S se confundiria com a do wizard |
| `integracao_pandape` (536 linhas) | Boa para "veio do ATS", não para "veio do funil" |
| `admissoes.id_vacancy` | A ponte vai passar a preencher também, então deixa de discriminar |
| **`as_candidaturas.admissao_id`** | **É a chave definitiva.** Não exige tocar em enum nem migrar dado |

**O risco real da convivência não é a tela, é a admissão em dobro** (item 3.2). É o único ponto onde
o corte importa.

---

## 6. Onde O Estudo Anterior Muda E Onde Se Mantém

| Afirmação do estudo anterior | No cenário conectado |
|---|---|
| "É o único código que tira a admissão de `AGUARDANDO_LIBERACAO`" | **Mantém-se.** Verdade de código |
| "Tirar a tela cria fila que ninguém consome e ninguém vê" | **CAI, condicionalmente.** A fila é produzida pelo `pandape-sync`, não pela tela. **A condição é dura: só cai quando o produtor calar de fato.** Com o webhook ligado e o de/para sem resolver, o argumento continua inteiro |
| "É o único lugar onde nascem régua, frentes e documentos" | **Muda de dono.** O nascimento é do `create`, já chamado pelo próprio sync quando o de/para resolve |
| "Concentra decisões que o funil não tem" | **Mantém-se, com número:** 11 das 24 |
| "Zerar as duas filas antes de desligar" | **Mantém-se inteiro.** 24 linhas, e o enum não tem `DROP VALUE` |
| "A recusa merece sobreviver" | **Mantém-se e fica mais forte:** 20 recusas, 5 reativações, sem equivalente no funil |
| Sala: "sai em parte" | **Mantém-se, com uma objeção a menos** |

---

## 7. Decisão De Produto x Consequência Técnica

**Decisões do diretor, que nenhuma medição responde:**
1. Se quer uma **conferência humana antes das frentes**. Tecnicamente não é necessária;
   operacionalmente é hoje o lugar onde entram uniforme e data de admissão.
2. Se os 11 campos sem origem no funil **viram pendência obrigatória** (§A.19) ou **passam a ser
   exigidos no envio** (travando o gesto, como o uniforme trava a liberação hoje).
3. Se a **recusa com trilha** migra para o funil, vira tela própria, ou fica onde está.
4. Se o **badge insistente da Liberação** (polling de 90s para todo autenticado) continua existindo
   quando a fila for permanentemente zero.
5. Quem enxerga o que, menu a menu (§A.23). Hoje: `liberacao` 17 usuários, `sala-espera` 13,
   `sala-espera-status` 4.

**Consequências técnicas, medidas, que acontecem sem ninguém decidir:**
1. Parar de produzir pré-admissão **não quebra** nenhuma superfície: exclusão de conjunto vazio é no-op.
2. O **match da Sala morre sozinho**.
3. O **link do Portal liga sozinho** quando `as_candidaturas.admissao_id` for escrita.
4. Sem carimbo de `id_vacancy`, **nasce admissão em dobro** na convivência.
5. Sem CPF, **a ponte falha**.
6. Usando `create` como está, a **régua por vínculo** não é respeitada e o **aceite de CPF
   duplicado** não acontece.

---

## 8. O Estado Real De Produção, Que Dimensiona Tudo Isto

| Tabela | Linhas em produção |
|---|---|
| `vagas` | **0** |
| `as_candidatos` | **0** |
| `as_candidaturas` | **0** |
| `vaga_beneficio` | **0** |
| `as_etapas_funil` | 6 (catálogo semeado) |
| `portal_links` e demais `portal_*` | **as tabelas não existem** |
| `admissoes` | 2.927 |
| `sala_espera` | 133 |
| `regua_documental` | 7.166 linhas, 553 pares, 0 por vínculo |
| `cliente_vinculos` | 243, nenhum cliente com mais de um |

**O cenário conectado não está a uma ponte de distância: está a uma migração do Portal, a uma carga
do funil e à ponte.** Enquanto isso, 100% da entrada automática da esteira depende da Liberação.

---

## 9. Nota De Segurança (§A.6 / §A.38)

A construção desta ponte **exige a frente de segurança antes do deploy**:
- **CPF**: a ponte cria admissão a partir de CPF do funil, sem o `travarDuplicidadeDeCpf` que a
  liberação tem. Duas admissões vivas do mesmo CPF passariam caladas.
- **Credencial**: escrever `as_candidaturas.admissao_id` **liga a emissão de link do Portal**, e o
  caminho automático não filtra farol (item 3.6).
- **Dado pessoal**: `substituido_cpf` tem TTL de 48h do lado da admissão e a vaga do A&S guarda o
  mesmo dado com outro ciclo de vida. Copiar de um para o outro é movimentação de PII entre
  políticas de retenção diferentes.
- **RBAC**: a recusa é de Master hoje. Qualquer substituto herda o papel, e menu é decisão do
  diretor (§A.23).

## 10. Observação De Método

Este documento é parecer. Nada foi construído, nada foi alterado, e as consultas ao banco de
produção foram exclusivamente `select`. `as/ingestao` não foi tocado, conforme a fronteira declarada
pelo diretor nesta sessão.
