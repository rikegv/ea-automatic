# Entrega: Alto Volume por GRUPO (meta no grupo + dash por grupo + remover grupo de entrada)

> Construído, gate verde, auditado pelo `seguranca`. **Aguardando validação visual do diretor na
> 3120** (o restart é coordenado, §A.14/§A.32). Nada commitado nem publicado em produção.
> Medido em 07/10/2026.

---

## O que foi feito

### 1. Meta no cadastro do grupo (OBRIGATÓRIA)
- Coluna `meta integer` em `grupos_cliente` (nullable no banco só para o legado não quebrar; a
  criação EXIGE meta, sem opção de "sem meta"). Migration aditiva `drizzle/0149_grupo_cliente_meta.sql`.
- `CriarGrupoClienteDto.meta` obrigatório (`@IsInt`+`@Min(1)`); `AtualizarGrupoClienteDto.meta`
  opcional, `@Min(1)` se vier. Edição auditável no mesmo padrão dos catálogos vizinhos (carimba
  `atualizadoEm`, sem tabela de log nova).
- Front: campo Meta no formulário de criar/editar grupo, dentro da tela de Clientes
  (`GruposClienteLivreto.tsx`). Meta exibida na linha de cada grupo.

### 2. Dash por grupo (reusa a régua do projeto)
- Endpoint novo `GET /admin/grupos-cliente/:id/analise`, leitura aberta a autenticado, tela gatada
  pelo menu `diretoria` (mesmo regime do `AltoVolumeController.analisar`, confirmado pelo `seguranca`).
- Contagens sobre `admissoes.grupo_cliente_id = :id`, reusando as expressões compartilhadas de farol
  (`admissaoConcluidaSql`, em-andamento exclusivo), **a mesma régua do dash de projeto**:
  - `naEsteira` exclui DECLINOU, RESCISAO e BANCO_AGUARDAR (igual ao `vinculadas` do projeto).
  - `concluidas` exclui os mesmos três (correção de 13/08/2026 espelhada, evita "Concluídas > Na Esteira").
  - `faltam = meta - naEsteira`. `emBanco`, `declinios`, `pausadas`, `emAndamento` como recortes.
  - Grupo sem meta (legado): meta/faltam null, a tela mostra "Meta não definida" / "não informado",
    sem NaN, com link para o cadastro.
- Front: pílula **Grupo / Projeto** na dash (`/diretoria/alto-volume`), abre em GRUPO. Seletor de
  grupo (Select do design system com busca, §A.35). Baldes reusando os componentes da própria tela.
  A visão **Projeto é a de hoje, intacta**.

### 3. "Grupos De Entrada" (leva por data) removido do front
- Tirado da dash, do cadastro de Alto Volume, do seletor de vínculo, e escondido na Nova Admissão e
  na Liberação (o seletor vivia no `BlocoAltoVolume` compartilhado). `grupoId` continua nulável, o
  dado fica no banco; nada é apagado. Confirmado (tester, prova diferencial) que os totais da dash de
  PROJETO são idênticos com e sem turma.

## Gate e auditoria
- Backend typecheck: VERDE (0 erro TS). Specs da frente: 44 verdes (11 do autor + 33 do tester).
- `tester` independente (§A.38): achou 1 GAP real (`concluidas` sem filtro de farol), corrigido na
  mesma rodada; re-alinhou ao requisito (naEsteira sem banco). 
- `seguranca` (§A.38): APROVADO em A (RBAC sem escalada), B (§A.6, retorno só contagem + id/nome/meta,
  sem CPF/candidato/CNPJ), C (remoção não afrouxou guard), D (meta sem PII).

## Decisões abertas para o diretor
1. **Resíduos de "grupo de entrada" fora da lista da OST:** a coluna **Cota** e o seletor de cota por
   grupo no formulário de Vagas, e os seletores de grupo nos modais de **troca de projeto**, no
   cadastro de Alto Volume. Não removi (não estavam na lista, §A.14). Com o cadastro de turma fora do
   ar, esses controles ficam dormentes. Remover também, ou deixar?
2. **Lista de grupos no cadastro é uma lista de botões, não uma tabela.** Mostrei a Meta na linha.
   Virar tabela ordenável/filtrável (§A.29/§A.37) seria redesenho de UI validada (§A.26). Faço, se quiser.
3. **Precisão da régua (posso reverter):** alinhei "Na Esteira" do grupo ao projeto, que NÃO conta
   banco. Se você quiser que banco conte como "na esteira" no painel do grupo, é uma linha.

## Arquivos tocados
- Backend: `grupos-cliente.service.ts`, `grupos-cliente.dto.ts`, `grupos-cliente.controller.ts`,
  `db/schema/tables.ts`, `drizzle/0149_grupo_cliente_meta.sql` (+ journal), specs.
- Frontend: `components/admin/GruposClienteLivreto.tsx`, `components/alto-volume/BlocoAltoVolume.tsx`,
  `app/(app)/admin/alto-volume/page.tsx`, `app/(app)/diretoria/alto-volume/page.tsx`.
