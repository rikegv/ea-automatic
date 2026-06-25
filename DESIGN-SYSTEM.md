# DESIGN-SYSTEM.md — EA AUTOMATIC

> Especificação visual FECHADA, extraída dos protótipos aprovados pelo diretor
> (`EA-AUTOMATIC-prototipo.html` = escuro, `EA-AUTOMATIC-prototipo-claro.html` = claro).
> A fábrica REPRODUZ estes valores; não os reinterpreta. Qualquer desvio do protótipo é erro.
> Os HTMLs são a referência pixel a pixel; este arquivo é a fonte dos valores exatos.

## Princípio

- **Tema claro é o padrão.** Toggle alterna para escuro; preferência persistida por usuário.
- **Azul Soulan é a cor predominante** (sistema: navegação, ícones, gráficos, botões, acento).
- **Verde Soulan é secundário** (detalhes de marca; reservado para estado positivo).
- Linguagem **glassmorphism**: superfícies translúcidas com blur, borda sutil, aurora de fundo.
- Tipografia: **Manrope** (títulos, números, marca) + **Inter** (corpo, labels, dados).

## Tokens — TEMA ESCURO (dark)

```
--bg:#07111f;            --bg2:#0a1a30;
--surface:rgba(255,255,255,.05);   --surface-2:rgba(255,255,255,.08);
--border:rgba(255,255,255,.10);    --border-strong:rgba(255,255,255,.16);
--text:#eaf0f7;          --dim:#93a4ba;        --faint:#5d6f86;
--accent:#22b0db;        --accent-2:#99c143;
--ok:#5bd68a;            --warn:#f5c451;       --danger:#ff6b6b;
--r:20px;
```
- Body background: `linear-gradient` base `--bg` → `--bg2` (ou sólido `--bg`).
- Botão primário: `linear-gradient(135deg,#22b0db,#1684ad)`, texto `#fff`.

## Tokens — TEMA CLARO (light, PADRÃO)

```
--bg:#eef3f8;            --bg2:#e6edf4;
--surface:rgba(255,255,255,.74);   --surface-2:rgba(255,255,255,.93);
--border:rgba(15,55,90,.10);       --border-strong:rgba(15,55,90,.18);
--text:#0d2b45;          --dim:#557089;        --faint:#90a3b6;
--accent:#1593bd;        --accent-vivid:#22b0db;  --accent-2:#7ba81f;
--ok:#2e9e63;            --warn:#c98a12;       --danger:#d64545;
--r:20px;
```
- Body background: `linear-gradient(160deg,#f4f7fb,#e9eef5)`.
- Botão primário: `linear-gradient(135deg,#22b0db,#1593bd)`, texto `#fff`.

## Cores da marca (referência fixa, extraídas do logo)

- Azul Soulan: `#1699C1` (médio), `#22B0DB` (vivo), `#08AAD7` (mais vivo).
- Verde Soulan: `#99C143`.

## Glass (superfície padrão)

- `background: var(--surface)`
- `backdrop-filter: blur(18px)` (e `-webkit-backdrop-filter`)
- `border: 1px solid var(--border)`
- `border-radius: var(--r)` (20px; cards menores podem usar 13–16px)
- Sombra ESCURO: `0 8px 32px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06)`
- Sombra CLARO: `0 6px 24px rgba(15,40,75,.08), 0 1px 2px rgba(15,40,75,.04), inset 0 1px 0 rgba(255,255,255,.6)`

## Aurora de fundo (assinatura)

Três blobs em blur, posição fixa, atrás do conteúdo (`z-index:0`, conteúdo em `z-index:1`).
- ESCURO: `filter:blur(80px); opacity:.55`. Blobs: azul `#1699c1` (topo-esq, ~500px),
  `#08aad7` (baixo-dir, ~520px), verde `#99c143` (centro, ~360px, opacity menor).
- CLARO: `filter:blur(90px); opacity:.22`. Blobs: `#22b0db`, `#56c2e0`, `#aad12f`.

## Tipografia

- Família display: **Manrope** (pesos 500/600/700/800). Família corpo: **Inter** (400/500/600).
- Títulos de página (h1): Manrope 800, ~26px, `letter-spacing:-.02em`.
- Números de KPI: Manrope 800, ~30px.
- Eyebrow (rótulo acima do título): 12px, uppercase, `letter-spacing:.1em`, cor `--accent`, weight 600.
- Corpo: Inter, 14px. Labels: 12–12.5px, cor `--dim`.

## Componentes base (reutilizáveis — não estilizar solto por tela)

- **GlassCard:** superfície glass padrão acima.
- **KpiCard:** glass; topo com ícone (32px, fundo tom de accent) + tag opcional (up/warn/dn);
  número grande (Manrope 800) + label (`--dim`).
- **Botão primário:** gradiente azul, texto branco, raio 12px, hover `translateY(-1px)` + sombra accent.
- **Botão secundário:** glass, borda sutil.
- **Pill de status:** fundo translúcido da cor do estado + ponto colorido + texto 12px weight 600.
  - ok → `--ok`; pendente/parcial → `--warn`; inconforme/atrasado → `--danger`; neutro → `--dim`.
- **NavItem:** linha de menu; ativo = `--surface-2` + borda `--border` + ícone `--accent`.
- **Tabela:** hover highlight suave; separador `--border`; ações inline visíveis no hover.

## Shell da aplicação

- **Sidebar fixa** (glass), largura ~248px, com seções "Operação" e "Administração".
  Itens: Início, Análise gerencial, Nova admissão, Esteira admissional, Gerenciador,
  Cadastros (só Master/Super Admin). Rodapé: avatar + nome + papel + sair.
- **Área principal** com padding ~28–32px; conteúdo em `z-index:1` sobre a aurora.

## Tela Início (Início)

- Eyebrow "Painel inicial" + saudação (h1) + subtítulo.
- **Banner "Radar da esteira"** (glass, herói): carrossel de insights.
  - Troca automática a cada **5000ms**; transição de opacidade+translateX .5s.
  - **Pausa no hover** (mouseenter limpa o timer; mouseleave reinicia).
  - Setas voltar/avançar + dots (dot ativo vira barra ~22px, cor `--accent`).
  - Cada insight: ícone tipado (alerta=`--warn`, volume=`--accent`, pico=`--accent-2`) +
    texto Manrope ~16.5px com números em `<b>` cor `--accent`.
  - Insights são MOCK nesta fase; geração real (regras/IA) é da Fase 6.
- **Quatro cards de navegação** (glass, hover eleva): Nova admissão, Esteira admissional,
  Gerenciador, Análise gerencial. Ícone 46px em caixa gradiente, título Manrope, descrição `--dim`.
- **SEM KPIs nesta tela.**

## Tela Análise gerencial

- Seis KpiCards lado a lado (grid 6 col, responsivo): Admissões ativas, SLA vencido,
  Concluídas no mês, Em auditoria, Em exame, Em cadastro.
- Painel "Volume de admissões" com gráfico de barras (gradiente azul). Dados mock nesta fase.

## Faróis (Esteira) — referência de estilo

- Abas independentes (Auditoria, Exame, Cadastro/Contrato); aba ativa = glass + borda.
- KPIs da frente no topo; lista de candidatos com pills de status.
- (Lógica funcional é de OST posterior; aqui só o padrão visual.)
