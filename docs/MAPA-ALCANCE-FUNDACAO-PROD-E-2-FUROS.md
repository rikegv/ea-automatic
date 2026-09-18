# MAPA DE ALCANCE: subir a fundação para produção + fechar os 2 furos de LGPD

Levantado pelo coordenador (§A.39 passo 1, §A.27) ANTES de qualquer despacho. Este documento é o
briefing comum das duas frentes. §A.11: sem travessão.

---

## PARTE 1, A FUNDAÇÃO EM PRODUÇÃO

### Estado medido agora (18/09/2026)

| Medida | Produção | Homologação |
|---|---|---|
| migrations aplicadas | **109** | **112** |
| tabelas em `public` | 77 | (76 na medição de 17/09) |

Produção roda em `ea-db` (container Docker, `127.0.0.1:5433`), database `ea_automatic`.
Homologação é o database `ea_automatic_homolog` no MESMO container.

### As quatro migrations que faltam

- **0109** cria `as_identidades_externas` (6 colunas mais o id, FK CASCADE para `as_candidatos`,
  unique `(fonte, identificador)`, CHECK de fonte em PANDAPE/DIGAI).
- **0110** insere as 5 etapas do funil, marca CAPTACAO como inicial se não houver inicial, cria
  `as_depara_etapa_externa` e semeia 5 pastas do Pandapé.
- **0111** acrescenta `motivo_padrao` ao de/para, insere a etapa STAND_BY e semeia mais 5 pastas,
  com os dois descartes separados por motivo.
- **0112** é a mais invasiva: derruba e recria o tipo `as_candidato_origem` sem BANCO_TALENTOS,
  acrescenta a coluna `banco_talentos`, cria `as_retencao_eventos` e DERRUBA duas colunas
  (`as_candidatos.id_candidate_pandape` e `as_candidaturas.id_match_pandape`).

### As três guardas escritas à mão, e a medição de produção contra cada uma

As guardas abortam a transação com `RAISE EXCEPTION` se acharem linha onde a medição encontrou zero.
Medido em produção agora:

| Guarda | Exige | Produção |
|---|---|---|
| `as_candidatos.origem = 'BANCO_TALENTOS'` | 0 | **0** |
| `as_candidatos.id_candidate_pandape is not null` | 0 | **0** |
| `as_candidaturas.id_match_pandape is not null` | 0 | **0** |

**Por que dão zero: o A&S de produção está VAZIO.** `as_candidatos` 0, `as_candidaturas` 0,
`as_etapas_funil` 0, `vagas` 0. A limpeza de 17/09 já rodou lá. As três guardas passam por
ausência de dado, não por acaso, e as semeaduras das 0110/0111 nascem em tabela vazia.

### §A.27: o que NÃO pode mudar, e a linha de base

Nenhuma das quatro migrations toca tabela de fora do A&S. A prova é por contagem antes e depois:

| Tabela | Antes |
|---|---|
| `admissoes` | 2.902 |
| `candidatos` (admissional, tabela DIFERENTE de `as_candidatos`) | 2.857 |
| `frentes_admissao` | 8.127 |
| `documentos_admissao` | 22.598 |
| `clientes` | 250 |
| `usuarios` | 38 |
| tabelas em `public` | 77, esperado 80 depois (as três novas) |

### A ordem obrigatória

1. **Ensaio no CLONE**, nunca direto. Clone do database de produção dentro do mesmo container.
2. **Dump de produção** antes de qualquer escrita, fora do repositório, pasta 700 e arquivo 600.
3. **Migrar** com o `DATABASE_URL` de produção.
4. **Build e restart** do backend, com a janela do frontend só se o frontend mudar.
5. **Conferir o COMPILADO, não a fonte.** Erro recorrente: validar `src/` e publicar `dist/` velho.

---

## PARTE 2, OS DOIS FUROS DE LGPD

### Quem escreve dado pessoal de candidato A&S, lista COMPLETA e provada

`grep` por escrita em `as_candidatos` em todo `apps/backend/src`, fora de teste e de fake:

1. `candidatos.service.ts:224` `criar` (INSERT)
2. `candidatos.service.ts:282` `editar` (UPDATE) **<- FURO 2**
3. `candidatos.service.ts:386` retenção (escreve só `banco_talentos`, não é PII)
4. `retencao-candidatos.service.ts:181` o expurgo (UPDATE que anonimiza) **<- FURO 1**

**Não há quinta porta.** A INGESTÃO será a quinta, e é exatamente por isso que os dois furos se
fecham ANTES dela.

### FURO 1: quem entra sem vaga nunca expira

**Onde:** `retencao-candidatos.service.ts`, a cláusula
`and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)`.

**O defeito:** ela exige processo encerrado para haver prazo. Candidato que entra e não casa com
vaga nenhuma nunca satisfaz a cláusula, então o prazo NUNCA começa a correr e o CPF, o e-mail, o
telefone e a data de nascimento ficam retidos para sempre. Hoje é teórico porque a base está vazia;
deixa de ser no primeiro registro da ingestão.

**A forma proposta, e ela é mínima:** apagar a cláusula do `exists` e fazer o relógio cair para as
datas do próprio candidato quando não houver candidatura. O `max` sobre candidaturas devolve NULL
para quem não tem nenhuma, então um `coalesce` resolve as duas populações numa expressão só:

```
coalesce( <o max atual sobre as_candidaturas>, greatest(c.criado_em, c.atualizado_em) )
  <= now() - interval '2 years'
```

**Por que `greatest(criado_em, atualizado_em)` e não só `criado_em`:** é a mesma régua do "último
movimento" que o arquivo já usa para quem tem candidatura, e a direção é a mesma do `greatest` que
já está lá, só empurra a data para frente. Ninguém fica elegível mais cedo.

**O que NÃO pode mudar, e é o risco desta edição:**
- a proteção de `banco_talentos = false` continua intacta, e o sentido dela é medido, não lido;
- quem TEM candidatura continua com o relógio EXATAMENTE de hoje, o `coalesce` não altera esse ramo;
- a proteção por candidatura viva em vaga não encerrada continua inteira;
- as duas CTEs de apagar identidade externa continuam alcançando alvo e já anonimizados.

### FURO 2: editar regrava dado em quem já foi anonimizado

**Onde:** `candidatos.service.ts`, `editar`, linhas 266 a 313.

**O defeito:** `editar` lê a linha, monta o `set` com CPF, e-mail, telefone e data de nascimento e
grava por `where eq(id)`, sem olhar `anonimizado_em`. Uma edição depois do expurgo RE-IDENTIFICA a
pessoa, e nada falha.

**A forma proposta, em duas camadas, que é o padrão que o próprio arquivo já usa:**
1. a **cláusula no `where`**, `and anonimizado_em is null`, que é a que vale contra a corrida porque
   o banco a avalia no instante da escrita;
2. a **recusa explícita**, porque a cláusula sozinha atualizaria ZERO linhas em silêncio e o
   `ficha(id)` devolveria a ficha velha: o consultor veria a tela salvar e nada mudar. Então a
   edição de registro anonimizado é RECUSADA com mensagem, e a contagem de linhas afetadas é o que
   decide, não a leitura de antes.

**Fora de escopo, e é PROPOSTA, não construção (§A.31):** marcar `banco_talentos` em alguém já
anonimizado não é reescrita de PII e fica como está. Se o diretor quiser fechar isso também, é uma
linha a mais, e ela não entra sem o aval dele.

### A prova exigida (§A.38), contra banco, não contra teste

1. candidato SEM candidatura nenhuma, com as datas recuadas além do prazo, passa a ser anonimizado
   na varredura;
2. candidato de banco SEM candidatura continua NÃO sendo anonimizado;
3. candidato COM candidatura viva em vaga aberta continua NÃO sendo anonimizado;
4. `editar` sobre registro anonimizado NÃO re-identifica, medido lendo a linha depois da tentativa.

---

# RESOLUÇÃO DOS VETOS DO `seguranca` (consolidada pelo coordenador, §A.39 passo 4)

O `seguranca` auditou este mapa ANTES de existir código e VETOU dois dos cinco pontos. Conferi cada
achado contra o arquivo, e não carimbei nenhum. O resultado por achado:

## VETO A, o relógio de fallback entrega a retenção a um sistema externo: **RECUSADO, com evidência**

O argumento é que `atualizado_em` tocado pela ingestão faria alguém sem candidatura nunca expirar.

**A propriedade já existe no relógio APROVADO, e a auditoria anterior a aceitou.** O ramo de quem
TEM candidatura conta de `k.atualizado_em` (`retencao-candidatos.service.ts:287`), que uma ingestão
tocaria exatamente do mesmo jeito. A forma proposta não introduz assimetria nova: ela estende ao
ramo sem candidatura a MESMA régua de "último movimento" que já vale no ramo com candidatura.

**O que eu ACEITO do achado, e é a parte que vale:** ele aponta para a INGESTÃO, não para esta
edição. Vira **trava escrita no briefing da ingestão**: o upsert de reentrega que não muda nada NÃO
escreve `as_candidatos.atualizado_em`. Fica registrado aqui para a frente seguinte, que é o lugar
onde a regra pode ser testada contra código que exista.

## VETO B, `criado_em` histórico apressa expurgo irreversível: **ACEITO EM PARTE**

A parte correta: acelerar expurgo é irreversível, e o ramo novo é o único que pode acelerar.

A parte que a medição corrige: **acelerar exige recuar as DUAS datas, não uma.** `greatest` toma o
MAIOR dos dois carimbos, e `atualizado_em` tem `default now()` no insert
(`db/schema/tables.ts:66`, sem `$onUpdate`). Uma carga que recue só `criado_em` deixa
`atualizado_em` em `now()`, e o `greatest` devolve hoje: ninguém é apressado. O `greatest` já É a
defesa que o achado pede.

**O que passa a ser obrigatório:** essa defesa deixa de ser argumento e vira TESTE. Linha com
`criado_em` antigo e `atualizado_em` recente NÃO pode ser anonimizada, e o teste tem de falhar se
alguém trocar o `greatest` por `criado_em`.

O resíduo (uma carga que recue as duas datas) vira a segunda linha da mesma trava da ingestão.

## VETO C, a recusa protege o futuro e não repara o passado: **ACEITO INTEIRO**

Achado real e o mais importante dos três. Uma linha re-identificada por `editar` fica com
`anonimizado_em` preenchido E com PII de volta, e a varredura NUNCA mais volta nela
(`retencao-candidatos.service.ts:189`). A cicatrização que já existe (`ja_anonimizados`,
`:302-313`) apaga a identidade externa e **não re-nula os quatro campos pessoais**.

**Entra no escopo:** a varredura passa a re-nular `cpf`, `email`, `telefone` e `data_nascimento`
de toda linha com `anonimizado_em is not null`, no molde exato do `ja_anonimizados` que já está no
arquivo. O fechamento do furo 2 tem DUAS metades, a recusa e a cicatrização.

## OS TRÊS ACHADOS FORA DE ESCOPO: PROPOSTA, não construção (§A.31)

Não construo nenhum sem aval do diretor.

1. **Texto livre sobrevive à anonimização.** `as_contatos.resumo` (`tables.ts:3611`) e
   `as_candidaturas.motivo_descarte` (`:3503`) guardam o que o consultor digitou, e é ali que
   telefone e nome aparecem na prática. O expurgo não os alcança. É um TERCEIRO furo, do mesmo
   tema, e o momento natural de fechá-lo é antes de a ingestão criar volume.
2. **A mensagem de duplicidade entrega o NOME do titular.** `conflitoDeCpf`
   (`candidatos.service.ts:2369`) devolve o nome e o id de quem tem aquele CPF. Cumpre a letra da
   régua (não repete o número) e funciona como oráculo de CPF para nome. Entregar só o
   `candidatoId`, que é o que a tela precisa, resolveria.
3. **Três databases de ensaio de sessões anteriores** sobrevivem no container `ea-db`
   (`ea_ensaio_migrations`, `ea_homolog_clone_etapa1`, `ea_juncao_prova`), e dois deles têm linha de
   candidato. Derrubar é uma linha.

## O CONDICIONAMENTO DO PONTO 5, que eu assumo por escrito

A ordem (fundação, furos, ingestão) fica APROVADA sob duas travas, e as duas valem daqui em diante:
1. **a ingestão não é ligada antes de os dois furos fecharem**;
2. **nenhuma carga, seed ou runner grava `as_candidatos` nesse meio-tempo**, medido hoje como
   verdadeiro (nenhum arquivo de `db/` toca A&S).
