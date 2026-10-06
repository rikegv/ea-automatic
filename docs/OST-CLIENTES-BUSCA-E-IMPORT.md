# OST Menu Clientes: busca avançada + cadastro em massa por planilha

Frente construída em operação distribuída (coordenador + backend + frontend + tester + seguranca).
Checkout de dev (`ea-automatic`). Nada publicado em produção. Prova visual na 3120 pendente de
coordenação de restart (reservada ao diretor por esta OST).

## O que foi entregue

### Frente 1: busca por todas as colunas
A busca da tela de Clientes passou a casar o termo, pela régua `normBusca` (sem acento, sem caixa, a
mesma da Esteira), em TODAS as colunas que a tabela mostra: código, razão social, CNPJ, nome de
operação, empresa (Soulan), CNPJ do vínculo, tipo de serviço e o rótulo de status. Antes casava só
razão social, código e nome de operação. É E-lógico com os filtros existentes (status, tipo, só
pendência), nenhum removido. O match virou função pura `casaBuscaCliente` (`lib/clientes-busca.ts`),
consumida pela página, para o teste do tester guardar o componente de verdade.

### Frente 2: cadastro em massa por planilha
Botão "Importar Planilha" na barra de filtros abre o modal (fecha por Cancelar/Confirmar, nunca
clicando fora, §A.41). Fluxo:
1. Baixar modelo (xlsx e csv): cabeçalho Código do Cliente, CNPJ, Razão Social, Nome da Operação.
2. Subir planilha: prévia mostra resumo (total, vão entrar, recusadas), as duas tabelas (Vão Entrar,
   Recusadas com o motivo por linha) e aviso explícito dos códigos já cadastrados. Seletor de aba
   quando há mais de uma. Nada é gravado na prévia.
3. Confirmar: grava os aprovados em lote tolerante e mostra o relatório (quantas entraram, recusadas
   com motivo). Fecha e recarrega a lista.

Motivos de recusa (ordem de avaliação): código vazio; código inválido (> 40 chars); razão social
vazia (campo obrigatório no banco); CNPJ inválido (dígito verificador; CNPJ vazio é permitido);
código repetido na planilha (1ª entra, 2ª+ recusa); código já cadastrado (e listado em
`jaCadastrados`). Lote tolerante: linha ruim não derruba as boas. Aceita xlsx/xls/csv (leitor único
da casa, teto de 10 MB / 2000 linhas).

## Contrato (3 rotas novas, gated no menu `clientes` = Master/Super Admin)
- `GET /admin/clientes/importacao/modelo?formato=xlsx|csv` → StreamableFile (attachment).
- `POST /admin/clientes/importacao/previa` (multipart `file`, opcional `aba`) → `{ aEntrar[],
  recusadas[], jaCadastrados[], resumo{total,aEntrar,recusadas}, abaUsada?, abasDisponiveis? }`.
- `POST /admin/clientes/importacao/confirmar` `{ linhas[] }` (máx 2000) → `{ relatorio{entraram,
  recusadas[]} }`. Re-valida no servidor (CNPJ, unicidade contra o banco atual), não confia no payload.

## Arquivos (recorte nominal, §A.14)
Backend, criados: `domain/cnpj.ts`, `admin/clientes/clientes-importacao.ts`,
`admin/clientes/clientes-importacao.backend.spec.ts`. Editados: `admin/clientes/clientes.controller.ts`,
`admin/clientes/clientes.service.ts`, `admin/clientes/clientes.dto.ts`, `domain/menus.ts`.
Frontend, criados: `lib/clientes-import.ts`, `lib/clientes-busca.ts`,
`components/admin/ImportarClientesModal.tsx`, e specs. Editado:
`app/(app)/admin/clientes/page.tsx`.
Testes (tester, novos `*.tester.spec.ts`): `domain/cnpj.tester.spec.ts`,
`admin/clientes/clientes-importacao.tester.spec.ts`, `admin/clientes/clientes-import-rbac.tester.spec.ts`,
`app/(app)/admin/clientes/clientes-busca-todas-colunas.tester.spec.ts`.

## Auditoria e gate
- `seguranca` (§A.6/§A.38): APROVADO. Bloqueante RBAC cumprido (3 rotas reivindicadas nominalmente em
  `menus.ts:437-439`, nomes batem com os handlers). `confirmar` re-valida server-side, DTO limita a
  2000, catch do insert sem log de PII. Upload endurecido (teto + filtro) igual lojas.
- `tester` (§A.38): 42 testes independentes verdes (DV do CNPJ conferido à mão, 6 motivos, lote
  tolerante, RBAC, busca por colunas).
- Gate: typecheck backend + frontend verde. Suíte inteira (§A.40): backend 8763 passam (exit 0),
  frontend 1908 passam (exit 0). Sem travessão introduzido (§A.11).

## Confirmações da investigação (não precisaram travar o diretor)
- Modelo de 4 colunas está completo: no banco só `codCliente` e `razaoSocial` são obrigatórios; CNPJ
  e nome operação são opcionais. Não há obrigatório escondido.
- Quem importa = quem administra clientes (Master/Super Admin, menu `clientes`), espelhando o cadastro
  individual.

## Observações não-bloqueantes (registro)
- `list()` legado (`clientes.service.ts`) já expõe `cnpjVinculo` a qualquer autenticado: pré-existente,
  fora desta OST, não tocado.
- O catch do insert reporta sempre "Código já cadastrado"; para inserção de 4 campos é o único conflito
  realista, mas mascararia outra falha de gravação. Limitação conhecida, sem veto do seguranca.

## Publicado na 3120 (06/10/2026)
Publicado na homologação (3120) após o diretor autorizar o restart e os 3 peers liberarem. O publish
exigiu re-sincronizar o `src` do dev para o checkout `ea-homolog` (para trazer os fixes de hoje de
outras sessões: portal-correio, vagas.service, candidatos), coordenado com a sessão Candidatos para
não pegar um estado de mutação. Builds backend e frontend EXIT 0; serviços `ea-homolog-*` reiniciados,
backend 3111 health OK, 3120/login 200.

Medido no artefato servido (não no fonte): o bundle `.next` da página `admin/clientes` tem "Importar
Planilha", "Buscar em todas as colunas" e a rota `importacao/previa`; a dist do backend tem as rotas
em `clientes.controller.js` e os claims em `menus.js`.

Prova visual (harness Playwright, SUPER_ADMIN, 5 screenshots em
`/home/henrique/ost-clientes-busca-import-prints/`): botão e busca presentes no Menu Gerencial >
Clientes; busca casando pela coluna CNPJ Vínculo; prévia com vão entrar / recusadas / motivos / aviso
de já cadastrado; e confirmar gravando de fato (Ativos 227 -> 229) com os sintéticos expurgados depois
(§A.43). Falta só a validação do diretor na 3120; o deploy em PRODUÇÃO (3010) fica para quando ele
coordenar (a produção está em reset por outra sessão).
