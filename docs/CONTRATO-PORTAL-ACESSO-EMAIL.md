# CONTRATO v2, Portal: acesso por e-mail

**Esta é a v2. A v1 foi VETADA pelo `seguranca` e não deve ser seguida.** Dono deste arquivo e do
`packages/shared-types`: o **coordenador** (§A.39). `backend`, `frontend` e `tester` CONSOMEM e não
alteram. Quem achar erro reporta.

Leia antes: `docs/MAPA-ALCANCE-PORTAL-ACESSO-POR-EMAIL.md` e
`docs/CORREIO-DO-PORTAL-O-QUE-FALTA.md`.

## 0. O QUE A AUDITORIA VETOU, e por que a v1 morreu

A v1 abria o Portal pela porta de e-mail: achava a admissão **buscando pelo CPF digitado**. A
auditoria provou a tomada de conta: a trava de divergência que deveria conter isso é **vazia por
construção na população da OST**, porque candidato sem CPF tem `cpf` nulo e nulo não discorda de nada.
Quem tivesse a caixa de e-mail de um candidato do funil digitava o CPF **de um terceiro**, zero campos
divergiam, e a v1 abria o prontuário documental do terceiro. A porta de hoje recusa isso em letras
(`portal-identidade.service.ts:1078-1081`).

Somando a isso, medido em produção: **6 e-mails** são compartilhados por **12 CPFs** distintos, e
**5 deles carregam DOIS NOMES diferentes**. E-mail não é chave de identidade.

**A correção estrutural: a admissão vem do VÍNCULO do registro, nunca de busca por CPF.** Com isso o
pior caso deixa de ser "abro o prontuário de um terceiro" e passa a ser "escrevo um CPF errado na
ficha de funil de quem eu já tenho a caixa", que o time ainda tem de acatar.

## 1. O DESENHO ACEITO: uma porta, e a chave de acesso NÃO muda

A porta de e-mail **não emite sessão** e **não abre o Portal**. Ela prova a posse da caixa e, com
isso, dispara o **envio do link** para aquela mesma caixa. A sessão continua nascendo só de
`POST portal/identificar`, com link + CPF + nascimento, byte a byte como hoje.

1. **`POST portal/acesso-email/solicitar`** `{ email }`
   Resposta **única**, sempre idêntica: `{ enviado: true, expiraEmMinutos }`. Calculada na PRIMEIRA
   linha do método, antes de qualquer consulta, molde de `recuperacao`
   (`portal-identidade.service.ts:1260`). Resolvendo para **exatamente um** candidato do funil
   elegível: sorteia código, grava só o HMAC, envia pelo correio.
2. **`POST portal/acesso-email/confirmar`** `{ email, codigo }`
   Devolve **um bilhete curto de identificação (NÃO sessão)** e **NADA da pessoa**: sem nome, sem nome
   mascarado, sem cliente, sem cargo, sem e-mail. Comparação em tempo constante.
3. **`POST portal/acesso-email/identidade`** `{ bilhete, cpf, dataNascimento }`
   Valida dígito verificador. Sob trava por CPF, roda a lista de verificações da seção 5. Havendo
   divergência **ou** colisão de CPF, grava a TRAVA e recusa com a frase neutra, **sem dizer o campo**.
   Não havendo, grava **apenas** `cpf` e `data_nascimento` em `as_candidatos`.
4. **Havendo admissão viva ligada AQUELE candidato pelo vínculo** (nunca por busca de CPF): o sistema
   **emite e ENVIA o link do Portal por e-mail** para o endereço já verificado, pelo caminho que já
   existe (`emitirLinkParaEnvio` + `marcarEnvioDoLink`), com **autor interno** e trilha. A resposta diz
   `{ situacao: "LINK_ENVIADO" }` e não entrega sessão nenhuma.
5. **Não havendo:** `{ situacao: "DADOS_RECEBIDOS" }`. O time segue.

### O que o diretor pediu e a auditoria NÃO deixou passar

Ele pediu que o passo 2 "puxasse os dados que já tem dele (nome, e-mail)". **A auditoria proibiu
(O10):** posse de caixa não é prova de identidade, e cinco caixas medidas pertencem a duas pessoas. O
passo 2 devolve o bilhete e nada mais. Na prática o candidato vê os dados dele dentro do Portal, como
já vê hoje, depois de entrar pelo link com CPF + nascimento.

## 2. Números, todos normativos (da auditoria, não negociáveis por implementação)

| parâmetro | valor |
|---|---|
| tamanho do código | **6 dígitos**, `crypto.randomInt`, nunca `Math.random` |
| TTL do código | **10 minutos** |
| tentativas por código | **5**, e na quinta o código é **destruído**, não só bloqueado |
| solicitações por e-mail | **3 por hora** e **10 por 24h** |
| unicidade | **um** código vivo por candidato; emitir invalida o anterior |
| armazenamento | **HMAC-SHA256(segredo, codigo)**, nunca o código |
| segredo | **`PORTAL_CODIGO_PEPPER`**, variável PRÓPRIA. Jamais o `PORTAL_LOG_PEPPER` |
| comparação | `crypto.timingSafeEqual` sobre os digests |
| sem segredo, sem pepper da trilha ou sem correio | a rota nasce **INERTE com 503**, molde de `emitirComTrava` (`portal-identidade.service.ts:430-437`) |

Conta que sustenta os 6 dígitos: 10 códigos por dia x 5 tentativas = 50 chutes em 10^6, ou
5 x 10^-5 por dia por alvo, e ~1.380 dias para 50% de chance, gerando 10 e-mails por dia na caixa da
vítima. **Tirar o "morre na quinta" invalida a conta** e passaria a exigir 8 dígitos.

## 3. Módulo de domínio puro (sem I/O, sem logger, §A.6)

`apps/backend/src/domain/portal-acesso-email.ts`

```ts
export const TAMANHO_CODIGO: number;          // 6
export const CODIGO_TTL_MS: number;           // 10 min
export const CODIGO_TENTATIVAS_LIMITE: number;// 5, e na quinta destroi
export const SOLICITACOES_POR_HORA: number;   // 3
export const SOLICITACOES_POR_DIA: number;    // 10
export const SOLICITACAO_JANELA_MS: number;   // 60 min
export const SOLICITACAO_JANELA_DIA_MS: number; // 24 h

/** Sorteia com crypto.randomInt, sem viés de modulo. */
export function gerarCodigo(): string;
/** HMAC-SHA256 do codigo. O segredo e o PORTAL_CODIGO_PEPPER, nunca o da trilha. */
export function hashDoCodigo(codigo: string, segredo: string): string;
/** Comparacao em tempo constante sobre os digests. */
export function codigosIguais(digestA: string, digestB: string): boolean;
/** trim + minusculas. NAO remove ponto nem trata "+": nao e Gmail-aware. */
export function normalizarEmail(email: string): string;
/** Hash do e-mail para BALDE, jamais para a coluna candidato_hash da trilha. */
export function hashDoEmail(email: string, segredo: string): string;

export type CampoDivergente = "CPF" | "DATA_NASCIMENTO";

/**
 * Compara o que o candidato informou com o que a ficha do funil ja tem.
 * Campo AUSENTE no registro NAO e divergencia: e dado sendo preenchido.
 * Sem retorno antecipado (canal de tempo): avalia os dois campos sempre.
 * NOME nao entra: o candidato nao digita nome nesta porta.
 */
export function divergencias(
  informado: { cpf: string; dataNascimento: string },
  registrado: { cpf?: string | null; dataNascimento?: string | null },
): CampoDivergente[];

export const MOTIVOS_DA_TRAVA = [
  "DIVERGENCIA_CADASTRO",
  "CPF_DE_OUTRO_CANDIDATO",
  "EMAIL_AMBIGUO",
  "TRAVA_ANTERIOR",
] as const;
export type MotivoDaTrava = (typeof MOTIVOS_DA_TRAVA)[number];

export type DecisaoDaIdentidade =
  | { tipo: "OK" }
  | { tipo: "TRAVAR"; motivo: MotivoDaTrava }
  | { tipo: "CPF_INVALIDO" }
  | { tipo: "BILHETE_MORTO" };

/** Decide sem consultar nada: recebe o estado ja lido. PRECEDENCIA FIXA, testada item a item. */
export function decisaoDaIdentidade(entrada: {
  bilheteVivo: boolean;
  cpfValido: boolean;
  jaTravado: boolean;
  cpfDeOutro: boolean;
  divergentes: readonly CampoDivergente[];
}): DecisaoDaIdentidade;
```

**`mascararNome` SAIU do contrato.** A v1 a tinha para o passo 2; a auditoria proibiu devolver nome.

### A PRECEDÊNCIA de `decisaoDaIdentidade` é FIXA e normativa

Ordem, e cada degrau tem uma razão. Ela foi fechada pelo `tester` a partir do requisito e adotada
aqui para que `backend` e `tester` não divirjam:

| ordem | condição | por que vem aqui |
|---|---|---|
| 1 | `BILHETE_MORTO` | autenticação antes de tudo. Se divergência vencesse, quem não tem bilhete válido conseguiria **gravar trava no candidato de outra pessoa**: negação de serviço com escrita, e a fila do time viraria brinquedo de quem quisesse enchê-la |
| 2 | `TRAVAR` / `TRAVA_ANTERIOR` | estando travado, nada é reavaliado. Reavaliar permitiria **sobrescrever o motivo original**, apagando da trilha o que de fato travou |
| 3 | `CPF_INVALIDO` | comparar dígito verificador errado com o cadastro não tem sentido, e travar por erro de digitação do próprio candidato **encheria a fila de ruído**: isso ele corrige na tela, sozinho |
| 4 | `TRAVAR` / `CPF_DE_OUTRO_CANDIDATO` | é o caso mais grave (dois candidatos disputando o mesmo CPF) e é consultado **antes** de tentar escrever, em vez de esperar a violação de índice |
| 5 | `TRAVAR` / `DIVERGENCIA_CADASTRO` | por último entre as travas |
| 6 | `OK` | só quando tudo está limpo |

`EMAIL_AMBIGUO` **não entra nesta função**: ele é decidido antes, em `solicitar`, quando o e-mail
resolve para mais de um candidato, e naquele ponto não há bilhete nem CPF ainda.

## 4. Tabelas novas

`portal_acesso_codigos`

| coluna | tipo |
|---|---|
| `id` | uuid PK defaultRandom |
| `as_candidato_id` | uuid NOT NULL FK `as_candidatos` **restrict** |
| `email_hash` | varchar(64) NOT NULL |
| `codigo_hash` | varchar(64) NOT NULL |
| `expira_em` | timestamptz NOT NULL |
| `tentativas` | integer NOT NULL default 0 |
| `confirmado_em` | timestamptz |
| `invalidado_em` | timestamptz |
| `criado_em` | timestamptz NOT NULL default now() |

Índices: `(email_hash, criado_em)`, `(as_candidato_id, criado_em)`, `(expira_em)`.

`portal_acesso_travas`

| coluna | tipo |
|---|---|
| `id` | uuid PK defaultRandom |
| `as_candidato_id` | uuid NOT NULL FK `as_candidatos` **restrict**, **unique** |
| `travado_em` | timestamptz NOT NULL default now() |
| `motivo_codigo` | varchar(40) NOT NULL, CHECK na lista `MOTIVOS_DA_TRAVA` |
| `tentativas` | integer NOT NULL default 1, CHECK >= 0 |
| `destravado_em` | timestamptz |
| `destravado_por_id` | uuid FK `usuarios` **restrict** |
| `criado_em`, `atualizado_em` | timestamptz NOT NULL default now() |

CHECK `ck_portal_acesso_travas_destrave`: `destravado_em` e `destravado_por_id` são **ambos nulos ou
ambos preenchidos**.

**COLUNAS PROIBIDAS, nominalmente** (a ausência é a defesa, porque quem opera escreve o nome da
pessoa em campo livre): `valor_informado`, `valor_esperado`, `campo_divergente`, `cpf`,
`cpf_informado`, `data_nascimento`, `nome`, `email`, **`observacao`**, `justificativa`, e qualquer
`jsonb` de payload.

## 5. Verificações OBRIGATÓRIAS antes de gravar o CPF

Dentro de transação, com `pg_advisory_xact_lock` sobre o CPF normalizado (molde de `emitirComTrava`,
`portal-identidade.service.ts:492`):

| verificação | falha resulta em |
|---|---|
| `isValidCpf` (o mesmo validador, nunca um segundo) | `CPF_INVALIDO`, frase neutra |
| CPF começa com `PROV` | recusa de formato (identidade provisória é de declínio) |
| `as_candidatos.anonimizado_em is not null` | recusa neutra (reescrever desfaria um expurgo LGPD) |
| outro `as_candidatos` já tem esse CPF (`select` prévio, e o `catch` do 23505 **desemboca na MESMA linha**) | TRAVA `CPF_DE_OUTRO_CANDIDATO` |
| `cpf` ou `data_nascimento` já preenchidos e diferentes | TRAVA `DIVERGENCIA_CADASTRO` |
| e-mail resolve para 2 ou mais candidatos | TRAVA `EMAIL_AMBIGUO`, e nem chega a emitir código |
| candidatura/admissão fora de vivo | recusa neutra |

**A escrita alcança DUAS colunas e nada mais: `cpf` e `data_nascimento`.** `update` montado a partir
do corpo da requisição é veto automático. A ponte para `candidatos` continua sendo **gesto do time**:
esta porta NÃO chama `criarPreAdmissaoDoFunil` nem `aplicarLiberacao`.

## 6. Rotas e RBAC

A porta do candidato vive em `apps/backend/src/portal/portal-acesso-email.controller.ts`,
`@Controller("portal")`, `@Public()`, sem `PortalSessaoGuard`.

**A fila de travas e o destrave NÃO ganham controller novo.** Eles entram como handlers de
**`PortalPainelController`** (`apps/backend/src/portal/portal-painel.controller.ts`,
`@Controller("esteira/portal-painel")`), e a razão é dupla:
- está **fora do prefixo `portal/`** que a barreira allowlista;
- já é **reivindicado por nome** pelo menu `portal-links` (coringa `PortalPainelController.*`, em
  `domain/menus.ts`), cuja restrição é `NENHUMA`, logo **concedível a qualquer usuário**, que é
  exatamente o que o diretor pediu. **Sem `@Roles`**, como o resto da classe.

Isso satisfaz a condição C8 da auditoria **sem tocar em `domain/menus.ts`**, que outra sessão está
reescrevendo agora. Nenhuma operação nasce fail-open, porque o coringa já a alcança.

| rota | nota |
|---|---|
| `GET esteira/portal-painel/travas` | a fila, com filtros e ordenação |
| `POST esteira/portal-painel/travas/:id/destravar` | corpo `{ motivoCodigo }` de catálogo fechado, **sem texto livre** |

O destrave é **idempotente** (molde de `desbloquearLink`): destravar o que já está destravado não move
o carimbo. A tentativa **recusada** também vira linha de trilha.

## 7. Trilha

Eventos novos, a acrescentar em `PORTAL_EVENTOS` e os motivos em `PORTAL_MOTIVOS` **na mesma
entrega** (código fora do catálogo vira `motivo_codigo` nulo em silêncio):

`PORTAL_ACESSO_EMAIL_SOLICITADO` · `PORTAL_ACESSO_EMAIL_ENVIADO` · `PORTAL_ACESSO_EMAIL_RECUSADO`
`PORTAL_ACESSO_EMAIL_CODIGO_ERRADO` · `PORTAL_ACESSO_EMAIL_CONFIRMADO`
`PORTAL_IDENTIDADE_GRAVADA` · `PORTAL_ACESSO_TRAVADO` · `PORTAL_ACESSO_DESTRAVADO`
`PORTAL_ACESSO_DESTRAVE_RECUSADO`

Réguas duras:
- **`candidato_hash` continua sendo `sha256(pepper:"cpf":cpf)` e nada mais.** Hash de e-mail ali
  envenenaria `idx_portal_eventos_candidato`. Sem CPF verificado, a coluna fica **nula**.
- **`CAMPOS_PERMITIDOS` (`domain/portal-evento.ts`) NÃO é alargada.** Nada de `email`, `emailHash`,
  `codigo`, `nome`, `cpfInformado`, `valorEsperado`, `campoDivergente`. Os campos novos cabem nos que
  já existem (`motivoCodigo`, `janela`, `ate`, `tentativaN`, `autorId`).
- `PORTAL_ACESSO_DESTRAVADO` leva `autorId` da **sessão**, nunca do corpo.

## 8. E-mail do código: o que pode e o que não pode

**PROIBIDO no corpo e no assunto:** CPF, data de nascimento, **nome, nem o primeiro**, telefone,
cliente, cargo, operação, matrícula, id de admissão, id de candidato, qualquer link, qualquer token.
**PERMITIDO:** o código, o prazo de validade, a frase "se não foi você, ignore" e o contato do RH.
Assunto fixo e neutro.

**C9, a régua que não se contorna:** é **proibido expor o código fora do e-mail**, em qualquer
ambiente. Não na resposta, não em log, não em campo "para teste", não na homologação. Sem correio
configurado a porta não funciona, e isso é o correto, não um obstáculo.

## 9. Frontend

`apps/frontend/src/app/portal/page.tsx` ganha a escolha do caminho **antes** da
`TelaDeIdentificacao`. Componente novo `apps/frontend/src/components/portal/AcessoPorEmail.tsx`.

Estados: `ESCOLHA` -> `EMAIL` -> `CODIGO` -> `IDENTIDADE` -> (`LINK_ENVIADO` | `DADOS_RECEBIDOS` |
`TRAVADO`).

O caminho de hoje fica **byte a byte idêntico** quando o fragmento do link está presente: com
fragmento, a tela abre direto na identificação de sempre, sem passar pela escolha.

Tela do time: a fila de travas entra na tela do Gerenciador Do Portal, tabela no padrão único
(§A.12), ordenável (§A.29), filtros multiselect (§A.28/§A.37), larguras provadas (§A.20).
§A.11 travessão proibido, §A.24 title case, §A.35 nenhum `<select>` cru, §A.41 modal não fecha por
clique fora.

## 10. PENDÊNCIA OPERACIONAL: a allowlist da barreira (para quando o Portal ficar público)

O vhost da barreira (`~/ea-bridge-fernando/vt-soulanrh.conf` é o molde) é **fail-closed e libera por
caminho, nunca por prefixo**. As três rotas novas da porta de e-mail **não estão** na lista que o
desenho do caminho público do Portal levantou em 28/09, que previa `identificar`, `recuperacao`,
`credencial`, `confirmar`, `termo`, `dados-gi`, `documentos` e `vt-link`.

**Acrescentar, quando o vhost for escrito:**
```
/portal/acesso-email/solicitar
/portal/acesso-email/confirmar
/portal/acesso-email/identidade
```

**NÃO acrescentar** `esteira/portal-painel/travas*`: a fila e o destrave são tela do time, ficam fora
do `portal/` de propósito e **não devem** ser alcançáveis pela internet.

Registrado aqui porque o vhost é escrito por outra frente (infra, com o Fernando) e essa lista é
fácil de esquecer: sem ela a tela do candidato abre e as três chamadas devolvem 404, o que parece
defeito da tela e não é.

## 11. TRÊS CORREÇÕES DE PREMISSA, medidas contra o código construído

Registradas pelo coordenador depois da construção. Contrato que discorda da realidade é o próximo
retrabalho, então elas ficam aqui e não na memória de ninguém.

### 11.1 O motivo do destrave NÃO é catálogo novo: é gesto de RECONHECIMENTO

`DestravarAcessoDto` valida com `@IsIn(MOTIVOS_DA_TRAVA_DE_ACESSO)` e o serviço exige
`linha.motivoCodigo === motivoCodigo`. Ou seja, o valor pedido **não é a razão de destravar**, é a
confirmação de **qual trava** está sendo desfeita, e o servidor recusa quem errar. Não existe, e não
deve existir, um `MOTIVOS_DO_DESTRAVE`.

**Por que a guarda vale a frição:** ela pega o destrave com tela velha. A fila pode ter mudado entre o
carregamento e o clique, e destravar a trava errada é desfazer proteção sem saber. A recusa vira
`PORTAL_ACESSO_DESTRAVE_RECUSADO` na trilha. A tela mostra o motivo da trava e pede a confirmação, e
**não prefixa o valor**: prefixar transformaria a confirmação em clique vazio e a guarda deixaria de
guardar.

### 11.2 O estado `TRAVADO` da tela é RESERVA, e é assim que tem de ser

O serviço tem **UMA** recusa (401) para código errado, código vencido, bilhete morto, CPF inválido,
ficha anonimizada **e trava ativa**. Isso é a exigência O5 da auditoria (dois códigos apenas) e o
oráculo O9 (nunca dizer "este candidato está travado").

**Consequência:** o estado `TRAVADO` que a seção 9 lista **não é alcançável hoje**, porque não há sinal
que o distinga, e **criar esse sinal seria a violação**. Ele fica no código como reserva, e o passo da
identidade mostra a frase neutra do servidor mantendo o formulário com um "Começar de novo". Quem for
mexer aqui precisa saber que a inalcançabilidade é o requisito, não uma lacuna.

### 11.3 `situacao` da fila é valor ÚNICO, e a tela é múltipla por cima

`GET esteira/portal-painel/travas` recebe `situacao` como `ABERTA` ou `DESTRAVADA`, não lista. A tela
usa o `MultiSelect` compartilhado (§A.28) e **traduz**: nada selecionado e ambos selecionados não viram
parâmetro (porque os dois significam "não filtrar"), e exatamente um viaja no parâmetro.

Isto **não** é a §A.28 sendo contornada: o filtro é múltiplo na tela, o componente é o compartilhado, e
para um binário a lista com os dois valores é logicamente igual a filtro nenhum. Uma cláusula `IN` com
os dois elementos seria trabalho a mais para o mesmo resultado.

### 11.4 Duas armadilhas de integração que valem registro

- **`lib/api` reescreve o `message` de todo 401** para "Sua sessão expirou", que é frase de operador do
  EA. O candidato **não tem conta**, então a tela do Portal lê `data.mensagem` do corpo, que é
  justamente por isso que o backend o manda.
- **`POST travas/:id/destravar` recusa com status 200** (`{ destravado: false }`), porque destravar o
  que já está destravado é **idempotente**, não erro. Então "não deu erro" **não** significa
  "destravou": a tela tem de ler a flag. Quem consumir essa rota depois precisa saber disso.

## 12. POR QUE A TRAVA MORA NO CÓDIGO E NÃO SÓ NO TIPO

Achado do `tester`, e ele é fino o bastante para ficar escrito: **tirar um campo do tipo NÃO o tira da
resposta HTTP.** A verificação de propriedade excedente do TypeScript pega o literal de objeto, mas
**não** pega o campo montado por espalhamento condicional:

```ts
return { situacao, ...(x ? { emailMascarado: x } : {}) };  // compila, e o campo VAI para a rede
```

Foi por isso que a remoção do `emailMascarado` (condição 1 da segunda auditoria) foi travada em **três
lugares** e não em um: o tipo em `@ea/shared-types`, uma varredura do **fonte** do serviço e do
componente, e um teste **comportamental** que adultera a resposta com um domínio de terceiro e confere
a tela por ausência, inclusive por `not.toContain("@")`.

A régua geral, para as próximas frentes: **proibição de dado em resposta é régua de CÓDIGO.** O tipo
documenta a intenção; o teste é o que impede a reintrodução. Vale igual para a trilha, onde
`CAMPOS_PERMITIDOS` tem retrato exato (15 nomes) justamente para que alargar a allowlist quebre teste
antes de o dado estar gravado.

## 13. DÍVIDA DECLARADA: as travas são de FONTE, não de execução

Registro honesto do `tester`, e ele vale mais escrito do que esquecido.

As travas de co-ocorrência provam que a linha de trilha **existe no caminho**, não que ela
**executou**. Em particular, `travarAmbiguo` roda como **promessa solta** (`void ... .catch`), ou seja
o registro acontece **fora do ciclo da resposta**: falhando, o candidato recebe a mesma resposta única
e a trilha fica só com o `log.error`.

Fechar essa diferença exige um teste que **injete um duplo de `PortalTrilhaService` e conte chamadas**,
e hoje **nenhum spec do repositório instancia `PortalAcessoEmailService`**. É o próximo despacho
natural desta frente, e é o único jeito de provar "a linha foi gravada" em vez de "a linha está
escrita".

**Segunda dívida, menor:** o `select` dos homônimos de e-mail (`portal-acesso-email.service.ts:337`)
**não tem `ORDER BY`**. Com mais de `TRAVA_AMBIGUO_TETO` (20) homônimos, cada pedido pode travar um
subconjunto diferente, e a linha de trilha não diz quantos foram travados. Não é alcançável hoje (o
máximo medido em produção é 2 CPFs por endereço), mas é comportamento não determinístico esperando
uma base maior.

**Terceira dívida, da auditoria, registrada com o veto já levantado:** `BILHETE_MORTO` de UUID **bem
formado** ainda escreve linha de trilha, e o balde por bilhete **nunca o alcança**, porque a chave é o
hash do bilhete apresentado e cada UUID novo abre um balde novo com os créditos inteiros. O volume fica
limitado só pelo balde global por `req.ip`, que no Portal é um balde único (todo mundo chega como
`127.0.0.1` pelo proxy). O custo para quem ataca é gerar UUID.

**O conserto, para quem encostar aqui:** um balde **grosso da rota**, com chave fixa, portando a
escrita dessa linha. Não foi feito agora porque o caso alcançável hoje (formato inválido) já não
escreve nada, e este exige credencial bem formada sem ser válida, que não é de graça em volume.
