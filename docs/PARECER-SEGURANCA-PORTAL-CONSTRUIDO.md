# Parecer De Segurança: O Portal Do Candidato Construído

**Veredito: VETADO.** O veto é de PRODUÇÃO, não de construção. A construção está liberada e o
`sudo` está aprovado. O que não passa é subir isto ao ar antes de três itens, listados na seção 5.

**Quem auditou:** agente `seguranca`, sem poder de escrita (§A.39). **Régua:** §A.6, §A.11, §A.24,
§A.38. **Método:** adversarial, tentando provar a violação, com arquivo e linha.
**Escopo:** o construído desde o parecer anterior, tudo em working tree, nada commitado.
**Data:** 18/09/2026. **Gravado pelo coordenador**, que é quem tem escrita, a partir do parecer do
agente, com os três achados mais pesados reconferidos por ele (seção 8).

**Correção de premissa, e ela importa para o próprio recorte desta auditoria:** o coordenador listou
os arquivos do `ai-service` e quatro arquivos de domínio do backend. Existe também
`apps/backend/src/portal/` inteiro, com 16 arquivos, incluindo o controlador, o guard de sessão, a
assinatura V4 e o serviço de 593 linhas que orquestra tudo. Essa camada foi auditada junto, e é nela
que mora a maior parte do que se decide.

---

## 1. O Que Foi Medido, Não Deduzido

| medida | resultado |
|---|---|
| testes do backend, portal | 98 passaram, 9 arquivos, executados nesta auditoria |
| testes do leitor, portal | 45 passaram, executados nesta auditoria |
| leitor provisório, usuário | roda como `henrique` (PID conferido) |
| leitor provisório, alcance | LÊ a credencial unificada da operação (`test -r`, verdadeiro) |
| URL assinada em banco ou log | zero ocorrências, varredura de `insert`, `update` e `set` |
| CPF em log | zero ocorrências, 7 linhas de log auditadas uma a uma |
| segredo dentro do que o roteiro copia | zero arquivos de credencial em `apps/ai-service/app/` |

A segunda e a terceira linhas são a prova de que a exigência 4 está ABERTA hoje, e são o motivo pelo
qual o `sudo` não é formalidade.

---

## 2. As Dez Exigências, Uma A Uma

| # | exigência | estado | evidência |
|---|---|---|---|
| 1 | Conta dedicada de escrita, chave nunca no leitor | **Fechada Em Código** | `portal-armazenamento.service.ts:55-67` (dois pares distintos de credencial); `portal_bucket.py:42` (escopo `devstorage.read_only`); zero ocorrências de `PORTAL_GCS_ESCRITA_*` no `ai-service` |
| 2 | Não sobrescrita, tipo e faixa de tamanho assinados | **Fechada** | `portal-credencial.ts:186-197`; `gcs-assinatura-v4.ts:130,143,150`; `gcs-assinatura-v4.spec.ts:47-99` prova que alterar ou omitir cada um muda a assinatura |
| 3 | Quantidade e ritmo na emissão, mais teto de extrações | **Fechada** | `portal-credencial.ts:141-169`; `portal-credencial.service.ts:198-231` (trava dentro da transação); `:583-588` (contador de extração); `0116_portal_caminho_do_arquivo.sql:33-73` |
| 4 | Leitor em usuário de sistema próprio, com limites | **Aberta Hoje, Fecha Com O Sudo** | medido: processo sob `henrique`, credencial da operação legível; `ea-portal-leitor.system.service:16-18,44-60` traz `User=ea-portal`, `ProtectSystem=strict`, `InaccessiblePaths=-/home`, `CapabilityBoundingSet=` vazio |
| 5 | Processo filho com morte dura no tempo limite | **Fechada** | `portal_processo.py:60-104`, contexto `spawn` e não `fork`, `terminate` seguido de `kill`, `emissor.close()` para que a morte do filho vire erro e não espera |
| 6 | Checagem de conteúdo ativo | **Fechada** | `portal_conteudo_ativo.py:79-128`, duas varreduras (marca crua e catálogo já descomprimido); ligada como RECUSA em `portal_inspecao.py:75-77`, antes da contagem de páginas |
| 7 | Entrada isolada do prontuário, recusado apagado ativamente | **Parcial** | isolamento fechado (`routers/portal.py:9-11`, o leitor não importa a staging); remoção NÃO existe: `portal-armazenamento.service.ts:216-223` só registra e devolve `false` |
| 8 | Teste de que a credencial não lê e não lista, EXECUTADO | **Aberta** | o único artefato é `portal-credencial.tester.spec.ts:168-169`, que afirma `permiteLeitura` e `permiteListagem` falsos. Ver a seção 3 |
| 9 | Pedido ao Fernando reescrito | **Fechada, Com Ressalva** | as sete cláusulas estão presentes, mais as três perguntas do objeto recusado. A ressalva é o prazo, seção 5, veto V1 |
| 10 | Tipo de conteúdo corrigido por nós depois da leitura | **Fechada** | `portal-credencial.service.ts:458-472` usa o `mimeDetectado` dos magic bytes; `portal-armazenamento.service.ts:169-200` reescreve com a conta de LEITURA, nunca com a do candidato |

### A Exigência 8 Não Está Fechada, E É Preciso Ser Duro Aqui

`portal-credencial.tester.spec.ts:168-169` afirma que dois campos booleanos do nosso próprio objeto
valem `false`. Esses campos (`portal-credencial.ts:102-104`) não são consumidos por nada que converse
com o armazenamento: eles são documentação com forma de teste. O `gcs-assinatura-v4.spec.ts` não tem
nenhum caso de `GET` nem de listagem.

A exigência pedia EXECUTADO e não SUPOSTO, e o que existe é exatamente o suposto. A prova de verdade é
tentar `GET` e tentar listagem com a conta de escrita contra o balde real e registrar o 403, e ela é
impossível hoje porque nem a conta nem o balde existem. Isso não é falha de quem construiu, é um item
que permanece aberto por dependência externa, e é portão de entrada em produção.

### A Ressalva Da Exigência 1, Que É De Documentação E Mesmo Assim Importa

`portal_bucket.py:10-11` afirma, por escrito, que o leitor usa "a mesma service account (a credencial
Google unificada do Drive e do Vertex, §A.5)". O ambiente magro contradiz isso: ele aponta um caminho
ABSOLUTO para uma credencial dedicada, justamente para não cair na compartilhada. O código está certo
e o comentário está errado, e o comentário é a instrução que a próxima pessoa segue. Corrigir o texto.

---

## 3. O Roteiro Privilegiado, Linha A Linha

**Parecer: pode ser executado como está.** Ele faz somente as quatro coisas que o documento do
`devops` afirma, e nada além.

| passo | linhas | confere com o documento |
|---|---|---|
| usuário de sistema `ea-portal`, sem console e sem casa | `27-32` | sim |
| cópia do código em `/opt/ea-portal-leitor` com ambiente virtual próprio | `35-49` | sim |
| ambiente magro em `/etc/ea-portal-leitor/leitor.env`, `0640 root:ea-portal` | `55-64` | sim, com a ressalva (a) abaixo |
| unidade de sistema na 8020 de loopback | `67-70` | sim |

**Não encosta nos serviços da operação.** Não há uma única referência a `ea-ai-service`,
`ea-backend`, `ea-frontend`, `ea-proxy` nem às de homologação. O `systemctl` aparece três vezes, nas
linhas `68-70`, sempre sobre a unidade nova.

**Não copia segredo.** As linhas `42-43` apagam `credentials*.json` e `.env` da cópia, e foi
confirmado que `apps/ai-service/app/` não contém hoje nenhum arquivo de credencial. O `.env` e o
`credentials.json` da operação ficam fora do que é copiado, por estarem um nível acima.

**Nada destrutivo fora do alvo.** O único `rm -rf` está na linha `36`, sobre
`/opt/ea-portal-leitor/codigo`. `DESTINO` é fixo na linha `21` e NÃO é sobrescrevível por ambiente, ao
contrário de `REPO` e `ORIGEM_ENV` (linhas `19-20`). Não há caminho em que o roteiro apague algo do
repositório, da casa do diretor ou da operação.

### Três Correções Registradas, Nenhuma Delas Impede O Sudo

**(a) Ele COPIA o ambiente magro, não move.** A linha `57` usa `install`, então o `.env` com o token
interno continua existindo em `/home/henrique/apps/ea-portal-leitor/.env` depois do `sudo`. O segredo
passa a viver em dois lugares. Não é vazamento (mesmo dono, `0600`, e `/home/henrique` é `0750`), mas
a frase "move o ambiente magro" é falsa e deve ser corrigida, ou o roteiro deve mover de fato.

**(b) O diretório da credencial nasce `0755` e o roteiro não protege a chave que virá.** A linha `55`
cria `/etc/ea-portal-leitor` como `0755 root:root`, e a linha `60` reescreve o caminho da credencial
para dentro dele. O roteiro nunca coloca a chave lá e nunca define o modo dela. No dia em que a conta
dedicada existir e alguém copiar o arquivo com o umask padrão de uma sessão de raiz, a chave privada
nasce `0644`, legível por todo mundo. É um vazamento a um passo manual de distância, e o conserto é
uma linha: o roteiro deve criar o destino já com `0640 root:ea-portal`, ou o passo a passo deve trazer
o `chown` e o `chmod` escritos.

**(c) O ambiente virtual definitivo é instalado sem trava de versão.** A linha `47` roda
`pip install` sobre o `pyproject.toml`, cujas doze dependências são todas `>=` e nenhuma fixada. O
`uv.lock` é copiado na linha `40` e nunca usado. A instância definitiva pode receber versões de
biblioteca que nunca foram testadas, buscadas na rede, no momento da instalação, como raiz. Instalar
pelo `uv` com o lock, ou por um arquivo de requisitos com hash, elimina isso.

**Observação menor, sem ação obrigatória:** a linha `59` reescreve a staging para
`/var/lib/ea-portal-leitor/staging`, que o roteiro não cria (a linha `52` cria só o pai). O caminho do
portal nunca escreve em disco, então isto é higiene, não exposição.

---

## 4. O Que Cai E O Que Permanece Depois Do Sudo

**A tese do coordenador está CORRETA no ponto principal, e ela é confirmada com medida.** A exigência
4 era a que travava, ela está aberta hoje e o `sudo` a fecha. A prova de que ela está aberta não é
teórica: o leitor provisório roda sob o usuário do diretor e foi confirmado que esse usuário lê a
credencial unificada de Drive e Vertex da operação. Enquanto for assim, o isolamento é cosmético, que
é exatamente o que o parecer anterior disse. A unidade de sistema corrige isso com usuário próprio,
sistema de arquivos somente leitura, `/home` inacessível, nenhuma capacidade e faixas privadas negadas.

**Cai com o sudo:** a exigência 4.

**NÃO cai com o sudo, e é por isso que o veredito continua VETADO:**

1. a exigência 8, que depende do balde e da conta existirem;
2. a metade da exigência 7 que apaga o recusado, que depende de uma permissão que só o diretor concede;
3. a retenção da área de entrada, que é achado novo desta auditoria (veto V1, abaixo);
4. o balde global de ritmo, furo que os próprios autores declararam aberto em
   `portal.controller.ts:18-24` e chamaram de veto de saída;
5. o achado V3 abaixo, que é estrutural e ninguém tinha registrado.

---

## 5. Os Três Vetos De Produção

### V1. A Área De Entrada Retém PII Por 30 Dias, E A Régua Da Casa É 48 Horas

`docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md:35` pede ciclo de vida de **30 dias**. A §A.4 (F2) e a §A.6
dizem **staging efêmera, expurgo no fechamento, TTL 48h**. O balde de entrada é staging: guarda o
documento cru do candidato, que é dado pessoal sensível, e nada o remove quando o documento é
confirmado, porque ninguém tem permissão de remover (exigência 7).

São duas divergências, não uma: o prazo é quinze vezes o da constituição, e o expurgo no fechamento
simplesmente não existe. O agravante é de oportunidade: esse número está prestes a ser enviado a um
terceiro. Corrigi-lo agora custa uma linha da carta; corrigi-lo depois custa um segundo pedido.

**O que se pede:** ou a carta passa a pedir 48h com expurgo no fechamento, ou o diretor registra a
exceção com o motivo, no documento de desenho, e não implícita num número dentro de uma carta.

### V2. A Exigência 8 Vai Ao Ar Sem Ter Sido Executada

Detalhada na seção 2. **O que se pede:** no dia em que o balde e a conta de escrita existirem, tentar
`GET` e tentar listagem com a credencial de escrita, registrar o 403 das duas, e anexar a evidência
aqui. Antes disso, não sobe.

### V3. O Isolamento Do Leitor É Propriedade De CONFIGURAÇÃO, Não De TOPOLOGIA

`main.py:28` inclui o roteador do portal **incondicionalmente**. Isso significa que a instância da
OPERAÇÃO (porta 8000), que carrega a credencial unificada e a do banco, também serve
`POST /portal/ler`. Hoje ela responde 503 porque `PORTAL_BUCKET` está vazio lá
(`routers/portal.py:81-85`), e por isso o risco é latente e não atual.

O problema é o modo de falha: uma variável de ambiente preenchida no lugar errado desfaz a exigência 4
inteira, **em silêncio**, e nada quebra quando isso acontece. Todo o trabalho do `devops`, o usuário
próprio, o `/opt`, as faixas de rede negadas, passa a ser contornável por uma linha de `.env`. É o
mesmo padrão de dano da §A.33: nada falha, e por isso ninguém descobre.

**O que se pede:** uma guarda no próprio caminho do leitor, que se recuse a servir `/portal/ler`
quando o mesmo processo tiver banco ou Drive configurados. Assim o isolamento falha alto em vez de
sumir baixo. É uma condição, não uma refatoração.

---

## 6. O Que Passou, E Merece Ser Dito

A auditoria tentou provar violação nos pontos de sempre e não achou:

- **URL externa:** nunca persistida e nunca logada. Varredura de `insert`, `update` e `set` no módulo
  inteiro devolve zero. `portal-credencial.service.ts:271-282` devolve ao navegador e esquece;
  `gcs-assinatura-v4.ts` não tem uma linha de log.
- **CPF e dado pessoal:** transitam só em memória até o leitor
  (`portal-credencial.service.ts:410-432`), viram hash com pepper obrigatório na trilha
  (`portal-trilha.service.ts:43-51`, falha fechada sem pepper), e o resto é descartado por allowlist
  (`portal-evento.ts:112-129, 220-228`). A allowlist que DERRUBA campo desconhecido, em vez de proibir
  campo conhecido, é a escolha certa e é a razão de não haver vazamento por campo novo.
- **O valor extraído pela IA:** é PII pura e está tratado como tal. Não é persistido, não entra em
  evento, não entra em mensagem de erro, e é DESCARTADO inteiro quando o leitor não marca que exige
  confirmação humana (`portal-credencial.service.ts:499-505`). Abster-se como comportamento seguro.
- **Auth e RBAC:** as rotas são públicas por necessidade (o candidato não tem crachá) e protegidas por
  guard local fail-closed com segredo próprio, sem queda para o segredo do sistema
  (`portal-sessao.guard.ts:46-50`). O token não carrega CPF nem nome, e a admissão e o link vêm dele e
  nunca do corpo (`portal.controller.ts:39-47`). Nenhuma rota de administração é alcançada.
- **O estado escrito no documento é `AGUARDANDO_AUDITORIA` e não `ENTREGUE`**
  (`portal-credencial.service.ts:540-554`). Foi a decisão certa e evitou fechar a frente de Auditoria
  de uma admissão inteira sem ninguém ter olhado o documento. Fica registrado porque é o tipo de
  acerto que só aparece quando alguém procura o erro.

**Duas imprecisões de documentação, sem efeito de segurança, para corrigir junto:**
`0116_portal_caminho_do_arquivo.sql:79` cita `portal/portal-eventos.ts`, que não existe, e afirma que a
gravação ABORTA diante de chave proibida. O arquivo real é `domain/portal-evento.ts` e ele DESCARTA por
allowlist, que é mais forte, e não aborta. E `portal-evento.ts:128` mantém `caminho` na lista de campos
permitidos, hoje sem nenhum chamador: num arquivo cuja razão de existir é manter `objeto` fora da
trilha, um campo chamado `caminho` é um convite. Remover enquanto ninguém o usa.

**Observação para o `tester`, que não é objeção de segurança:** a marca `AA` em
`portal_conteudo_ativo.py:53` pode recusar PDF legítimo, porque ações adicionais aparecem em arquivos
de alguns geradores comuns. O custo cai sobre o candidato, que não entende por que o documento dele foi
recusado. Vale medir contra documentos reais antes de ir ao ar.

---

## 7. O Que Fica Pendente, Em Ordem

1. **Executar o `sudo`.** Aprovado como está. As três correções do roteiro (seção 3) entram antes ou
   logo depois, e a **(b)** precisa estar feita ANTES de a chave dedicada ser colocada na máquina.
2. **Decidir o V1**, que é decisão do diretor e altera a carta ao Fernando antes de ela sair.
3. **Implementar a guarda do V3**, que é condição de subida e não depende de ninguém de fora.
4. **Separar o balde global de ritmo** do da operação interna, furo que os autores já declararam.
5. **Quando o balde e a conta existirem:** executar a prova da exigência 8 e anexá-la aqui, e então
   fechar a metade da exigência 7 que apaga o recusado.
6. **Corrigir as três imprecisões de texto:** o comentário de `portal_bucket.py:10-11`, o de
   `0116_portal_caminho_do_arquivo.sql:79` e o campo `caminho` em `portal-evento.ts:128`.

**Reauditar quando:** os itens 2, 3 e 5 estiverem prontos. O veto cai contra evidência, não contra
declaração.

---

## 8. A Consolidação Do Coordenador: O Que Ele Reconferiu Com As Próprias Mãos

§A.39 passo 4: consolidar é conferir, não carimbar. Os três achados de maior consequência foram
reabertos pelo coordenador, no arquivo, depois do parecer:

| achado | conferido |
|---|---|
| **V3**, roteador do portal montado na instância da operação | **CONFIRMADO.** `apps/ai-service/app/main.py:28` traz `app.include_router(portal.router)` sem nenhuma condição, no mesmo bloco dos roteadores de auditoria, Drive e kit |
| **(b)**, diretório da credencial nasce aberto | **CONFIRMADO.** `instalar-portal-leitor.sh:55` traz `install -d -o root -g root -m 0755 /etc/ea-portal-leitor`, e a linha `60` aponta o caminho da credencial para dentro dele |
| **(a)**, o ambiente magro é copiado e não movido | **CONFIRMADO.** `instalar-portal-leitor.sh:57` usa `install`, que copia. O original permanece |
| **V1**, os 30 dias na carta | **CONFIRMADO.** `docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md:35`, e a §A.6 diz 48h |

**Gate do coordenador, executado à parte da auditoria:** 55 testes de domínio do Portal no backend e
45 no leitor, todos verdes, e `tsc --noEmit` do backend limpo. O número de 98 do agente cobre os 9
arquivos de teste da camada `apps/backend/src/portal/` inteira; o de 55 cobre os 4 arquivos de
domínio. Não há divergência entre os dois, são recortes diferentes.
