# Mapa de alcance: go-live do Portal em produção + V12 + autenticidade

Levantado pelo coordenador em 02/10/2026, ANTES do primeiro despacho (§A.39 passo 1, §A.40 regra 1).
Toda linha medida, com arquivo:linha. §A.11 sem travessão.

## 1. QUEM MAIS ESCREVE `documentos_admissao.estado` (a linha fixa do §A.40)

**CORRIGIDO APÓS A AUDITORIA (02/10/2026):** a enumeração original dizia "seis", e o método estava
errado: `grep update(documentosAdmissao)` **não vê** `insert().onConflictDoUpdate()` nem SQL cru, que é
como escrevem alguns dos gravadores. São **OITO** os que importam, e os dois que faltavam contornam o
`decidirDestino` e não limpam a marca:

| # | arquivo:linha | o que escreve | passa por `decidirDestino`? |
|---|---|---|---|
| 1 | `portal/portal-credencial.service.ts:1378` (`marcarEntregue`) | `AGUARDANDO_AUDITORIA` na coleta | não precisa (é a coleta, antes do veredito) |
| 2 | `portal/portal-credencial.service.ts:1261` (confirmação) | o destino do veredito | **SIM** (working tree) |
| 3 | `auditoria/auditoria.service.ts` (`auditarConjunto`) | o destino do veredito | **SIM** (working tree) |
| 4 | `esteira/esteira.service.ts:2248` (ASO, `anexarAso`) | `estadoDocumentoDeAuditoria(status)` | **NÃO** |
| 5 | `reauditoria/documento-arquivo.service.ts:228` | `PENDENTE` (descarte) | não precisa |
| 6 | `db/destrava-aguardando-auditoria.ts:111` | `INCONFORME` (script de destrava) | não precisa |
| 7 | `db/regras-esteira-vivas.ts:97-100` | `ENTREGUE` em LOTE | **NÃO**, e não consulta a marca |
| 8 | `db/regras-esteira-import.ts:59-63` | `ENTREGUE` em LOTE, por farol | **NÃO**, e não consulta a marca |

**A PERGUNTA CERTA NÃO É "passa por `decidirDestino`", É "concede ENTREGUE sem consultar a marca".** O
gate da autenticidade não é a marca, é a RETENÇÃO do `ENTREGUE`: um caminho não precisa limpar a marca
para derrotá-la, basta conceder `ENTREGUE` sem olhar para ela. Os itens 7 e 8 fazem isso.

**Severidade rebaixada, com medição:** os dois são rotinas de CARGA, chamadas só por `carga-0308.ts`,
escopadas por `admissao_id = ANY(<ids da importação>)`, sem `@Injectable` e fora de qualquer módulo
Nest. Não são caminho vivo: só correm quando o diretor importa. Ficam registrados porque é por eles que
o controle é contornável, e porque a próxima sessão vai ler esta tabela.

**A QUARTA PORTA É A LACUNA, e ela é FORA DO ESCOPO desta OST (§A.14).** O caminho do ASO
(`esteira.service.ts:2248`) escreve o estado sem `decidirDestino`, e `classificarAso`
(`auditoria.service.ts:891-922`) já MANDA os sinais de autenticidade para a IA mas **descarta**
`autenticidadeSuspeita` no retorno (`:916-921`). Consequência: um ASO suspeito de autenticidade
auto-aprova. Não tocamos a Esteira nesta frente (é território de outra sessão e não está na OST);
fica como decisão do diretor.

## 2. O V12: o que está escrito e o que falta

- Conserto do estado: `portal-credencial.service.ts:1248-1265`, via `decidirDestino`
  (`domain/auditoria.ts:55`). **Escrito, não publicado.**
- Guardas do `where` preservadas: `estado = AGUARDANDO_AUDITORIA` e `validado_por_id is null`
  (`:1242-1247`), ou seja, nunca por cima de veredito humano nem de documento já resolvido.
- `AGUARDANDO_AUDITORIA` é o que a tela chama "Em Análise" (`portal-documentos.service.ts:519`); o
  `ENTREGUE -> ACEITO` (`:515`) nunca era alcançado.
- **Falta:** a guarda do `campos: []` em `portal-credencial.service.ts:666-667` (o `||` deixa passar
  "veredito presente, zero campo" e grava linha vazia em `portal_conferencia`), e o teste da porta do
  Portal, que não existe (o canário
  `auditoria-autenticidade.portas-entregue.tester.spec.ts:23-28` registra a ausência por escrito).
- **NÃO tocamos** `portal-gi-gravacao.service.ts:76-79` (anulação deliberada, ratificada em
  DIARIO:16717). O arquivo compartilhado com a sessão do GI **não entra nesta frente**, então não há
  aviso a dar a ela.

## 3. A AUTENTICIDADE ESTÁ INERTE, e isto é a correção de premissa mais importante

Medido em `ai-service/app/gemini.py`: o bloco `_AUTENTICIDADE_SYSTEM` e o
`_bloco_sinais_autenticidade` são **CONDICIONAIS**. Só entram no prompt quando o backend manda
`sinaisAutenticidade`, que vem de `separarRegrasPorCategoria` sobre as regras de categoria
`AUTENTICIDADE` da tabela `regras_auditoria`.

A `0142` só cria a coluna `categoria` com default `CONFORMIDADE`. **Zero regra de autenticidade
existe.** Logo, publicar o que está escrito hoje entrega a frente **DORMENTE**: o modelo nunca é
instruído a desconfiar, `autenticidadeSuspeita` nunca vem true, e o documento sintético que o diretor
reprovou **continuaria aprovado**. Dizer "autenticidade ligada" sem mexer nisto seria relatório falso.

**O conserto:** o critério GENÉRICO que o diretor enumerou (brasão, selo, timbre, layout de órgão
emissor, print, PDF montado, formulário preenchido à mão, campo editado) **já está escrito dentro do
`_AUTENTICIDADE_SYSTEM`**. Ele passa a ser avaliado SEMPRE, e o bloco por tipo
(`SINAIS DE AUTENTICIDADE`, insumo do diretor, §A.9) continua existindo como REFINO por tipo de
documento. É a diferença entre "a IA não olha autenticidade" e "a IA olha com o critério geral, e
olhará melhor quando o diretor der o critério por tipo".

**Alcance disso, honesto:** passa a valer para TODA auditoria que usa `auditar_documento`, inclusive a
da Esteira. Na Esteira, `classificarAso` descarta o sinal (item 1), então lá nada muda de
comportamento. Onde muda é no Portal e no `auditarConjunto`: documento suspeito **deixa de
auto-aprovar** e espera humano. É o efeito pedido ("hoje não há validação humana no caminho feliz"),
e o custo é a régua não fechar sozinha nesses casos, que é justamente a trava desejada e já está
coberta pelo tester `regua-autenticidade-nao-fecha.tester.spec.ts`.

## 4. A MARCA É ESCRITA E NUNCA LIDA (a segunda lacuna)

`grep conferirAutenticidade` no frontend e no `apps/portal-app`: **zero**. A marca e o motivo vão para
o banco e nenhuma tela os mostra. O humano vê o documento na fila como "Aguardando auditoria", com a
`observacao` do veredito de CONFORMIDADE, que diz que o documento está bom. Ele não sabe que a parada
é suspeita de autenticidade nem qual foi o sinal.

A tela da conferência humana é `components/esteira/AuditoriaDocsModal.tsx` (estado
`AGUARDANDO_AUDITORIA` em `:189`, ação `validar-humano` em `:426`), alimentada por
`GET /esteira/admissao/:id`, montado em `esteira/esteira.service.ts`.

**Duas saídas, e a escolha tem consequência de escopo:**
- **(a) o motivo entra na `observacao`** do próprio veredito, prefixado, dentro dos arquivos que esta
  OST já toca. Zero mudança em `esteira.service.ts` (código validado, compartilhado), zero campo novo
  no contrato. O humano lê o sinal na linha que já existe. **É a adotada**, porque a conferência
  humana só funciona se o humano souber o quê conferir.
- **(b) campo próprio + badge na modal**, que exigiria tocar `esteira.service.ts` e o contrato. Isso
  alcança código validado de outra frente, então cai na §A.26 e **fica como proposta ao diretor**, não
  se constrói agora.

A saída do suspeito pelo humano já existe e está escrita: `validacao-humana.service.ts:83-96` zera
`conferir_autenticidade` e o motivo ao aprovar à mão (precedência humana; a reauditoria automática
nunca limpa a marca).

## 5. Migrations: a `0142` entra, a `0134` continua fora

- `0142`, `when = 1790646008719`, **acima** da marca d'água dos dois bancos (`1790646007719`). Aplica.
  É aditiva: dois `ADD COLUMN IF NOT EXISTS` com default e um `CREATE TYPE` idempotente.
- `0134` (acesso por e-mail), `when = 1790646000719`, **abaixo** da marca. O Drizzle a pula em
  silêncio. **Fora desta OST** (a porta de e-mail espera o SendGrid, decisão do diretor).
  Consequência medida que o diretor precisa saber: a porta responde **404**, e o aviso calmo de
  manutenção só dispara em **503** (`lib/portal-acesso-email.ts:128-131`). Quem tentar o e-mail no
  domínio público vê erro vermelho genérico, não o aviso de manutenção. Conserto de uma linha,
  **proposto, não construído**.

## 6. Go-live: o que muda e o que NÃO muda

- Troca do túnel: `-R 127.0.0.1:3121` passa a `-R 127.0.0.1:3021` em
  `~/.config/systemd/user/ea-portal-tunnel.service`. A homologação continua existindo na 3120/3121,
  só deixa de ser o alvo do endereço público.
- `PORTAL_LINK_BASE_URL` e `ALLOWED_ORIGINS` no `.env` do backend de produção.
- **O backend de produção roda de `~/apps/ea-release-portal`** (não do checkout), HEAD `cd15c19`.
  Publicar o V12 exige levar os arquivos para lá e reiniciar `ea-backend`, que é compartilhado com as
  sessões do GI e do Pandapé. Restart coordenado pelo diretor (§A.14).
- O Caddy da VM **não muda** e segue sem access log (regra permanente).
