# Portal Do Candidato: O Isolamento Do Leitor (Camada De Infraestrutura)

**O que é:** a construção da **exigência 4** da seção 6 do `DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md`,
o leitor em usuário de sistema próprio, com limites de memória, de processos e de alcance de rede.
**Quem fez:** agente `devops`. **Nada foi commitado.** Nenhum serviço da operação foi tocado.
**O código do leitor em si** (`apps/ai-service/**`) é de outro agente, e não foi editado aqui.

---

## 1. O Que Subiu, E Está No Ar Agora

A **segunda instância** do leitor está ativa em `127.0.0.1:8020`, como
`ea-portal-leitor.service` no gerenciador de usuário. A `ea-ai-service` (porta 8000), que atende a
auditoria da operação, **não foi reiniciada nem tocada**: segue ativa com zero reinícios desde
01/09. O mesmo vale para `ea-backend`, `ea-frontend`, `ea-proxy` e as duas de homologação.

**A instância sobe INERTE**, que era o requisito: o balde de entrada ainda não existe, a credencial
dedicada do portal ainda não existe, e nada disso impede o serviço de subir e responder.

| medida | valor conferido |
|---|---|
| saúde | `GET /health` responde 200 |
| guard interno | fail-closed, `/readiness` sem token devolve 401 |
| banco | `database_url` vazio, o motor de kit fica inerte (503) |
| Drive | sem delegação e sem mock |
| credencial | caminho **absoluto** próprio, arquivo ainda inexistente |
| nota de exposição | **5,6 MEDIUM**, contra **9,8 UNSAFE** da instância da operação |

---

## 2. O Ambiente Magro, E Por Que Ele Fica Fora Do Repositório

O `ai-service` lê o `.env` do **diretório de trabalho**. A instância do portal por isso roda com o
diretório de trabalho em `/home/henrique/apps/ea-portal-leitor`, fora do repositório, com um `.env`
próprio em modo `0600`, **não versionado**, sem `DATABASE_URL`, sem Drive, com token interno
próprio e com um caminho de credencial **absoluto**.

O caminho absoluto não é detalhe: o valor padrão da credencial é relativo e resolveria para
`apps/ai-service/credentials.json`, que é justamente a credencial compartilhada de Drive e Vertex
da operação. Deixar o padrão seria dar ao leitor a chave que a auditoria mandou tirar dele.

O código continua sendo o mesmo, importado por caminho, e **nada é escrito dentro do repositório**
(sem bytecode, com diretório temporário próprio).

---

## 3. Os Limites Aplicados, Conferidos No Cgroup

| limite | configurado | conferido no processo |
|---|---|---|
| memória, teto duro | `MemoryMax=768M` | `memory.max = 805306368` |
| memória, freio | `MemoryHigh=512M` | `memory.high = 536870912` |
| troca em disco | `MemorySwapMax=0` | `memory.swap.max = 0` |
| processos e linhas | `TasksMax=64` | `pids.max = 64` |
| processador | `CPUQuota=150%` | `cpu.max = 150000 100000` |
| arquivos abertos | `LimitNOFILE=1024` | `Max open files = 1024` |
| despejo de memória | `LimitCORE=0` | `Max core file size = 0` |

O despejo de memória zerado é regra de dado pessoal (§A.6): o despejo de um processo que acabou de
abrir o documento de um candidato seria dado pessoal gravado em disco sem ninguém ter pedido.

---

## 4. Os Dois Achados Que Mudam O Desenho, E Foram MEDIDOS

**Achado 1, o mais pesado: no gerenciador de usuário, o isolamento de sistema de arquivos é aceito
e IGNORADO em silêncio.** Foi medido, não suposto. Um processo com `ProtectSystem=strict`,
`ProtectHome=read-only`, `PrivateTmp`, `ReadOnlyPaths` e `InaccessiblePaths` declarados **leu o
`.env` do backend, leu a credencial do `ai-service`, escreveu dentro do repositório e enxergou o
`/tmp` do hospedeiro inteiro**. A razão aparece no próprio registro do serviço: "Failed to set up
user namespacing for unprivileged user, ignoring". O espaço de montagem do processo é o mesmo do
hospedeiro, conferido pelo identificador (`mnt:[4026531841]` nos dois).

**A consequência é direta:** essas diretrizes **não foram declaradas** na unidade provisória, de
propósito. Declará-las daria a leitura de um isolamento que não existe, que é pior do que não ter.
Elas estão na unidade de sistema, que é onde valem. Pelo mesmo motivo, `IPAddressDeny` também é
inerte no gerenciador de usuário (medido: com `IPAddressDeny=any` o processo abriu conexão para a
internet), e as diretrizes que exigem raiz (`PrivateDevices`, `ProtectClock`, `ProtectKernelLogs`,
`ProtectKernelModules`, `CapabilityBoundingSet`) nem deixam a unidade subir, com código 218.

**Achado 2: `LimitNPROC` é por USUÁRIO do sistema, não por serviço.** Com `LimitNPROC=64` o leitor
abortava no boot, porque o usuário do diretor já tem 41 processos e as linhas de execução contam
junto. O teto de processos só faz sentido quando o usuário é dedicado, e é lá que ele está. Na
unidade provisória quem segura a multiplicação é o `TasksMax`, que é por serviço e foi medido como
efetivo.

---

## 5. O Que Exige Comando Privilegiado, E Qual É Exatamente

**A fábrica não tem raiz nesta máquina** (`sudo` pede senha) e **não se autoconcede acesso** (§A.0).
Tudo o que segue foi **escrito e conferido, e não foi executado**.

O roteiro está em `infra/systemd/portal/instalar-portal-leitor.sh`, e a unidade definitiva em
`infra/systemd/portal/ea-portal-leitor.system.service`. **O comando do diretor é um só:**

```
sudo bash /home/henrique/apps/ea-automatic/infra/systemd/portal/instalar-portal-leitor.sh
```

Ele faz quatro coisas, e nada além: cria o usuário de sistema `ea-portal` (sem console e sem casa),
instala uma cópia do código em `/opt/ea-portal-leitor` com ambiente virtual próprio, move o
ambiente magro para `/etc/ea-portal-leitor/leitor.env` em modo `0640 root:ea-portal`, e sobe a
unidade de sistema na mesma porta 8020 de loopback. Ele **não encosta** em `ea-ai-service`,
`ea-backend`, `ea-frontend`, `ea-proxy` nem nas de homologação.

A cópia em `/opt` não é preciosismo: `/home/henrique` é `0750`, então um usuário próprio **não
consegue nem atravessar** o diretório do diretor para chegar ao código. As duas saídas eram abrir o
diretório do diretor para todo mundo ou instalar o leitor fora dele, e a segunda é a certa.

**Depois de instalada, a unidade de sistema entrega o que a provisória não consegue:** usuário
próprio, sistema de arquivos somente leitura com duas ilhas de escrita, `/home` inacessível,
diretório temporário privado, nenhuma capacidade, e alcance de rede restrito (as faixas privadas
negadas, para que o leitor não tenha como conversar com o banco, com o Redis nem com a VPN). A nota
de exposição projetada é **1,3 OK**, contra os 5,6 da provisória e os 9,8 da instância da operação.

---

## 6. O Que Fica Pendente

1. **O comando privilegiado acima**, que é o único bloqueio real desta camada.
2. **A credencial dedicada do portal**, que depende do pedido ao Fernando (seção 7 do desenho). Até
   ela existir, o leitor sobe e responde, e falha só na chamada que precisar do Vertex.
3. **A configuração do balde de entrada**, pelo mesmo motivo. A instância foi feita para subir sem
   ela.
4. **O casamento com o backend**: o token interno da instância do portal é **diferente** do token
   do `ai-service` da operação, de propósito. Quem for ligar o backend ao leitor precisa apontar
   para a porta 8020 e para esse token, que vive só no ambiente magro, fora do repositório.
5. **A revisão do ambiente virtual compartilhado**: enquanto a provisória estiver no ar, ela usa o
   ambiente virtual do `ai-service`. Dependência nova que o agente do leitor acrescentar exige uma
   sincronização, e some quando a unidade de sistema entrar com o ambiente próprio dela.
