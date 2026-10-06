# Mapa: conserto da Central de Candidatos (06/10/2026)

Investigação do coordenador antes do despacho (§A.39/§A.40). O diagnóstico validado está em
`docs/DIAGNOSTICO-CENTRAL-CANDIDATOS.md`. Contrato compartilhado já escrito e compilado em
`packages/shared-types/src/index.ts` (dono: coordenador): `AsCandidaturaNaLista` ganhou `clienteNome`
e `cargoNome`; `AsCandidatosPagina` ganhou `kpis?`; novo `AsCandidatosKpis` e `AsCandidatosOpcoes`.

## O que a tela depende de `/as/vagas` hoje (a raiz da regressão)

`app/(app)/as/candidatos/page.tsx` chama `GET /as/vagas` e usa a lista para:
1. cliente/cargo de cada linha (`vagaPorId`, linhas 350, 913, 920);
2. opções do filtro de CLIENTE (`optClientes`, 532) e de VAGA (523);
3. ordenação por cliente/cargo (490, 491);
4. `vagaPorId` repassado ao fluxo de alocação (1132).

A frente da Central de Vagas (05/10) fez `/as/vagas` devolver só vaga liberada. Então 1 a 3
quebraram para quem está em vaga em revisão (94% da base): cargo some (medido: 44 dos 200 da página 1),
e os filtros de cliente/vaga encolhem para só liberadas. O conserto DESACOPLA a tela de `/as/vagas`.

## Medições da base

81.024 candidatos, todos com candidatura; 107.468 candidaturas, 100% com `vaga_id`. CAPTACAO 95%,
ATIVO 96%. Vaga com cliente: 6%; com cargo: 30%. 429 resolvido (zero hoje). KPI da tela hoje conta
linhas carregadas (`funil.total = linhasSemCard.length`, page.tsx:436), não a base.

## O que construir (4 itens do diretor)

### 1. Cliente/cargo na projeção do `buscar` (corrige a regressão)
`funilDaPagina` (`candidatos.service.ts:3696`) já faz `innerJoin(vagas)`. Somar `leftJoin clientes`
(em `vagas.codCliente`) e `leftJoin cargos` (em `vagas.cargoId`), projetar `clienteNome`
(coalesce nomeOperacao, razaoSocial) e `cargoNome` em `AsCandidaturaNaLista`. SEM filtro de status da
vaga (mantém o `innerJoin vagas` atual, que já traz vaga em revisão). Frontend passa a ler
`l.candidatura.clienteNome/cargoNome`, não `l.vaga?.*`.

### 2. KPIs reais no servidor
`buscar` ganha `kpis` (porEtapa, porSituacao) por CONTAGEM agregada sobre o conjunto FILTRADO inteiro
(os MESMOS filtros do buscar, antes do limit), não da página. `total` já é o número real. Uma consulta
agregada a mais por carga (group by etapa; group by situacao), barata. Frontend: Total = `pagina.total`;
cards por etapa/situação = `pagina.kpis`, não as linhas carregadas.

### 3. Opções de filtro da base de candidatos (desacopla de `/as/vagas`)
Novo `GET /as/candidatos/opcoes` -> `AsCandidatosOpcoes` (clientes, cargos, vagas DISTINTOS nas
candidaturas). Uma consulta agregada. Frontend troca `optClientes`/opções de vaga para virem daqui, e
PARA de chamar `/as/vagas` na Central de Candidatos. §A.37: opção de filtro vem de endpoint.

### 4. Carga incremental com freio (ver os 81 mil)
Frontend: página 1 (200) na abertura; depois pré-buscar as páginas seguintes (offset += 200) em
SEGUNDO PLANO, anexando ao estado, até cobrir `total`. FREIO OBRIGATÓRIO:
- ritmo controlado (ex. 1 página a cada 1,5s), nunca em rajada;
- PAUSAR quando a aba perde foco (`visibilitychange`/`blur`) e retomar no foco;
- parar ao atingir `total`; a busca por nome/CPF continua indo ao servidor (o buscar já filtra).
Conta: 81.024/200 = ~405 páginas (ou /500 = ~162). Teto 120 req/min GLOBAL compartilhado (Pandapé,
Digai, GI, Central de Vagas). A 1 pág/1,5s = 40/min, folga. Indicador "carregados X de 81.024".

### 5. A vaga na FICHA
O backend já manda vaga por candidatura na ficha (`AsCandidaturaItem` tem vagaCodigo/vagaNome,
`candidaturasDoCandidato`). Garantir que o MODAL da ficha RENDERIZA qual vaga, não só a contagem.

## O dado faltando (registrar, não é bug)
94% sem cliente porque a vaga (espelho Pandapé) está em revisão e não tem cliente até ser liberada. O
cliente nasce na liberação. Não se conserta na tela.

## §A.6 / §A.38 (por que o seguranca entra)
- A carga incremental traz a BASE INTEIRA de nomes (81 mil) ao browser. É expansão de volume de dado
  pessoal ao cliente (hoje a tela cappa em 200 de propósito). Pergunta ao seguranca: aceitável sob
  §A.6 para usuário interno com o menu (precedente §A.44), ou precisa de teto/retenção no cliente?
- A lista NÃO traz CPF (só `temCpf`), nem pretensão, nem motivoDescarte (§A.6 já garantido no buscar).
  Confirmar que a projeção nova (cliente/cargo) e os KPIs NÃO acrescentam PII, e que `/opcoes` não
  vaza nada além de rótulo/código de catálogo.

## Alcance / não tocar
- `AsCandidaturaNaLista` e `montaItens` são compartilhados com o modal de candidatos da VAGA e a
  ficha. Acrescentar campos é aditivo; conferir que os outros consumidores não quebram.
- NÃO tocar: Central de Vagas (o `/as/vagas` filtrado FICA como está, decisão do diretor), Portal, GI,
  Digai, autenticidade. A Central de Candidatos deixa de depender de `/as/vagas`, mas não o altera.
- shared-types é do coordenador; backend e frontend só consomem.
