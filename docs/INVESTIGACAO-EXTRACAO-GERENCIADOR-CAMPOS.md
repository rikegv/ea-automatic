# Investigação: campos da extração do Gerenciador

**Pedido.** Deixar TODOS os campos cadastrados disponíveis para seleção na extração
(Gerenciador > Exportar), sem quebrar o que já é exportado hoje.
**Status.** Investigação (§A.27). Nada implementado, nada commitado.

---

## 1. Onde a extração vive hoje

| Peça | Arquivo |
|---|---|
| Catálogo de colunas (fonte única) | `packages/shared-types/src/index.ts` (`COLUNAS_RELATORIO`) |
| Tela de seleção | `apps/frontend/src/components/gerenciador/ExportarRelatorioModal.tsx` |
| Consulta e montagem das linhas | `apps/backend/src/admissoes/admissoes.service.ts` (`exportarRelatorio`) |
| Geração do xlsx | `apps/backend/src/admissoes/relatorio-export.ts` |

O desenho é bom para o que se pede: a tela NÃO tem lista própria, ela renderiza o catálogo
compartilhado. **Coluna nova aparece na tela e passa a ser aceita pelo backend no mesmo commit.**
O que dá trabalho não é a tela, é a CONSULTA: hoje ela junta 4 tabelas (`admissoes`, `candidatos`,
`clientes`, `cargos`, `dados_vaga_folha`) e nada além disso.

---

## 2. O que JÁ está disponível para seleção hoje (25 colunas)

**Dados Do Candidato (6):** Nome · CPF · Telefone · E-mail · Data De Nascimento · Sexo

**Dados Da Admissão (9):** Código Do Cliente · Cliente · Cargo · Tipo De Contrato · Matrícula ·
Data De Admissão · Status · Origem · Criada Em

**Dados De Vaga E Folha (10):** Salário · Benefícios · Escala · Setor · Departamento ·
Centro De Custo · Gestor BP · Motivo Da Contratação · Tempo De Contrato · Endereço

*Marcadas por padrão ao abrir: só Nome e Telefone.*

---

## 3. O que NÃO está (os que faltam)

### A. Uniforme e EPI, 7 campos, NENHUM na extração
Fonte: `dados_vaga_folha`. É o bloco citado no pedido.

Possui Uniforme · Tamanho De Camiseta · Tamanho De Calça · Tamanho De Bota ·
Possui EPI · Itens De EPI · EPI Outros

### A2. Substituição, 2 campos
Fonte: `dados_vaga_folha`. Quando o motivo da contratação é "Substituição".

Nome Do Substituído · Expurgo Do CPF Previsto Para

*(O **CPF** do substituído é o 4º item da parada do item 4, abaixo.)*

### B. Empresa / Cliente, 12 campos, NENHUM na extração
Fonte: `clientes`. Hoje só saem o **código** e o **nome de operação** (fundidos na coluna "Cliente").
Todo o resto do cadastro do cliente fica de fora.

CNPJ · Razão Social · Nome De Operação (hoje só sai fundido) · Empresa Do Grupo · Região ·
Descrição Da Região · Benefícios Padrão · Escala Padrão · Endereço Padrão ·
Periodicidade Do Benefício · Dia De Pagamento Do Benefício · Dias Para O 1º Crédito

*(`ativo` também existe, mas é gestão de catálogo, não dado do relatório. Fica fora salvo pedido.)*

### C. Vínculo e Entidade Soulan, 6 campos
Fonte: `cliente_vinculos` + `entidades_soulan`. É o que resolve QUAL empresa do grupo emprega.

Empresa Soulan (código) · Tipo De Serviço · Filial · Fopag · Entidade (nome) · CNPJ Da Entidade

### D. Benefícios, 3 campos, e um achado
Fonte: `admissao_beneficio` + `beneficios_catalogo` + `admissoes`.

**Achado:** a coluna "Benefícios" que a extração tem HOJE lê o campo de TEXTO LIVRE
(`dados_vaga_folha.beneficios`), **não** o pacote estruturado. O pacote real (benefício + valor,
o que a tela de Benefícios usa) nunca sai no relatório.

Pacote De Benefícios (nome e valor) · Status Do Cadastro Do Benefício · Entrou Na Fila De Benefícios Em

### E. Frentes da esteira, 12 campos, NENHUM na extração
Fonte: `frentes_admissao`. As colunas que a tela do Gerenciador MOSTRA e o arquivo não leva.

Status Auditoria · Status Exame · Status Cadastro · Status Integração
Auditoria Concluída Em · Exame Concluído Em · Cadastro Concluído Em · Integração Concluída Em
Responsável Auditoria · Responsável Exame · Responsável Cadastro · Responsável Integração

### F. Exame, 9 campos
Fonte: `exame_agendamento` + `admissoes.aso_validado`.

Data Do Exame · Horário · Clínica · Fornecedor · Local · Valor · Previsão Do ASO ·
Reagendamentos · ASO Validado

### G. Integração, 4 campos
Fonte: `integracao_agendamento`.

Data Da Integração · Horário · Tipo (presencial/online) · Consultor Da Integração

### H. Assinatura (Clicksign), 6 campos
Fonte: `admissoes`.

Status Da Assinatura · Enviado Para Assinatura Em · Notificado Em · Envelope (id) ·
Contrato Assinado (link do Drive) · Kit Gerado Em

### I. Controle da admissão, 16 campos
Fonte: `admissoes` + cálculo já existente.

Admissão De Banco · Sinalizador De Preenchimento · Pendências Obrigatórias (quais faltam) ·
Documentos Obrigatórios Pendentes (quantidade) · Pausada Em · Motivo Da Pausa ·
Motivo Do Declínio · Consultor Responsável · Divergência Bancária · Possível Duplicata ·
Observação Da Liberação · Recusada Em · Id Da Vaga No Pandapé · Pasta Do Prontuário No Drive ·
ASO No Drive · Atualizada Em

*"Pendências Obrigatórias" reusa `pendenciasObrigatorias` / `pendenciasObrigatoriasSet`, a régua
única (§A.19). NÃO recalcular nada novo.*

### J. Formulário de VT, 11 campos
Fonte: `formularios_vt` (o mais recente por admissão).

Optante De VT · CEP · Logradouro · Número · Complemento · Bairro · Cidade · UF ·
Total Ida · Total Volta · Total Dia

*Contém endereço RESIDENCIAL do candidato: é PII. Entra no mesmo pacote de decisão do item 4.*

---

## 4. PARADA OBRIGATÓRIA: 4 campos que o diretor JÁ mandou tirar

Estes NÃO estão na extração por **decisão registrada e explícita**, não por esquecimento. O
comentário no catálogo diz, palavra por palavra, que a decisão foi "confirmada pelo diretor ao
abrir o item 11c", e o schema repete que são "exibíveis só na ficha da própria admissão, nunca em
superfície coletiva":

| Campo | Fonte | Motivo registrado |
|---|---|---|
| Banco | `candidatos.banco` | §A.6, minimização: fora de superfície coletiva |
| Agência | `candidatos.agencia` | idem |
| Conta | `candidatos.conta` | idem |
| CPF Do Substituído | `dados_vaga_folha.substituido_cpf` | §A.3 regra 10: retenção mínima, TTL 48h, expurgo automático |

**Não vou incluir por conta própria.** "Todos os campos" colide de frente com uma decisão anterior
do próprio diretor, e a §A.26 manda perguntar. Se o Rike disser que agora entram, entram
(o CPF do substituído sai do arquivo sozinho quando o expurgo roda, então a coluna vem vazia
depois das 48h, e isso é o comportamento correto, não defeito).

*Fora dessa lista, o resto que é PII (CPF do candidato, e-mail, telefone, data de nascimento) JÁ
está na extração hoje e continua como está: a proteção existente não é afrouxada.*

---

## 5. Resumo do número

| | Colunas |
|---|---|
| Disponíveis hoje | **25** |
| A acrescentar (blocos A a J) | **88** |
| Em decisão do diretor (item 4) | **4** |
| Total se tudo entrar | **117** |

---

## 6. Custo e alcance (§A.27)

**Risco de quebrar o que já existe: baixo.** A exportação é LEITURA PURA (não escreve, não recalcula
régua, farol nem KPI) e a coluna nova só sai se for marcada. As 25 de hoje continuam idênticas.

Os blocos, em ordem de esforço:

- **Barato (só acrescentar campo ao `select` que já existe):** A (uniforme/EPI), A2 (substituição), B (cliente),
  parte do I. Todas as tabelas já estão no JOIN.
- **Médio (um JOIN novo, 1:1):** C (vínculo), F (exame), G (integração), H (assinatura já está
  em `admissoes`).
- **Precisa de agregação, um lote à parte por fora do JOIN:** D (pacote de benefícios), E (frentes),
  J (VT mais recente), e as pendências do I. **O padrão já existe:** é exatamente o que
  `listar` faz hoje (busca as frentes e as pendências da página em consulta separada). Aqui roda
  sobre o conjunto filtrado inteiro, com o mesmo teto de 20 mil linhas que já protege a exportação.

**Ponto de atenção de desempenho:** um relatório com todos os blocos marcados, sobre a base inteira,
faz 4 consultas extras. Com o teto de 20 mil linhas e a base atual, cabe folgado. Fica registrado.

**Uma coisa que vou propor junto:** hoje o modal mostra uma caixa por coluna em 3 grupos. Com 113
colunas em 11 grupos, a tela precisa de grupos recolhidos e "marcar tudo do grupo", senão vira uma
lista de rolagem infinita. Isso é da mesma OST (é a tela de seleção), não escopo novo.
