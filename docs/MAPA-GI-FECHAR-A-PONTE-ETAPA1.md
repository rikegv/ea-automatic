# Mapa de alcance: fechar a ponte do GI, etapas 1 a 5 (05/10/2026)

Investigacao do coordenador ANTES do primeiro despacho (§A.27 / §A.39 passo 1 / §A.40 regra 1).
Tudo medido nesta data contra o codigo da `main`, a producao do EA, o contrato publico do GI e o banco.

## 1A. O GATILHO DO ENVIO: a premissa do diretor esta PARCIALMENTE certa, e a diferenca decide a etapa 5

### O que o diretor cravou
"O envio dispara quando a AUDITORIA e o EXAME fecham, no inicio do CADASTRO. Nao e automatico ao
armar o motor. Logo o Allan e a Sonia nao sairiam agora, e o veto do `seguranca` cai."

### O que EXISTE no codigo, medido

Ha DOIS gatilhos, e so um envia:

| gatilho | onde | quando roda | envia? |
|---|---|---|---|
| **automatico** | `auditoria.service.ts:688`, dentro de `if (progresso.completa)` | ao fechar a **regua obrigatoria daquele cliente** na auditoria | **NUNCA**. Stub deliberado |
| **manual** | `enviar-para-gi.controller.ts` -> `enviarManual`, rota MASTER/SUPER_ADMIN | quando alguem **clica**, uma admissao por vez | SIM, atras de `GI_DISPARO_ARMADO` |

**O automatico e INCAPAZ de enviar, e isso e por construcao, nao por falta de credencial.**
`EnviarParaGiService.enviar` passa uma porta vazia ao gatilho puro:
`enviarAoGi: async (_payload) => ({})`, e `executarGatilhoGi` (`domain/portal-dados-gi.ts:1892`)
retorna `{ enviado: false }` nos dois ramos, com ou sem GI configurado. Desfecho sempre
`GI_AUTOMATICO_INERTE`. **Nao monta payload, nao toca rede, nem armado.**

### AS DUAS DIVERGENCIAS, e elas sao o achado desta etapa

1. **NAO e "auditoria E exame".** O ponto ligado e o fechamento da **auditoria** (a regua obrigatoria
   completa). Nao ha leitura da frente de EXAME naquele ponto, e nao e o gate do Cadastro (regra 3 do
   §A.3, que exige as duas). Quem fecha a auditoria com o exame ainda aberto ja passa por ali.
2. **Armar NAO liga fluxo nenhum.** `GI_DISPARO_ARMADO=true` nao faz admissao sair sozinha, porque o
   caminho automatico e um stub. Depois de armar, **nada vai para a folha sem um clique humano**,
   um a um, por um MASTER/SUPER_ADMIN.

### CONSEQUENCIA para o veto sobre o Allan e a Sonia

**O veto NAO cai inteiro: ele TROCA de forma, e fica menor.**

- **Cai a parte do disparo em massa.** Armar nao envia ninguem. Nao existe leva, nao existe
  "as vivas vao ao ligar". Medido: o automatico e stub.
- **FICA a parte do clique.** Com a flag armada, um MASTER que abrir a tela e clicar no Allan HOJE
  manda a pessoa para a folha **com RG, CTPS e PIS nulos**, porque nenhuma guarda do passo 6 olha
  documento (ver 1B). O gatilho ser depois da auditoria nao protege: protege de automatismo, nao de
  clique.
- **E a premissa de que "elas ainda nao passaram pela auditoria" precisa ser medida por admissao**,
  nao assumida: o gatilho automatico so e alcancado quando a regua daquele cliente fecha, e o estado
  de regua do Allan e da Sonia e dado de banco, nao de desenho.

## 1B. A REGUA POR CLIENTE: CONFIRMADO, e nenhuma guarda cobra documento

**O ponto de atencao do diretor esta certo, e o codigo ja o respeita.**

- **O gatilho automatico depende da regua DAQUELE cliente.** Ele vive dentro de
  `if (progresso.completa)`, e `progresso` vem de
  `reguaCompletude.progresso(admissaoId, adm.codCliente, adm.cargoId)`: a chave e
  **(cliente + cargo)**, exatamente a `ReguaDocumental` do §A.3. Cliente que nao exige CTPS fecha sem
  CTPS, e o gatilho e alcancado do mesmo jeito. **Nao existe conjunto fixo.**
- **As guardas do passo 6 NAO olham documento.** A lista fechada de recusas e:
  `GI_SEM_EMPRESA_FILIAL`, `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO`, `GI_SALARIO_INVALIDO`,
  `GI_SALARIO_SEM_UNIDADE`, `GI_SALARIO_HORISTA_SEM_JORNADA`. **Nenhuma e sobre documento.**
  A unica guarda anterior e `GI_SEM_DADOS_PESSOA`, e ela exige **nome ou CPF**, nada mais
  (`gi-leitor.service.lerPessoa` le de `candidatos`: nome, cpf, nascimento, sexo, email, telefone,
  banco, agencia, conta).
- **O GI aceita nulo, e agora esta MEDIDO contra o contrato publico, nao deduzido.**
  `TB_FuncionarioSelecaoAPI`: **415 campos, `required` = 0** (lista vazia), e **363 campos aceitam
  `null` explicitamente**. Dos 26 campos de documento, **nenhum e obrigatorio**. Mandar sem CTPS
  **nao quebra**.

**Risco que isto cria, e e o do 1B ao contrario:** como nada cobra documento, documento **nulo** e
documento **nao exigido** sao indistinguiveis para o envio. O certo (cliente nao exige) e o errado
(cliente exige e ninguem coletou) saem iguais. Se a protecao tiver de existir, ela e **nova** e tem de
olhar a regua daquele cliente, nunca uma lista fixa. **Fora do escopo desta OST: proposta, nao
construcao (§A.31).**

## 2. A FRESTA DOS TESTES (24..31): o que se sabe e o que falta

Medido em 05/10: `FuncionarioSelecao/GetAll` = HTTP 200 `[]`. `Funcionario/Get?cpf=` = **HTTP 403**
(a folha e negada a nossa credencial). `FuncionarioSelecao/Get?Id=` = **204 para tudo**, inclusive
para um registro que CERTAMENTE existe (`Banco/Get?Id=5`, com o 5 presente no `GetAll`): **a rota por
Id e inerte e nao prova existencia.**

**Nao foi o EA.** O cliente do GI faz POST para exatamente tres rotas
(`Conexao/VerificaConexao`, `Login/Login`, `FuncionarioSelecao/Add`); nao existe DELETE nem Update em
`gi/*.ts`; nenhum scheduler toca o GI; a grade de leitura e GET-only. O **expurgo** apaga linhas da
NOSSA `admissao_dados_gi` por `expurgar_em`, nunca algo do fornecedor.

**Falta distinguir apagado x escondido**, e a medicao e `GetAllJson` com filtro, hoje bloqueada pela
grade (endurecimento GET-only do `seguranca`). **Autorizado pelo diretor em 05/10**: reabrir, medir,
reendurecer.

## 3. A BOMBA DO RELEASE (etapa 3)

`ea-release-portal/apps/backend/src/gi/gi-depara.service.ts` e de 02/10 **13:45** (pre-separacao, so
`GI_DEPARA_BANCOS` + `GI_DEPARA_CIDADES`), e o `dist/gi/gi-depara.service.js` servido e de **17:47**
(com `GI_DEPARA_MUNICIPIOS_IBGE`). Um build dentro do release reverte a separacao **em silencio**.
Conserto: copiar os arquivos do GI da `main` para o `src` do release, **sem build e sem restart**.

## 4. O DE/PARA AUSENTE EM PRODUCAO (etapa 4)

`grep -ciE "DEPARA" .env` = **0** no `.env` de producao. Nem `GI_DEPARA_MUNICIPIOS_IBGE` nem
`GI_DEPARA_CIDADES`. O mapa e JSON inline no env, entao hoje o mapa nasce vazio e
`codMunicipioNascto` sai **NULO**. Fail-closed, nao mente, mas producao **nao esta** no estado que o
registro 29 provou. Instalar e acao de infra sobre o `.env` (permissao 600) + restart do `ea-backend`,
a coordenar com as sessoes do Portal, da Central de Vagas e do Digai.

## 5. QUEM MAIS ESCREVE/LE O QUE VAI SER MEXIDO (§A.40 regra 3)

| ponto | quem le/escreve | risco |
|---|---|---|
| `GI_DEPARA_*` (env) | so `GiDeParaService` (construtor, no boot) | encher muda o payload de TODO envio futuro |
| `.env` de producao | os 4 servicos do EA leem no boot | restart e compartilhado: coordenar |
| `src/gi/*` do release | nada em runtime (runtime le `dist`) | sincronizar e seguro sem build |
| grade `grade.py` | so a investigacao, fora do repo | reabrir afrouxa um controle do `seguranca` |
| `GI_DISPARO_ARMADO` | `enviarManual` passo 5 | **NAO armar nesta OST** |
