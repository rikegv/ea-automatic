# MAPA DE ALCANCE, Portal: acesso por e-mail para candidato sem CPF

Documento de INVESTIGAÇÃO (§A.27/§A.39 passo 1), escrito ANTES de qualquer linha de código.
Auditado pelo `seguranca` antes do primeiro despacho de construção (§A.40, regra 1).

## 1. A PREMISSA DA OST ESTÁ INVERTIDA (medido, não suposto)

A OST diz: "esses candidatos passam pela triagem, avancam, chegam a admissao, e NAO CONSEGUEM
ACESSAR O PORTAL pra entregar documento."

**Eles não chegam à admissão.** A ponte A&S -> esteira recusa explicitamente:

`apps/backend/src/as/candidatos/candidatos.service.ts:1894-1899`
```ts
const cpf = normalizeCpf(ponte?.candidato.cpf ?? "");
if (!isValidCpf(cpf)) {
  throw new BadRequestException(
    "Este candidato não tem CPF válido. Preencha o CPF antes de enviar para admissão.");
}
```

O comentário acima dessa guarda é deliberado: "TRAVA SÓ O GESTO DE ENVIO, e não o funil: candidato
entra e anda no funil sem CPF (o cadastro o faz opcional, de propósito). É AQUI, no avanço para a
esteira, que o dado passa a ser exigido." A régua de duplicidade (`travarDuplicidadeDeCpf`,
`uq_admissao_cpf_vaga_viva`) se apoia no CPF.

**Consequência:** a população do cenário 2 DENTRO do Portal é vazia por construção. O candidato sem
CPF está travado ANTES da admissão, não no Portal.

## 2. AS TRÊS PAREDES ESTRUTURAIS

**Parede A, `candidatos.cpf` é chave primária NOT NULL** (`db/schema/tables.ts:445`) e
`admissoes.candidato_cpf` é FK para ela (`:755-757`). Não existe admissão sem CPF.

**Parede B, a identidade provisória existe e é PROIBIDA para vivo.**
`domain/identidade-provisoria.ts` gera `PROV` + 7 base36, mas `podeReceberIdentidadeProvisoria`
só diz sim para `FAROL_COM_IDENTIDADE_PROVISORIA = {DECLINOU, RESCISAO}`. Medido no banco: 48
admissões com CPF `PROV%`, **todas DECLINOU**, em produção e em homologação. A trava é o que mantém
o provisório fora de fila, KPI e envelope.

**Parede C, a entrada do Portal é ESCOPADA PELO LINK.** `POST /portal/identificar`
(`portal.controller.ts:53`) exige `linkToken` (bilhete Ed25519, TTL 72h, `typ=portal-link`, carrega
`admissaoId` + `jti`), verifica a assinatura ANTES de tudo (`portal-identidade.service.ts:894`) e
compara CPF+nascimento **da admissão daquele bilhete**, nunca por busca global
(`portal-identidade.service.ts:1629-1637`). Não há e-mail em lugar nenhum da identificação.

## 3. ONDE O DADO REALMENTE VIVE

| dado | tabela.coluna | nulo? |
|---|---|---|
| candidato do funil | `as_candidatos` (PK `id` uuid) | `cpf` **nullable**, `email` nullable, `data_nascimento` nullable |
| candidato da esteira | `candidatos` (PK `cpf`) | `email` nullable, `data_nascimento` nullable |
| ligação | `admissoes.candidato_cpf` -> `candidatos.cpf` | NOT NULL |
| funil -> esteira | `as_candidaturas.candidato_id` -> `as_candidatos.id`; `as_candidaturas.admissao_id` -> `admissoes.id` | `admissao_id` nullable |

A importação por planilha (`as/candidatos/candidatos-import.service.ts:259-269`) grava em
`as_candidatos` e classifica a linha sem CPF como `"SEM_CPF"`; grava e-mail.

**O correio lê `candidatos.email` e mais lugar nenhum** (`portal-envio.service.ts:470`). O e-mail
que a planilha gravou em `as_candidatos.email` é hoje **inalcançável pelo correio**.

**Medição da população (29/09/2026):** produção `as_candidatos` = **0 linhas**; homologação = 13, das
quais 5 sem CPF e com e-mail. Os "397 candidatos" da OST **não estão em nenhum banco**: são a
planilha ainda não importada. `candidatos`: 2.695 em homologação, 2.694 com e-mail, 2.533 com data de
nascimento.

## 4. O CORREIO, e o que falta

`portal/portal-correio.service.ts` está **implementado e completo**: Gmail REST API, conta de serviço
com delegação de domínio (JWT RSA assinado à mão), escopo `gmail.send`, MIME montado à mão, anti
header-injection, logs mordaçados (§A.6). Exige três variáveis:
`PORTAL_CORREIO_SA_EMAIL`, `PORTAL_CORREIO_PRIVATE_KEY`, `PORTAL_CORREIO_REMETENTE`.

**Estado medido: as três estão AUSENTES no `.env` local e no `.env` da homologação.** `configurado()`
devolve false e todo envio recusa `CANAL_INDISPONIVEL` (`portal-envio.service.ts:152`). Não há SMTP,
SendGrid nem fallback, e um teste-guardião
(`portal-sem-chave-e-sem-vazamento.tester.spec.ts:171`) reprova quem ler a chave em mais de um lugar.

**O que a fábrica NÃO resolve sozinha:** a delegação de domínio no Workspace é ato de administrador
(autorizar o Client ID da conta de serviço no escopo `gmail.send`) e a caixa remetente precisa
existir. A fábrica escreve o código, o teste e a instrução; ligar depende de insumo do diretor.

## 5. O QUE JÁ EXISTE E SE REUSA (não recriar)

- **Teto de identificação:** 5 tentativas / 15 min, 3 estouros em 24h -> suspensão de 24h gravada em
  `portal_links.suspenso_ate`. Três baldes no `ThrottlerStorage`, chaveados por HASH com
  `PORTAL_LOG_PEPPER`, nunca pelo CPF cru (`portal-identidade.service.ts:167-188, 884-925, 1049-1064`).
  `escaladaDevida()` só escala com link vivo E credencial errada.
- **Trilha:** `portal_eventos` (tipo, `candidato_hash` = sha256(pepper+cpf), `ip_hash`, `ua_hash`,
  `resultado`, `motivo_codigo`, `dados` jsonb). IP completo só em `portal_eventos_ip`, truncado aos 90
  dias. **Nunca CPF, nunca e-mail, nunca URL.**
- **Sessão:** bilhete Ed25519 `typ=portal`, TTL 30 min limitado pelo que resta do link
  (`minutosDaSessao`), chave própria `PORTAL_SESSION_PUBLIC_KEY`, fail-closed sem chave.
- **Destrave (hoje):** `POST esteira/pendencias-portal/:admissaoId/:tipoDocumentoId/zerar-tentativas`,
  `@Roles("MASTER","SUPER_ADMIN")` (`portal-pendencias.controller.ts:58-66`). Devolve o teto de
  REPROVAÇÃO DE DOCUMENTO, não a suspensão do link.
- **Precedente para "qualquer usuário do ADM":** remover o `@Roles` e deixar a operação reivindicada
  por um MENU concedível (`restricao: NENHUMA`). Usado em todos os catálogos de A&S
  (`segmentos-admin.controller.ts:8-26`) e no próprio `portal-links`. Atenção: o `MenuGuard` é
  **fail-open para operação não reivindicada**, então tirar o papel SEM reivindicar no menu ABRE a rota.

## 6. O DESENHO PROPOSTO (uma porta, duas saídas)

A porta nova identifica por e-mail e **não é escopada por link**, porque não existe link sem admissão.
Ela substitui o par (link + CPF + nascimento) por (e-mail + código enviado ao próprio e-mail + CPF +
nascimento). O código de verificação é o que prova a posse do e-mail; CPF+nascimento seguem sendo
exigidos, então o fator "algo que ele sabe" **não é removido, é somado**.

Fluxo:
1. `POST portal/acesso-email/solicitar` { email } -> **sempre a mesma resposta**, exista ou não o
   e-mail (anti-enumeração). Se existir e for elegível, emite código de 6 dígitos e envia pelo correio.
2. `POST portal/acesso-email/confirmar` { email, codigo } -> devolve um bilhete curto de identificação
   (não a sessão do Portal) + os dados que a plataforma já tem, **mascarados** (nome parcial), nada de
   CPF nem de documento.
3. `POST portal/acesso-email/identidade` { bilhete, cpf, dataNascimento } ->
   - valida dígito verificador do CPF;
   - **trava de divergência**: se houver dado já registrado que discorde (nome, CPF, nascimento),
     grava a TRAVA e recusa, sem dizer qual campo divergiu;
   - não divergindo, grava CPF+nascimento no `as_candidatos`;
   - **se existir admissão viva para aquele CPF**, emite a sessão do Portal (saída 1: abre o Portal);
   - não existindo, devolve "recebemos os seus dados" (saída 2: o time segue).

**O que NÃO se constrói, e é decisão do diretor:** o CPF chegando **não** dispara o envio para a
admissão. Esse gesto consome posição de vaga e tem porta declarada com Master e aceite de reentrada
(a "terceira porta fechada", `candidatos.service.ts:1905-1920`). Abri-la por um candidato autenticado
por e-mail seria uma quarta porta não declarada.

## 7. TRAVA DE DIVERGÊNCIA, FILA E DESTRAVE

- Trava por candidato do funil (`as_candidatos.id`), não por CPF: o CPF pode ser justamente o dado
  em disputa.
- Estado durável em tabela nova `portal_acesso_travas` (travado_em, motivo_codigo, tentativas,
  destravado_em, destravado_por_id, observacao). **Sem PII**: nem o valor informado, nem o esperado.
- Enquanto travado, a porta de e-mail recusa para aquele candidato, com a mesma frase neutra.
- Destrave: rota fora do prefixo `portal/`, sem `@Roles`, reivindicada por menu concedível, trilha
  obrigatória com autor, data e motivo.

## 8. ALCANCE, o que esta frente PODE quebrar

| ponto | risco | mitigação |
|---|---|---|
| `POST portal/identificar` | nenhuma alteração prevista | caminho byte a byte idêntico; teste de regressão |
| `portal_links` / `suspenso_ate` | a porta nova **não** é escopada por link, então não tem `jti` para suspender | balde e trava próprios, por e-mail hasheado e por candidato |
| `MenuGuard` fail-open | rota nova sem `@Roles` e sem reivindicação = ABERTA | reivindicar a operação no menu no MESMO commit |
| barreira/allowlist do vhost | prefixo `portal/` é allowlistado; a rota de destrave NÃO pode ficar lá | destrave sob `esteira/`, como o precedente |
| `as_candidatos.cpf` passa a ser escrito pelo candidato | duplicidade com um `as_candidatos` que já tenha aquele CPF | checar antes; havendo outro, TRAVA em vez de gravar |
| `packages/shared-types/src/index.ts` | **39 linhas de outra sessão** (MENU_RESTRICAO) | dono único = coordenador; commit por recorte de blob |
| `domain/menus.ts` | **modificado por outra sessão** | coordenador escreve; conferir antes, não sobrescrever |

## 9. PERGUNTAS QUE O `seguranca` DEVE RESPONDER SOBRE ESTE MAPA

1. A porta por e-mail, **não escopada por link**, é aceitável como chave de acesso do Portal? O que
   ela precisa ter para não ser mais fraca que a porta de hoje?
2. Emitir sessão do Portal a partir dela é aceitável, ou a sessão só deve nascer do link?
3. Enumeração de e-mail: a resposta única basta, ou precisa de tempo constante e de teto por e-mail?
4. O código de verificação: TTL, tamanho, tentativas, armazenamento (hash?), e o que impede força bruta.
5. "Puxar os dados que já tem" antes da identificação completa vaza dado? O que pode aparecer na tela?
6. A trava de divergência pode virar oráculo ("este CPF já existe")? Como recusar sem informar.
7. O que NÃO pode entrar na trilha, no corpo do e-mail e no log.
