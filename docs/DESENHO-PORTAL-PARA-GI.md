# Desenho: do Portal do Candidato até o G.I (a folha)

**O que é.** O MAPA e o desenho de como fechar o caminho `documento -> IA lê -> candidato valida -> vai
para o G.I`, com OPÇÕES numeradas para o diretor decidir cada peça. **É projeto do `arquiteto`. Nada foi
construído, nada foi commitado. Read-only.** Cada afirmação de estado foi medida no código; onde não deu
para medir, está dito.

**Quem produziu:** `arquiteto` (§A.39), sem poder de escrita de produção. **Consome:**
`docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md` (mapeamento GI fechado pelo diretor em 16/09/2026),
`docs/DESENHO-PORTAL-TRILHA-SOL.md`, `docs/FLUXO-AUDITORIA-HOJE-E-O-PORTAL.md`,
`docs/PARECER-PORTAL-DOCUMENTOS-CANDIDATO.md` (Parte 2, o GI), e o código vivo do Portal.

---

## 0. A CONCLUSÃO, primeiro (§A.42)

**A metade difícil já está construída e ninguém está usando.** A IA que lê o documento e EXTRAI os
campos que o GI pede (RG, CTPS, PIS, nome, nascimento, filiação, endereco, banco) já roda hoje, ponta a
ponta, do `ai-service` até dentro do backend do Portal. Ela extrai, normaliza, joga fora o que veio com
baixa confianca (para nao chutar dado no eSocial), e ENTREGA os valores na resposta HTTP de
`POST /portal/confirmar`, com a marca "isto e SUGESTAO, exige confirmacao humana".

**O caminho quebra em TRES pontos, e sao os tres que faltam construir:**

1. **A tela do candidato joga os valores fora.** O frontend recebe os campos extraidos na resposta e
   NAO os le nem renderiza: nao existe formulario de validacao. O candidato nunca ve o que a IA leu.
2. **Nada e persistido.** Por decisao de §A.6, os valores extraidos hoje sao PII de passagem: contam
   num evento (so o NUMERO de campos lidos) e somem. Nao ha coluna, nao ha tabela, nao ha o "dado
   validado pelo candidato" guardado em lugar nenhum.
3. **Nao existe cliente do G.I.** Zero linhas de codigo do EA falam com o GI (medido: nenhum arquivo
   referencia `apigeral`, `giinterno`, `FuncionarioSelecao`, `SolicitacoesDocumentos`, `ChaveAcesso`).
   A frente GI esta PAUSADA aguardando o fornecedor (Parte 2 do parecer).

**Portanto:** o custo de construcao e MENOR do que parece para as pecas 1 e 2 (a IA ja faz o trabalho
pesado), e a peca 3 (ponte GI) esta bloqueada por insumo do fornecedor, nao por engenharia. O desenho
abaixo separa o que da para construir JA (1 e 2, sem depender do fornecedor) do que espera o GI (3).

---

## 1. Estado medido, peca por peca (o que existe HOJE)

| Peca | Arquivo | Estado |
|---|---|---|
| Inspecao do arquivo (tipo real, senha, conteudo ativo, paginas) | `apps/ai-service/app/portal_inspecao.py` | **PRONTO** |
| Catalogo de campos por tipo de documento | `apps/ai-service/app/portal_extracao.py` (`CAMPOS_POR_TIPO`) | **PRONTO**, 12 tipos mapeados |
| Extracao na MESMA chamada da auditoria | `apps/ai-service/app/gemini.py` (`campos_a_extrair`) | **PRONTO** |
| Rota do leitor devolve `sugestoes` (valores + `origem`+`exigeConfirmacaoHumana`) | `apps/ai-service/app/routers/portal.py` | **PRONTO** |
| Cliente do leitor no backend | `apps/backend/src/portal/portal-leitor.service.ts` | **PRONTO** (inerte sem `PORTAL_LEITOR_URL`) |
| Orquestrador do caminho do arquivo (grava, confirma, le, devolve `sugestao.campos`) | `apps/backend/src/domain/portal-caminho-arquivo.ts` | **PRONTO** |
| Guarda do veto V12 (descarta sugestoes sem a marca de confirmacao humana) | `portal-credencial.service.ts:1199-1218` | **PRONTO** |
| Resposta de `POST /portal/confirmar` CARREGA `sugestao.campos` no corpo | `portal-credencial.service.ts:644` (`...resultado`) | **PRONTO** (chega ao browser) |
| **Tela do candidato le e valida os campos** | `apps/frontend/src/app/portal/page.tsx` | **NAO EXISTE**: `RespostaConfirmacao` (linha 189) nao declara `sugestao`, `lerConfirmacao` (974) ignora |
| **Persistencia do dado validado** | ninguem | **NAO EXISTE** |
| **Cliente / ponte para o G.I** | ninguem | **NAO EXISTE** (frente PAUSADA, §A.9) |
| Dicionarios GI (grau instrucao, raca, estado civil, nacionalidade, tipoLogradouro) | `docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md` | **ENTREGUES pelo diretor**, ainda nao viraram tabela/enum |

**Os campos que a IA ja sabe extrair, por tipo** (`portal_extracao.py`): RG (numero, orgao, UF, emissao,
nome, nascimento, nome da mae, nome do pai), CPF, CTPS (numero, serie, UF, **PIS**, nome, nascimento),
CNH, PIS_PASEP, TITULO_ELEITOR (numero, zona, secao), RESERVISTA, COMPROVANTE_RESIDENCIA (CEP,
logradouro, numero, complemento, bairro, cidade, UF), DADOS_BANCARIOS, CERTIDAO (estado civil, filiacao),
CARTAO_SUS, COMPROVANTE_ESCOLARIDADE.

**Cruzando com o GI-DADOS (o que o GI pede):** a extracao ja cobre a MAIORIA dos campos que o EA nao tem
hoje (grupo 3 numeros de documento, filiacao do grupo 1, endereco do grupo 5, estado civil do grupo 2). O
que a IA NAO extrai de documento, porque nao esta em documento comum, e o que continua sendo digitado ou
de catalogo: `raca`, `grauInstrucao`, `nacionalidade`, `naturalidade` (grupo 2), e os de/para (codigo da
cidade, codigo do banco). Ver secao 5 para o mapa completo campo a campo.

---

## 2. PECA 1: o candidato VE e VALIDA os dados extraidos

**O que falta e so a camada de tela + o transporte do dado ate ela + a persistencia do validado.** A IA
ja entrega os valores; o problema e de produto e de UX, nao de motor.

### 2.1 O contrato de dado ja existe, so precisa atravessar a fronteira

Hoje `sugestao.campos` chega ao corpo de `/portal/confirmar` como
`{ [campo]: { rotulo, valor, confianca, lido } }` mais `origem:"IA"` e `veredito`. Para a peca 1, o
`shared-types` (dono: coordenador, §A.39) declara esse bloco na `RespostaConfirmacao`, e o frontend passa
a le-lo. Nenhum dado novo precisa ser inventado; ele ja viaja, so nao e consumido.

### 2.2 OPCAO A: quando o candidato confere (a UX)

**Opcao A1: conferencia POR DOCUMENTO, na hora, na propria casa da trilha.** Subiu o RG, a IA leu, a
casa (ou um passo logo apos o "aceito") mostra "Confira o que lemos do seu RG": nome, numero, orgao, data,
com os lidos preenchidos e os nao-lidos em branco para digitar. Confirma e segue para a proxima casa.
- Pros: contexto fresco (o documento acabou de subir, o candidato lembra do que enviou); erro de leitura
  aparece ao lado do documento certo; distribui o esforco em pedacos pequenos, casa a casa.
- Contras: o mesmo campo aparece em varios documentos (nome e nascimento estao em RG, CPF, CTPS, CNH):
  precisa de regra de "ja confirmado, nao pergunto de novo" ou o candidato confirma o nome 4 vezes.

**Opcao A2: um FORMULARIO UNICO no fim da trilha.** Terminada a coleta de documentos, uma tela so, com
todos os campos do GI agrupados (identidade, documentos, endereco, banco), ja pre-preenchidos pela uniao
das extracoes de todos os documentos. O candidato revisa tudo de uma vez e confirma.
- Pros: um lugar so; deduplicacao natural (o nome aparece uma vez); mais perto de "completar a admissao".
- Contras: tela longa no celular (o pior caso da §A.13/§A.20 em mobile); o candidato ja "terminou" na
  cabeca dele quando subiu o ultimo documento e pode abandonar; perde o contexto do documento de origem.

**Opcao A3: HIBRIDO (recomendacao do arquiteto para o diretor avaliar).** Conferencia leve por documento
para os campos-chave daquele documento (A1), MAIS um passo final curto so com o que sobrou vazio e com os
campos que nao saem de documento (`raca`, `grauInstrucao`, `estadoCivil`, `nacionalidade`). O nome e o
nascimento sao confirmados uma vez (na primeira casa que os traz) e depois so exibidos, nao repergunta.
- Pros: junta o contexto fresco de A1 com a completude de A2, e o passo final fica curto porque a maior
  parte ja foi confirmada no caminho.
- Contras: e o de maior superficie de construcao dos tres (duas telas em vez de uma).

### 2.3 O que acontece quando a IA leu ERRADO (regra, nao opcao)

O desenho ja tem a postura certa embutida no motor, e ela deve valer na tela: **o valido e sempre o que
o candidato confirma, nunca o que a IA leu.** A IA e SUGESTAO. Campo de baixa confianca ja volta VAZIO
(`portal_extracao.py`, `CONFIANCA_MINIMA=0.70`): melhor vazio para o candidato digitar do que chute que
vira multa no eSocial. Na tela: todo campo e editavel, o candidato corrige, e o valor gravado e o dele.
O `confianca`/`lido` que viajam servem so para a tela decidir o realce (campo lido em cinza-confirmavel,
campo nao-lido em branco-pedindo-atencao), nunca para bloquear edicao.

**Ponto de espera do candidato (medido, FLUXO-AUDITORIA secao 3):** o upload+IA tem mediana de 11 a 14s e
cauda ate ~80s. A tela de conferencia PRECISA ser desenhada para essa espera (aviso "estamos lendo o seu
documento", poder sair e voltar sem perder o enviado). Nao e acabamento: decide se o candidato desiste.

### 2.4 OPCAO B: onde o dado validado e PERSISTIDO

O candidato confirmou. Esse dado precisa sobreviver ate o momento de ir ao GI (que pode ser dias depois).
**Isto e §A.6 puro: e PII de pessoa (numeros de documento, filiacao, endereco). A frente `seguranca` VETA
antes de qualquer construcao.**

**Opcao B1: tabela nova `admissao_dados_gi` (ou `pre_admissao_dados`), uma linha por admissao.** Colunas
tipadas para cada campo do GI que o EA nao tem, mais carimbo de quem confirmou e quando. Precedente direto:
`formularios_vt` (medido em `db/schema/tables.ts`) ja e exatamente isto, PII estruturada do candidato por
admissao, com snapshot e minimizacao §A.6.
- Pros: consultavel, tipado, o time completa o que falta na mesma linha (peca 2); casa com o modelo de
  dominio (§A.3, entidade proxima de DadosVagaFolha).
- Contras: e retencao de PII sensivel em banco, o que hoje o EA evita ao maximo (o principio "documento e
  efemero" nao se aplica a DADO, mas a §A.6 pede minimizacao). Exige politica de retencao/expurgo (ver B3).

**Opcao B2: guardar so nas colunas que ja existem + estender `candidatos`/`dados_vaga_folha`.** Endereco ja
tem casa (VT); banco/agencia/conta ja existem em `candidatos`; o resto (RG, CTPS, PIS, filiacao, raca,
grau) ganha colunas novas onde fizer sentido.
- Pros: reusa o que ja existe, menos tabela nova.
- Contras: espalha PII sensivel por varias tabelas lidas por muitas telas (Gerenciador, Esteira, export),
  ampliando a superficie que a §A.6 manda estreitar. O INVESTIGACAO-EXTRACAO ja registra que banco/agencia/
  conta/CPF-do-substituido sao "so na ficha, nunca em superficie coletiva": colocar RG/PIS soltos em
  `candidatos` repete o risco que aquela decisao conteve. **O arquiteto desaconselha B2** por alcance.

**Opcao B3: politica de retencao do dado validado (decisao acoplada a B1/B2).** O dado so precisa viver do
"candidato confirmou" ate "o GI recebeu (peca 2) + margem de reprocesso". Espelha o TTL da staging (§A.6)
e o TTL do CPF de substituicao (§A.3 regra 10): expurgo automatico N horas apos a admissao concluir/enviar.
Sem isso, o EA vira um repositorio permanente de RG e PIS de todo candidato, que e o oposto da minimizacao.
**Recomendacao: B1 + B3 (tabela dedicada, com expurgo), submetido ao `seguranca`.**

---

## 3. PECA 2: os dados VAO para o G.I

O destino esta fechado pelo diretor (`GI-DADOS`, 16/09/2026): a integracao escreve em
**`FuncionarioSelecao`** (a pre-admissao), NUNCA em `Funcionario` (a folha oficial, 403 para a credencial).
Vao SO os dados da pessoa. Documento-arquivo NAO vai (segue para o prontuario no Drive, como hoje).

### 3.1 OPCAO C: em QUE MOMENTO os dados sobem ao GI

**Opcao C1: na confirmacao do candidato (assim que ele valida).** Cada campo confirmado empurra para o GI.
- Contras: o candidato so preenche parte; o GI receberia um registro pela metade, varias vezes; acopla a
  disponibilidade do GI a tela do candidato (se o GI cai, o candidato ve erro). **Desaconselhado.**

**Opcao C2: na LIBERACAO/conclusao pelo time (recomendado).** O candidato valida e o dado fica guardado
(peca 1/B1). O time completa o que falta (secao 3.3) e, num gesto deliberado (a liberacao que ja existe no
fluxo A&S, ou um botao "enviar para a folha"), o EA monta o `FuncionarioSelecao` e chama o GI UMA vez, com
o registro completo.
- Pros: um envio, completo, controlado por humano com cracha; casa com a fila BullMQ + retentativa +
  reconciliacao que o parecer recomenda (Parte 2, secao 5) e que o EA ja usa em Pandape/Clicksign; o GI
  fora do ar nao afeta o candidato, so a fila.
- Contras: exige o passo humano de completar os campos do time antes do envio.

**Opcao C3: automatico quando o registro fica COMPLETO** (todos os obrigatorios do GI preenchidos, por
candidato + por time). Deriva de estado, como o farol.
- Pros: sem clique. Contras: "completo" depende de saber os obrigatorios de verdade do GI, que e
  justamente o que a reconexao ainda nao confirmou (secao 4). Ate la, C3 nao tem gatilho confiavel.

**Mecanismo (comum a C2/C3):** fila BullMQ isolada (`ea-redis`, prefixo proprio), worker com OAuth2/token
de 2h renovavel (o token do GI dura 2h, medido no parecer Parte 4), backoff, idempotencia por CPF/admissao,
e gravacao do identificador que o GI devolve + status de recebimento na admissao. Cloudflare exige header de
navegador (parecer Parte 4). **Credencial de escrita na folha e a mais sensivel do EA: `seguranca` audita,
segredo fora do codigo e fora de log, usuario GI com permissao minima (o atual pode Add/Update/Delete).**

### 3.2 OPCAO D: os de/para (codigo da cidade, codigo do banco)

O GI quer codigo; o EA guarda nome. O catalogo `Banco` (163 registros) e o de municipios sao LEGIVEIS pela
API do GI (parecer). Duas opcoes:
- **D1:** ler os catalogos do GI na reconexao, materializar um de/para local (tabela), traduzir no envio.
- **D2:** usar o recurso `DePara` do proprio GI (feito para isso) e mandar o nome, deixando o GI traduzir.
O de/para PESADO (cargo, horario, centro de custo) esta FORA do caminho critico: a pre-admissao os aceita
vazios (parecer Parte 4, medido). So sobram cidade e banco.

### 3.3 O que o TIME completa DEPOIS (fechado pelo diretor, GI-DADOS secao 4)

Fora da integracao, o time preenche na tela do GI: configuracao de folha, eSocial, contrato, salario;
cargo/horario/centro de custo (vao vazios); e a situacao trabalhista (`primeiroEmprego`, `flagRecontratacao`,
`flagAposentado`, `recebendoSD`, `infoCota`). Nada disso e pergunta ao candidato nem bloqueia o envio.

---

## 4. A RECONEXAO GI: os 2 a 3 detalhes que faltam confirmar

A grade GET-only esta PRESERVADA (`/home/henrique/gi-investigacao/`, fora do repo, auditada, 35 bloqueios +
25 leituras), so falta o diretor subir a credencial de novo (ela foi destruida com `shred`, deliberado).
Nada disto trava as pecas 1 e 2 do lado do EA; trava o "ligar de verdade" da peca 3.

1. **O PIS.** Suspeito principal de faltar no inventario (so vimos 119 dos 415 campos; o PIS pode existir
   e estar vazio no unico registro real). **Como confirmar:** listar os 415 nomes de campo do contrato de
   `FuncionarioSelecao` (GET do swagger/contrato), procurar o campo de PIS/NIT. A IA ja EXTRAI o PIS da
   CTPS (`portal_extracao.py`), entao o dado existe do lado do EA; falta so o nome do campo no GI.
2. **Os obrigatorios de verdade.** Hoje a marca de obrigatorio e inferencia fraca (a doc do GI nao marca; so
   ha 1 registro real). **Como confirmar:** ou o fornecedor responde, ou um SEGUNDO registro real permite
   "preenchido nos dois" virar indicio. Ate la, o envio manda tudo o que tiver e trata a rejeicao do GI como
   sinal (fila com reconciliacao), em vez de adivinhar.
3. **Formatos de 5 campos** (`GI-DADOS` secao B): `naturalidade` (codigo de municipio ou texto?), `orgaoRG`
   (sigla de lista ou texto?), `cidadeRG`/`cidadeExpedicao` (codigo ou nome?), `ufrg`/`ufResid` (confirmar
   sigla 2 letras), `sexo` (confirmar conjunto aceito). **Como confirmar:** um GET de leitura do registro
   real com os valores (na grade GET-only, sem PII em log), ou a tabela do fornecedor.
4. **`tipoLogradouro`** (dicionario entregue, 178 valores): confirmar se o GI tem campo proprio ou se o
   prefixo entra concatenado em `enderecoResid` (item da reconexao, nao bloqueia).

**Perguntas ainda pendentes ao fornecedor (parecer Parte 5):** existe ambiente de teste? (hoje a credencial
aponta para PRODUCAO; qualquer gravacao de teste seria na folha real). Documento por link ou outro modo?
Usuario com permissao minima. Enquanto nao houver ambiente de teste, o primeiro envio real e um teste em
producao: **decisao de risco do diretor.**

---

## 5. O CAMINHO COMPLETO: o que REUSA e o que CONSTROI, campo a campo

`documento -> IA le -> candidato valida -> vai pro GI`

| Etapa | Reusa (existe) | Constroi novo |
|---|---|---|
| Documento sobe | Portal/trilha da Sol, credencial, bucket, inspecao (§A.6 completo) | nada |
| IA le e audita | motor de auditoria (mesma chamada), 91 regras, veredito | nada |
| IA extrai campos | `portal_extracao.py` (12 tipos), `gemini.py`, rota do leitor, orquestrador, guarda V12 | **catalogo dos tipos que faltam** (se algum tipo do GI nao tiver campos mapeados) |
| Valores chegam ao browser | resposta de `/portal/confirmar` ja carrega `sugestao.campos` | **declarar `sugestao` em `RespostaConfirmacao` no shared-types** (dono: coordenador) |
| Candidato ve e valida | veredito/ajustar ja renderizados | **tela de conferencia (Opcao A), edicao, deduplicacao, campos sem-documento (raca/grau)** |
| Dado validado persiste | precedente `formularios_vt` | **tabela `admissao_dados_gi` (B1) + expurgo (B3)** + endpoint de gravacao + guard de sessao do portal |
| Time completa o resto | fluxo de liberacao A&S existente | **campos do time na tela interna (cargo vazio, eSocial, salario) OU so no GI** |
| De/para cidade/banco | catalogos GI legiveis, recurso `DePara` | **materializar de/para (D1) ou usar `DePara` (D2)** |
| Envio ao GI | fila BullMQ + OAuth2 + backoff (padrao Pandape/Clicksign) | **cliente do GI inteiro (`FuncionarioSelecao`), grade de escrita, worker, idempotencia, reconciliacao** |
| Confirmar recebimento | padrao de status em `admissoes` | **coluna de status GI + id devolvido pelo GI** |

**Campos do GI, origem de cada um (consolidado de GI-DADOS + portal_extracao):**
- **Ja no EA:** nome, cpf, nascimento, sexo, email, telefone (separar DDD no envio), agencia, conta, banco.
- **IA extrai de documento (ja implementado):** rg+orgao+uf+data, ctps+serie+uf+data, PIS, titulo+zona+secao,
  reservista, cnh+datas, endereco completo (CEP...UF), estado civil, filiacao (pai/mae).
- **Candidato digita (nao sai de documento comum):** raca, grauInstrucao, nacionalidade, naturalidade.
- **De/para (catalogo, nao coleta):** codigo da cidade, codigo do banco.
- **Time preenche no GI (fechado):** cargo/horario/centro de custo (vazios), eSocial, salario, contrato,
  situacao trabalhista.

---

## 6. Dependencias externas: onde entram

- **App do VT / Firebase (`~/vt-online-soulan`, coleta via GCS).** JA e a fonte do ENDERECO na trilha do
  Portal (GI-DADOS resolve a ressalva do endereco por ali). Para a peca 1, o endereco pode vir do
  COMPROVANTE_RESIDENCIA (a IA ja extrai) OU do VT, e o diretor decide qual e a fonte canonica quando os dois
  existem. Nao bloqueia; e uma regra de precedencia de dado.
- **SendGrid do Fernando (correio do link).** Ja e a via de entrega do link do Portal (`portal-correio`).
  Nao muda para esta frente: entrega o mesmo link; o que muda e o que o candidato faz DEPOIS de entrar.
- **Bucket do Portal (Fernando) e a barreira (allowlist por caminho).** Peca 1 nao muda a superficie externa:
  reusa `POST /portal/confirmar` (ja allowlistado). Um endpoint NOVO de gravar-dados-validados (peca 1/B1)
  PRECISA entrar na allowlist da barreira por CAMINHO, nunca por prefixo (DESENHO-PORTAL-TRILHA-SOL secao 6.4).
- **G.I (fornecedor).** Peca 3 depende da reconexao (secao 4) e das respostas do fornecedor. PAUSADA por isso.

---

## 7. §A.6 / LGPD: onde `seguranca` VETA antes de construir (§A.38)

Toda peca desta frente toca PII pesada. **O `seguranca` audita o MAPA antes do primeiro despacho (§A.40) e
o codigo depois. Nada sobe sem o veredito dele.** Pontos que ele vai examinar:

1. **O dado validado PERSISTIDO (peca 1/B1) e o maior risco novo:** RG, PIS, CTPS, filiacao, endereco em
   banco. Exige tabela dedicada, acesso so na ficha (nunca em superficie coletiva, como ja decidido para
   banco/agencia/conta no INVESTIGACAO-EXTRACAO), politica de retencao/expurgo (B3), e ausencia total em log,
   export, evento de trilha e mensagem de erro. **A postura de hoje e "so conta, nao guarda"; guardar e uma
   mudanca de politica que so o diretor autoriza e o `seguranca` audita.**
2. **Os valores extraidos ja viajam ao browser** (correto: e para isso que existem), mas o novo endpoint de
   gravacao recebe PII do candidato: guard de sessao do portal, `Cache-Control: no-store, private`, sem PII
   em log, e a validacao de que o valor gravado bate com a admissao daquele link (nao aceitar campo de outra
   pessoa).
3. **A credencial de escrita no GI** cria gente na folha: e a mais sensivel do EA. Segredo fora do codigo,
   usuario com permissao minima, sem token em log, e a URL/host do GI nunca persistidos nem logados (§A.6,
   mesmo padrao das URLs Pandape/Clicksign).
4. **O de/para e o CPF** seguem as regras vigentes: CPF e chave tecnica, nunca em log; minimizacao.
5. **`tester` independente** (§A.38) cobre: a guarda V12 (sugestao sem marca de confirmacao e descartada), o
   expurgo do dado validado, a idempotencia do envio ao GI, e que o valido gravado e o do candidato, nunca o
   chute da IA.

---

## 8. Camadas, dependencias e paralelismo

| Camada | Trabalho | Depende de | Paraleliza com |
|---|---|---|---|
| **shared-types** (coordenador) | declarar `sugestao` na `RespostaConfirmacao`; tipo do bloco de dados GI | nada | e o primeiro passo, destrava frontend e backend |
| **ai-service** (`ia`) | so se faltar catalogo de tipo; caso contrario, nada | catalogo de tipos | independente |
| **backend** (`backend`) | tabela `admissao_dados_gi`+migration; endpoint gravar-validado; expurgo; (peca 3) cliente GI+fila+worker | shared-types; decisao B; (peca 3) reconexao GI | frontend roda em paralelo apos o contrato |
| **frontend** (`frontend`) | tela de conferencia (Opcao A), edicao, dedup, campos sem-documento; espera §A.13/§A.20/§A.35/§A.41 | shared-types; decisao A | backend roda em paralelo apos o contrato |
| **integracao GI** (`backend`+`devops`) | cliente, OAuth2 2h, Cloudflare header, fila isolada, catalogos de/para | reconexao GI + fornecedor | so comeca quando a peca 3 destravar |
| **infra** (Fernando/`devops`) | allowlist do endpoint novo por caminho; credencial GI; ambiente de teste GI | diretor/Fernando/fornecedor | fora do codigo |

**Ordem sugerida (sem antecipar frente, §A.18):** o contrato no shared-types primeiro; entao pecas 1 e 2
(tela + persistencia) em paralelo entre frontend e backend, que NAO dependem do fornecedor e ja entregam
valor (o candidato validando reduz a digitacao manual do time hoje, antes mesmo do GI). A peca 3 (ponte GI)
fica para quando a reconexao/fornecedor destravar, e ai reusa fila e padrao ja provados.

---

## 9. AS DECISOES, para o diretor (uma por linha, §A.42)

1. **UX da validacao:** A1 (por documento), A2 (formulario unico no fim) ou **A3 hibrido** (recomendado).
2. **Persistencia:** B1 (tabela dedicada `admissao_dados_gi`, recomendado) ou B2 (estender tabelas existentes,
   desaconselhado por alcance §A.6).
3. **Retencao:** B3 (expurgo automatico apos envio/conclusao, recomendado) sim ou nao.
4. **Momento do envio ao GI:** C1 (na validacao), **C2 (na liberacao do time, recomendado)** ou C3 (automatico
   quando completo, so quando os obrigatorios do GI forem conhecidos).
5. **De/para cidade/banco:** D1 (materializar local) ou D2 (recurso `DePara` do GI).
6. **Fonte canonica do endereco** quando ha VT e comprovante: VT ou comprovante de residencia.
7. **Construir agora pecas 1 e 2 (sem depender do fornecedor)** e deixar a peca 3 para a reconexao: sim ou nao.
8. **Reconexao GI:** autorizar subir a credencial de novo para confirmar PIS, obrigatorios e os 5 formatos
   (secao 4), sim ou nao. E a decisao de risco do "primeiro envio real e em producao" enquanto nao houver
   ambiente de teste.

---

*Levantamento e desenho do `arquiteto`, sobre codigo medido em 23/09/2026. Nada construido, nada commitado.
§A.6: nenhum valor de pessoa foi lido nem impresso; so nomes de campo, arquivos e contagens.*
