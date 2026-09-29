/**
 * ─ A ANOTAÇÃO: ELIPSE, SETA E RÓTULO DESENHADOS SOBRE O ELEMENTO ───────────────────────────────
 *
 * ┌─ A DIVISÃO DE TRABALHO, QUE É O ACHADO DO SPIKE E NÃO MUDA ──────────────────────────────────┐
 * │ A CAIXA do elemento é resolvida FORA do navegador, pelo localizador do Playwright (só ele      │
 * │ entende papel e nome acessível). Dentro da página existe apenas o CSS do próprio navegador,    │
 * │ então para lá vão apenas COORDENADAS CRUAS. É isso que permite descrever a anotação por        │
 * │ ELEMENTO e não por pixel, e é só por isso que um manual com centenas de prints se sustenta:    │
 * │ mudou a tela, o print é REGERADO, ninguém redesenha seta à mão.                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LAYOUT DO RÓTULO ACONTECE DENTRO DA PÁGINA, E ISSO É DELIBERADO ──────────────────────────┐
 * │ O spike ancorava o rótulo em `cy - 100` fixo e estimava a largura por `texto.length * 8`. Os   │
 * │ dois erram: o primeiro corta o rótulo de todo elemento no topo da tela, e o segundo erra com   │
 * │ acento e com maiúscula, num sistema inteiramente em português. A largura REAL só existe depois │
 * │ que o `<text>` está no documento (`getComputedTextLength`), então a escolha de lado, o clamp   │
 * │ na borda e o desvio por colisão são feitos aqui dentro, com a medida na mão.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SOBRE `position: fixed`: o overlay é fixo e a captura é de VIEWPORT, nunca de página inteira. O
 * spike misturava os dois, e o fixed acompanha a viewport, então a anotação sairia no lugar errado
 * numa captura `fullPage`. O motor escolheu UM caminho e o mantém (conserto 4 do plano).
 */
import type { Caixa, Pagina } from "./playwright-minimo";
import { garantirShimDeNome } from "./shim-name";

export type AlvoMedido = {
  texto: string;
  forma: "elipse" | "retangulo";
  lado?: "esquerda" | "direita" | "acima" | "abaixo";
  box: Caixa;
};

export type RelatorioAnotacao = {
  colocados: Array<{ texto: string; lado: string; ajustado: boolean }>;
  /** Rótulos que não couberam sem escrever por cima de outra coisa. Falha dura no motor. */
  naoResolvidos: string[];
};

const ID_OVERLAY = "ea-ajuda-anotacao";

export async function anotar(page: Pagina, alvos: AlvoMedido[]): Promise<RelatorioAnotacao> {
  await garantirShimDeNome(page);
  return page.evaluate<RelatorioAnotacao, { alvos: AlvoMedido[]; id: string }>((entrada) => {
    const { alvos: lista, id } = entrada;
    const ns = "http://www.w3.org/2000/svg";
    const VERMELHO = "#e11d2e";
    const PAD_X = 14;
    const PAD_Y = 10;
    const MARGEM = 8; // folga mínima até a borda da tela
    const ALT = 28; // altura do rótulo
    const GAP = 20; // distância entre a marcação e o rótulo

    const antigo = document.getElementById(id);
    if (antigo) antigo.remove();

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const svg = document.createElementNS(ns, "svg");
    svg.id = id;
    Object.assign(svg.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML =
      '<marker id="ea-ajuda-ponta" markerWidth="12" markerHeight="12" refX="9" refY="6" ' +
      `orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${VERMELHO}"/></marker>`;
    svg.appendChild(defs);
    document.body.appendChild(svg);

    type Ret = { x: number; y: number; w: number; h: number };
    const inflar = (b: Caixa): Ret => ({
      x: b.x - PAD_X,
      y: b.y - PAD_Y,
      w: b.width + PAD_X * 2,
      h: b.height + PAD_Y * 2,
    });
    const colide = (a: Ret, b: Ret) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const dentro = (r: Ret) =>
      r.x >= MARGEM && r.y >= MARGEM && r.x + r.w <= vw - MARGEM && r.y + r.h <= vh - MARGEM;

    // ── PASSO 1: as marcações. Desenhadas todas antes dos rótulos, para que a colisão do rótulo
    //    conheça TODAS as marcações, e não só as que vieram antes dele na lista.
    const ocupados: Ret[] = [];
    for (const a of lista) {
      const r = inflar(a.box);
      ocupados.push(r);
      if (a.forma === "retangulo") {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", String(r.x));
        rect.setAttribute("y", String(r.y));
        rect.setAttribute("width", String(r.w));
        rect.setAttribute("height", String(r.h));
        rect.setAttribute("rx", "10");
        rect.setAttribute("fill", "none");
        rect.setAttribute("stroke", VERMELHO);
        rect.setAttribute("stroke-width", "3");
        svg.appendChild(rect);
      } else {
        const el = document.createElementNS(ns, "ellipse");
        el.setAttribute("cx", String(r.x + r.w / 2));
        el.setAttribute("cy", String(r.y + r.h / 2));
        el.setAttribute("rx", String(r.w / 2));
        el.setAttribute("ry", String(r.h / 2));
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", VERMELHO);
        el.setAttribute("stroke-width", "3");
        svg.appendChild(el);
      }
    }

    // ── PASSO 2: os rótulos, com largura MEDIDA, escolha de lado por folga, clamp de borda e
    //    desvio por colisão.
    const relatorio: RelatorioAnotacao = { colocados: [], naoResolvidos: [] };

    for (let i = 0; i < lista.length; i += 1) {
      const a = lista[i];
      const alvo = ocupados[i];
      const cx = alvo.x + alvo.w / 2;
      const cy = alvo.y + alvo.h / 2;

      // A LARGURA É MEDIDA, NUNCA ESTIMADA: o texto entra no documento e se mede sozinho.
      const texto = document.createElementNS(ns, "text");
      texto.setAttribute("text-anchor", "middle");
      texto.setAttribute("fill", "#fff");
      texto.setAttribute("font-size", "14");
      texto.setAttribute("font-family", "system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
      texto.setAttribute("font-weight", "600");
      texto.textContent = a.texto;
      svg.appendChild(texto);
      const larg = Math.ceil(texto.getComputedTextLength()) + 20;

      const ladoPreferido = a.lado ?? (cx > vw / 2 ? "esquerda" : "direita");
      const ordem = ["acima", "abaixo", ladoPreferido, "direita", "esquerda"];
      const candidatos = [ladoPreferido, ...ordem.filter((l) => l !== ladoPreferido)];

      const posicaoDe = (lado: string): Ret => {
        if (lado === "acima") return { x: cx - larg / 2, y: alvo.y - GAP - ALT, w: larg, h: ALT };
        if (lado === "abaixo") return { x: cx - larg / 2, y: alvo.y + alvo.h + GAP, w: larg, h: ALT };
        if (lado === "esquerda") return { x: alvo.x - GAP - larg, y: cy - ALT / 2, w: larg, h: ALT };
        return { x: alvo.x + alvo.w + GAP, y: cy - ALT / 2, w: larg, h: ALT };
      };
      const prender = (r: Ret): Ret => ({
        ...r,
        x: Math.min(Math.max(r.x, MARGEM), Math.max(vw - MARGEM - r.w, MARGEM)),
        y: Math.min(Math.max(r.y, MARGEM), Math.max(vh - MARGEM - r.h, MARGEM)),
      });

      let escolhido: Ret | null = null;
      let ladoEscolhido = "";
      let ajustado = false;

      // 2a. O lado que cabe INTEIRO na tela e não colide com nada já desenhado.
      for (const lado of candidatos) {
        const p = posicaoDe(lado);
        if (!dentro(p)) continue;
        if (ocupados.some((o) => colide(p, o))) continue;
        escolhido = p;
        ladoEscolhido = lado;
        break;
      }

      // 2b. Não coube inteiro: prende na borda (o defeito do rótulo cortado) e, se ainda colidir,
      //     EMPURRA em passos até achar lugar livre.
      if (!escolhido) {
        ajustado = true;
        busca: for (const lado of candidatos) {
          const base = prender(posicaoDe(lado));
          for (let passo = 0; passo <= 8; passo += 1) {
            for (const sinal of passo === 0 ? [1] : [1, -1]) {
              const deslocado =
                lado === "esquerda" || lado === "direita"
                  ? prender({ ...base, y: base.y + sinal * passo * (ALT + 8) })
                  : prender({ ...base, x: base.x + sinal * passo * (larg / 2 + 12) });
              if (!dentro(deslocado)) continue;
              if (ocupados.some((o) => colide(deslocado, o))) continue;
              escolhido = deslocado;
              ladoEscolhido = lado;
              break busca;
            }
          }
        }
      }

      if (!escolhido) {
        // Sem lugar: o rótulo escreveria por cima de outra anotação, e print que ensina errado é
        // pior do que print nenhum. Quem falha é o motor, lá fora.
        texto.remove();
        relatorio.naoResolvidos.push(a.texto);
        continue;
      }

      const fundo = document.createElementNS(ns, "rect");
      fundo.setAttribute("x", String(escolhido.x));
      fundo.setAttribute("y", String(escolhido.y));
      fundo.setAttribute("width", String(escolhido.w));
      fundo.setAttribute("height", String(escolhido.h));
      fundo.setAttribute("rx", "8");
      fundo.setAttribute("fill", VERMELHO);
      svg.insertBefore(fundo, texto);
      texto.setAttribute("x", String(escolhido.x + escolhido.w / 2));
      texto.setAttribute("y", String(escolhido.y + escolhido.h / 2 + 5));

      // A SETA: do rótulo até a borda da marcação, cortada nas duas pontas para não invadir nem um
      // nem outro.
      const rotuloCx = escolhido.x + escolhido.w / 2;
      const rotuloCy = escolhido.y + escolhido.h / 2;
      const naBorda = (r: Ret, versoX: number, versoY: number) => {
        const dx = versoX - (r.x + r.w / 2);
        const dy = versoY - (r.y + r.h / 2);
        const escala = Math.min(
          dx === 0 ? Infinity : r.w / 2 / Math.abs(dx),
          dy === 0 ? Infinity : r.h / 2 / Math.abs(dy),
        );
        const k = Number.isFinite(escala) ? escala : 0;
        return { x: r.x + r.w / 2 + dx * k, y: r.y + r.h / 2 + dy * k };
      };
      const p1 = naBorda(escolhido, cx, cy);
      const p2 = naBorda(alvo, rotuloCx, rotuloCy);
      const linha = document.createElementNS(ns, "line");
      linha.setAttribute("x1", String(p1.x));
      linha.setAttribute("y1", String(p1.y));
      linha.setAttribute("x2", String(p2.x));
      linha.setAttribute("y2", String(p2.y));
      linha.setAttribute("stroke", VERMELHO);
      linha.setAttribute("stroke-width", "3");
      linha.setAttribute("marker-end", "url(#ea-ajuda-ponta)");
      svg.insertBefore(linha, fundo);

      ocupados.push(escolhido);
      relatorio.colocados.push({ texto: a.texto, lado: ladoEscolhido, ajustado });
    }

    return relatorio;
  }, { alvos, id: ID_OVERLAY });
}

/** Tira a anotação da tela, para a próxima captura do mesmo roteiro nascer limpa. */
export async function limparAnotacao(page: Pagina): Promise<void> {
  await page.evaluate<void, string>((id) => {
    document.getElementById(id)?.remove();
  }, ID_OVERLAY);
}
