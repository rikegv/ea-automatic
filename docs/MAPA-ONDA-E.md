# MAPA DE ALCANCE: ONDA E DA CENTRAL DE VAGAS (segmento e comercial)

Levantado pelo coordenador (§A.39 passo 1, §A.40 regra 1: o mapa é auditado ANTES do primeiro
despacho). **[M]** = medido. **[P]** = pergunta ao diretor. **[R]** = recomendação.

---

## 1. A INVESTIGAÇÃO QUE A OST PEDIU: NÃO EXISTE NADA. **[M]**

```
colunas com 'segmento|comercial|ramo' no banco INTEIRO ..... 0
tabelas com esses nomes .................................... 0
colunas de `clientes` ...................................... 17, nenhuma delas
```

São **campos novos**, não há o que reusar. Mas há **três homônimos** no repositório, e confundi-los
custaria uma frente:

| o que é | onde | tem a ver? |
|---|---|---|
| "segmento de rota" (`auditoria`, `exame`...) | `esteira.service.ts:103` | **não** |
| `LinhaSegmento`, linha de quebra de relatório | `gerencial.service.ts:105` | **não** |
| **"segmentação de ÁREA"**, o teto de RBAC por área | `docs/ARQUITETURA-SEGMENTACAO-AREA.md` | **NÃO, e é o mais perigoso** |

O terceiro é um mecanismo de **permissão** (MASTER manda na área dele). O "segmento" desta onda é o
**ramo do cliente** (Varejo, Saúde, Indústria). **Nomear a coisa nova de `segmento` sem qualificar vai
colidir na leitura de quem chegar depois.** [R] nomear as tabelas `as_segmentos` e `as_comerciais`,
com o prefixo do módulo, como já fazem `as_linhas_servico` e `as_etapas_funil`.

## 2. O MOLDE JÁ EXISTE, E É EXATO. **[M]**

`as_linhas_servico` (Onda C) é o molde pedido, e ele é copiável linha a linha:

- **tabela**: `id serial`, `codigo varchar(40) UNIQUE`, `rotulo varchar(120)`, `ordem int`,
  `ativo bool default true`, `criado_em`, `atualizado_em`;
- **backend**: `as/linhas-servico/` com `service`, `dto`, **duas** controllers, e a separação que
  importa: `@Controller("as/linhas-servico")` para LER (qualquer um que precise da lista) e
  `@Controller("admin/as/linhas-servico")` **com `@Roles("SUPER_ADMIN")` na própria controller**, que
  é a autoridade fail-closed; o menu é só a camada de UX;
- **tela**: `app/(app)/admin/as/linhas-servico/page.tsx`;
- **menu**: registrado em `domain/menus.ts` com `grupo: "ADMIN"` e `areas: ["AS"]`.

**§A.23, e não é negociável:** os dois menus novos **nascem só para o SUPER_ADMIN**. A fábrica
REGISTRA no catálogo (para existirem e serem selecionáveis) e **para por aí**. Não rodar `seed-menus`
nem `backfill-menus-comum`. Menu que não aparece para os outros **não é bug**.

## 3. O MODELO DA HERANÇA, e é aqui que mora a única decisão

O diretor definiu: a vaga **herda** do cliente, e pode **sobrepor**. Há duas formas de gravar isso, e
elas divergem no que acontece com a vaga ANTIGA quando o cliente muda:

**[R] A. NULO SIGNIFICA HERDAR (herança viva).** `vagas.segmento_id` e `vagas.comercial_id` nuláveis;
nulo = usa o do cliente, preenchido = sobrepõe. A leitura resolve por `coalesce(vaga.x, cliente.x)`.

**B. CÓPIA NO NASCIMENTO (retrato).** A vaga copia o valor do cliente ao ser criada e nunca mais muda.

**A diferença é uma só, e é real:** trocando o comercial de um cliente, na opção A **todas as vagas
passadas dele passam a mostrar o comercial novo**; na B, cada vaga guarda quem era o comercial na
época. Para SEGMENTO (o ramo) a herança viva é claramente certa. Para COMERCIAL (a pessoa), é
decisão de negócio: *"de quem é esta vaga"* pode significar quem atende hoje, ou quem vendeu na época.

**[P1] RESPONDIDA PELO DIRETOR (12/09): HERANÇA VIVA, a opção A.** A vaga antiga **acompanha** a
troca no cliente. "De quem é esta vaga" significa quem atende o cliente HOJE, e corrigir a carteira
num lugar só corrige tudo. **O preço foi declarado e aceito:** não existe registro de quem era o
comercial na época, e ele **não pode ser reconstruído depois** para o período passado. Nada de
carimbo, snapshot ou histórico: não foi pedido e ele decidiu contra.

**O que NÃO depende da resposta e já está sendo construído:** os dois gerenciadores inteiros, os dois
campos no cadastro do cliente, e a conversão dos seletores nativos. A resposta muda **só** a régua de
leitura da vaga e o valor inicial das duas colunas.

## 4. A TELA DE CLIENTES: a dívida da §A.36 É PARA AGORA. **[M]**

`app/(app)/admin/clientes/page.tsx` (791 linhas) tem **quatro `<select>` nativos**, todos anteriores à
§A.35: Tipo de marcação (`:384`), Periodicidade do benefício (`:408`), Vínculo (`:451`) e o filtro por
tipo de serviço (`:511`). A §A.36 manda corrigir **quando a tela for trabalhada**, e ela vai ser: os
dois campos novos moram nela. **São quatro trocas contidas**, listas curtas, e o `Select` do design
system já está em uso em dezenas de telas. **Cabe, e entra.**

## 5. A LARGURA DA CENTRAL DE VAGAS: o item 4 da OST tem resposta medida

Medido em **produção**, a 1600px com o menu aberto, sobre as 3 vagas reais **[M]**:

```
mínimo real da tabela .......... 1102,31px
caixa útil ..................... 1254px
folga .......................... 151,69px
```

Duas colunas de texto livre ("Varejo", "Ana Paula Rodrigues") **não cabem em 151px** sem devolver a
rolagem lateral que a Onda B3 e a Onda D acabaram de zerar. E a Onda D **acabou de tirar** uma coluna
para isso caber.

**[R] FILTRO SIM, COLUNA NÃO.** Os dois viram **filtro multiselect** (§A.28/§A.37), que mora no modal
e custa **zero** de largura, mais a exibição na **ficha da vaga** (o painel de gestão, onde há espaço
de sobra). O diretor passa a poder perguntar "as vagas do Varejo" e "as vagas da Ana" sem que a tabela
volte a rolar. É o mesmo argumento que ele já aprovou na Onda D para o Cargo: a §A.30 diz que nem toda
coluna vira filtro, e não diz que filtro precisa de coluna.

**[P2] RESPONDIDA PELO DIRETOR (12/09): SÓ FILTRO, SEM COLUNA.** Ele decidiu pelo argumento da
largura, sem esperar o número. A medição do que duas colunas custariam **continua sendo feita**, mas
como registro para o DIARIO, não como decisão pendente.

## 6. §A.6 / §A.38: ONDE A AUDITORIA ENTRA

- **RBAC**: dois gerenciadores novos, com `@Roles("SUPER_ADMIN")` na controller de escrita e dois
  menus novos no catálogo. É o tema exato da §A.38.
- **Dado pessoal**: **`as_comerciais` guarda NOME DE PESSOA.** É a primeira tabela desta onda com PII,
  e ela vai para a tela, para o filtro e para a ficha da vaga. Precisa de régua: o que se guarda (só o
  nome? e-mail? não), quem lê, e se o nome entra em log (não deve).
- **Escrita em `clientes`**: tabela central, lida por admissões, régua documental, folha e o de/para.
  Acrescentar coluna nulável é seguro, mas a auditoria confirma que nada mais é tocado.

## 7. O QUE ESTA ONDA NÃO TOCA (§A.14/§A.31)

Nenhuma concessão de menu, nenhuma outra tela, nenhum KPI, nenhuma coluna nova na tabela da Central de
Vagas (item 5), nenhuma alteração no `grupo_cliente_membros` nem no de/para.


---

## 8. AS DUAS DECISÕES DO DIRETOR, e o que elas fecham

| pergunta | decisão | efeito |
|---|---|---|
| **[P1]** comercial da vaga antiga | **herança viva** | nulo na vaga = herda; `coalesce` na leitura; sem carimbo de época |
| **[P2]** coluna na Central De Vagas | **só filtro** | zero custo de largura; a ficha mostra, a tabela não |

**O contrato compartilhado já está escrito e construído** (arquivo de dono único, §A.39):
`AsSegmento`, `AsComercial`, `AsOrigemDoValor` (`HERDADO`/`SOBREPOSTO`/`AUSENTE`) e
`AsValorHerdado` (`{ id, rotulo, origem }`).

**Por que são DOIS tipos e não um genérico:** a forma é a mesma, o significado não. Um alias comum
faria `AsSegmento` e `AsComercial` serem o **mesmo tipo** para o compilador, e passar um onde se
espera o outro compilaria em silêncio. São exatamente os dois campos que ficam lado a lado na mesma
tela e na mesma vaga, então trocá-los é o erro mais fácil de cometer.

**`AUSENTE` não é caso de borda, é o estado inicial de quase tudo:** são 249 clientes e o diretor vai
preencher os dois campos aos poucos. A tela escreve **"não informado"** (§A.11), nunca traço, nunca
vazio, nunca o rótulo de outro.
