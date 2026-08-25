/*
 * Formulario de VT online, lado do candidato (app Firebase, fora do EA).
 *
 * Fluxo:
 *   1. Le o token da URL (?t=...). Verifica a assinatura Ed25519 OFFLINE com a chave publica
 *      embutida (so para UX). Se invalido/expirado, para com mensagem clara.
 *   2. Identificacao: o candidato digita CPF + data de nascimento; conferimos o CPF contra o claim
 *      e sha256(`${cpf}|${dataNascimento}`) contra o claim nascHash antes de liberar o formulario.
 *   3. Formulario: endereco (CEP via ViaCEP direto do navegador), optante, conducoes IDA/VOLTA com
 *      sugestao de tarifa do snapshot local, totais.
 *   4. Tres avisos sequenciais, depois o envio.
 *   5. POST para a Cloud Function (/api/enviar). A verificacao AUTORITATIVA acontece la.
 *
 * LGPD: CPF, data de nascimento e token ficam so em memoria; nunca vao para console/log.
 * Nenhum travessao (U+2014) nos textos: virgula, ponto ou dois-pontos.
 */
(function () {
  "use strict";

  // Chave publica Ed25519 do EA (metade publica, segura para embarcar). 32 bytes crus, hex.
  const PUB_HEX = "d74a44efc362f3265276f7b363b85436e9c6a05692cd5cbc9b683a80d535a726";

  const OUTRA = "__OUTRA__";
  const CARTOES = [
    { valor: "BILHETE_UNICO", rotulo: "Bilhete Unico" },
    { valor: "CARTAO_TOP", rotulo: "Cartao TOP" },
    { valor: "OUTRO", rotulo: "Outro" },
  ];

  // Os 3 avisos, copiados da tela /vt do EA (AVISOS).
  const AVISOS = [
    {
      titulo: "Assinatura digital",
      texto:
        "Voce vai assinar este formulario digitalmente junto com o seu contrato de trabalho.",
    },
    {
      titulo: "Veracidade das informacoes",
      texto: "Voce declara que todas as informacoes preenchidas sao verdadeiras.",
    },
    {
      titulo: "Uso do vale-transporte",
      texto:
        "O vale-transporte e para uso no deslocamento casa-trabalho e trabalho-casa, em transporte publico.",
    },
  ];

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  // ── Estado ──────────────────────────────────────────────────────────────────
  const S = {
    tokenRaw: null,
    claims: null,
    cpf: "", // credencial em memoria (11 digitos)
    dataNascimento: "",
    tarifas: [],
    optante: null,
    conducoes: [], // itens {sentido, cidade, cidadeOutra, tipoTransporte, cartao, cartaoOutro, valor, el}
  };

  const root = document.getElementById("root");

  // ── Utilidades ────────────────────────────────────────────────────────────────
  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function limpar(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToUtf8(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  async function sha256hex(texto) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function soDigitos(v) {
    return (v || "").replace(/\D/g, "");
  }
  function mascararCpf(v) {
    const d = soDigitos(v).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  function mascararCep(v) {
    const d = soDigitos(v).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, "$1-$2");
  }
  function parseValor(entrada) {
    const n = Number((entrada || "").trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }

  // ── Verificacao do token (offline, UX) ─────────────────────────────────────────
  async function verificarTokenOffline(tokenRaw) {
    const partes = (tokenRaw || "").split(".");
    if (partes.length !== 3) return null;
    let header, claims;
    try {
      header = JSON.parse(bytesToUtf8(b64urlToBytes(partes[0])));
      claims = JSON.parse(bytesToUtf8(b64urlToBytes(partes[1])));
    } catch (_e) {
      return null;
    }
    if (header.alg !== "EdDSA") return null;

    const msg = new TextEncoder().encode(partes[0] + "." + partes[1]);
    const sig = b64urlToBytes(partes[2]);
    let ok = false;
    try {
      ok = await window.Ed25519.verify(sig, msg, hexToBytes(PUB_HEX));
    } catch (_e) {
      ok = false;
    }
    if (!ok) return null;

    const agora = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= agora) return null;
    if (!claims.cpf || !claims.nascHash || !claims.nome) return null;
    return claims;
  }

  // ── Select pesquisavel (espelha o SelectBusca do EA) ────────────────────────────
  function criarSelect(opts) {
    // opts: { opcoes:[{valor,rotulo}], valor, placeholder, buscaPlaceholder, onChange, disabled }
    const wrap = el("div", "select");
    const botao = el("button", "entrada select-botao", { type: "button", "aria-haspopup": "listbox" });
    const texto = el("span", "select-texto");
    const seta = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    seta.setAttribute("viewBox", "0 0 24 24");
    seta.setAttribute("fill", "none");
    seta.setAttribute("class", "seta");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m6 9 6 6 6-6");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    seta.appendChild(path);
    botao.appendChild(texto);
    botao.appendChild(seta);
    wrap.appendChild(botao);

    let valor = opts.valor || "";
    let opcoes = opts.opcoes || [];
    let aberto = false;

    function rotuloAtual() {
      const o = opcoes.find((x) => x.valor === valor);
      return o ? o.rotulo : "";
    }
    function pintar() {
      const r = rotuloAtual();
      limpar(texto);
      texto.textContent = r || opts.placeholder || "Selecione";
      texto.className = r ? "select-texto" : "select-texto rotulo-vazio";
      botao.setAttribute("aria-expanded", aberto ? "true" : "false");
      botao.disabled = !!opts.disabled;
    }

    let painel = null;
    let fundo = null;
    function fechar() {
      aberto = false;
      if (painel) painel.remove();
      if (fundo) fundo.remove();
      painel = null;
      fundo = null;
      pintar();
    }
    function abrir() {
      if (opts.disabled) return;
      aberto = true;
      pintar();
      fundo = el("div", "select-fundo");
      fundo.addEventListener("click", fechar);
      painel = el("div", "select-painel");
      const busca = el("input", "select-busca", { placeholder: opts.buscaPlaceholder || "Buscar" });
      const lista = el("ul", "select-lista", { role: "listbox" });
      painel.appendChild(busca);
      painel.appendChild(lista);

      function render(filtro) {
        limpar(lista);
        const q = (filtro || "").trim().toLowerCase();
        const fs = q ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(q)) : opcoes;
        if (fs.length === 0) {
          const vazio = el("li", "select-vazio");
          vazio.textContent = "Nenhuma opcao encontrada.";
          lista.appendChild(vazio);
          return;
        }
        fs.forEach((o) => {
          const li = el("li");
          const b = el("button", "select-item", {
            type: "button",
            role: "option",
            "aria-selected": o.valor === valor ? "true" : "false",
          });
          b.textContent = o.rotulo;
          b.addEventListener("click", () => {
            valor = o.valor;
            fechar();
            if (opts.onChange) opts.onChange(valor);
          });
          li.appendChild(b);
          lista.appendChild(li);
        });
      }
      render("");
      busca.addEventListener("input", () => render(busca.value));
      wrap.appendChild(fundo);
      wrap.appendChild(painel);
      busca.focus();
    }
    botao.addEventListener("click", () => (aberto ? fechar() : abrir()));

    pintar();
    return {
      elemento: wrap,
      getValor: () => valor,
      setValor: (v) => {
        valor = v;
        pintar();
      },
      setOpcoes: (novas) => {
        opcoes = novas;
        pintar();
      },
      setDisabled: (d) => {
        opts.disabled = d;
        pintar();
      },
    };
  }

  // ── Blocos de UI ────────────────────────────────────────────────────────────
  function campo(rotulo, controle) {
    const c = el("div", "campo");
    const r = el("span", "campo-rotulo");
    r.textContent = rotulo;
    c.appendChild(r);
    c.appendChild(controle);
    return c;
  }
  function secao(titulo, acessorio) {
    const s = el("section", "secao");
    const cab = el("div", "secao-cabeca");
    const h = el("h2", "secao-titulo");
    h.textContent = titulo;
    cab.appendChild(h);
    if (acessorio) cab.appendChild(acessorio);
    const corpo = el("div", "secao-corpo");
    s.appendChild(cab);
    s.appendChild(corpo);
    s._corpo = corpo;
    return s;
  }

  // ── Listas de tarifas ─────────────────────────────────────────────────────────
  function cidadesTarifa() {
    const set = Array.from(new Set(S.tarifas.map((t) => t.cidade)));
    set.sort((a, b) => a.localeCompare(b, "pt-BR"));
    return set;
  }
  function opcoesCidade() {
    return cidadesTarifa()
      .map((c) => ({ valor: c, rotulo: c }))
      .concat([{ valor: OUTRA, rotulo: "Outra" }]);
  }
  function tiposDaCidade(c) {
    return S.tarifas
      .filter((t) => t.cidade === c)
      .map((t) => ({ valor: t.tipoTransporte, rotulo: t.tipoTransporte }));
  }
  function sugestao(c, tipo) {
    return S.tarifas.find((t) => t.cidade === c && t.tipoTransporte === tipo);
  }

  // ── Telas ──────────────────────────────────────────────────────────────────
  function telaErro(mensagem) {
    limpar(root);
    const h = el("h1", "titulo");
    h.textContent = "Nao foi possivel abrir o formulario";
    const p = el("p", "alerta alerta-id");
    p.setAttribute("role", "alert");
    p.textContent = mensagem;
    root.appendChild(h);
    root.appendChild(p);
  }

  function telaIdentificacao() {
    limpar(root);
    const h = el("h1", "titulo");
    h.textContent = "Formulario de vale-transporte";
    const p = el("p", "sub");
    p.textContent =
      "Para comecar, confirme quem e voce. Informe o seu CPF e a sua data de nascimento.";
    const form = el("form", "formulario");
    form.style.marginTop = "28px";
    form.setAttribute("novalidate", "");

    const inCpf = el("input", "entrada", {
      inputmode: "numeric",
      autocomplete: "off",
      placeholder: "000.000.000-00",
    });
    inCpf.addEventListener("input", () => {
      inCpf.value = mascararCpf(inCpf.value);
    });
    const inData = el("input", "entrada", { type: "date" });

    const botao = el("button", "botao", { type: "submit" });
    botao.textContent = "Continuar";

    const erro = el("p", "alerta alerta-id");
    erro.setAttribute("role", "alert");
    erro.style.display = "none";

    form.appendChild(campo("CPF", inCpf));
    form.appendChild(campo("Data de nascimento", inData));
    form.appendChild(botao);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      erro.style.display = "none";
      const cpf = soDigitos(inCpf.value);
      const data = inData.value;
      const msgFalha =
        "Dados nao encontrados. Confira o CPF e a data de nascimento, ou procure o RH.";
      if (cpf.length !== 11 || !data) {
        erro.textContent = msgFalha;
        erro.style.display = "";
        return;
      }
      botao.disabled = true;
      botao.textContent = "Verificando...";
      try {
        const cpfOk = cpf === String(S.claims.cpf);
        const hashOk = (await sha256hex(cpf + "|" + data)) === String(S.claims.nascHash);
        if (!cpfOk || !hashOk) {
          erro.textContent = msgFalha;
          erro.style.display = "";
          botao.disabled = false;
          botao.textContent = "Continuar";
          return;
        }
        S.cpf = cpf;
        S.dataNascimento = data;
        telaFormulario();
      } catch (_e) {
        erro.textContent = msgFalha;
        erro.style.display = "";
        botao.disabled = false;
        botao.textContent = "Continuar";
      }
    });

    root.appendChild(h);
    root.appendChild(p);
    root.appendChild(form);
    root.appendChild(erro);
  }

  // ── Formulario ────────────────────────────────────────────────────────────────
  function telaFormulario() {
    limpar(root);
    const primeiroNome = String(S.claims.nome || "").split(" ")[0] || "";

    const header = el("header");
    header.style.marginBottom = "24px";
    const rt = el("p", "rotulo-topo");
    rt.textContent = "Vale-transporte";
    const h = el("h1", "saudacao");
    h.textContent = "Ola, " + primeiroNome;
    const nc = el("p", "nome-completo");
    nc.textContent = S.claims.nome;
    header.appendChild(rt);
    header.appendChild(h);
    header.appendChild(nc);
    root.appendChild(header);

    // Endereco
    const sEnd = secao("Seu endereco");
    const cepWrap = el("div", "cep-wrap");
    const inCep = el("input", "entrada", { inputmode: "numeric", placeholder: "00000-000" });
    const cepStatus = el("span", "cep-status");
    cepStatus.textContent = "buscando";
    cepStatus.style.display = "none";
    cepWrap.appendChild(inCep);
    cepWrap.appendChild(cepStatus);
    const erroCep = el("p", "erro-inline");
    erroCep.style.display = "none";
    const campoCep = campo("CEP", cepWrap);
    campoCep.appendChild(erroCep);

    const inLogradouro = el("input", "entrada", { placeholder: "Rua, avenida..." });
    const inNumero = el("input", "entrada", { placeholder: "123" });
    const inComplemento = el("input", "entrada", { placeholder: "apto, bloco", maxlength: "100" });
    const inBairro = el("input", "entrada");
    const inUf = el("input", "entrada", { maxlength: "2" });
    inUf.addEventListener("input", () => {
      inUf.value = inUf.value.toUpperCase();
    });

    const selCidade = criarSelect({
      opcoes: opcoesCidade(),
      placeholder: "Selecione",
      buscaPlaceholder: "Busque a sua cidade",
      onChange: (v) => {
        campoCidadeOutra.style.display = v === OUTRA ? "" : "none";
        if (v !== OUTRA) inCidadeOutra.value = "";
      },
    });
    const inCidadeOutra = el("input", "entrada", { placeholder: "Nome da cidade", maxlength: "120" });
    const campoCidadeOutra = campo("Qual cidade?", inCidadeOutra);
    campoCidadeOutra.style.display = "none";

    const grade = el("div", "grade-cidade");
    grade.appendChild(campo("Cidade", selCidade.elemento));
    grade.appendChild(campo("UF", inUf));

    const gradeNum = el("div", "grade-2");
    gradeNum.appendChild(campo("Numero", inNumero));
    gradeNum.appendChild(campo("Complemento", inComplemento));

    sEnd._corpo.appendChild(campoCep);
    sEnd._corpo.appendChild(campo("Endereco", inLogradouro));
    sEnd._corpo.appendChild(gradeNum);
    sEnd._corpo.appendChild(campo("Bairro", inBairro));
    sEnd._corpo.appendChild(grade);
    sEnd._corpo.appendChild(campoCidadeOutra);
    root.appendChild(sEnd);

    // CEP autolookup (ViaCEP direto do navegador).
    async function buscarCep() {
      const limpo = soDigitos(inCep.value);
      if (limpo.length !== 8) return;
      cepStatus.style.display = "";
      erroCep.style.display = "none";
      try {
        const resp = await fetch("https://viacep.com.br/ws/" + limpo + "/json/");
        const d = await resp.json();
        if (d.erro) throw new Error("CEP nao encontrado.");
        inLogradouro.value = d.logradouro || "";
        inBairro.value = d.bairro || "";
        inUf.value = (d.uf || "").toUpperCase();
        const cidade = d.localidade || "";
        if (cidadesTarifa().indexOf(cidade) >= 0) {
          selCidade.setValor(cidade);
          campoCidadeOutra.style.display = "none";
          inCidadeOutra.value = "";
        } else if (cidade) {
          selCidade.setValor(OUTRA);
          inCidadeOutra.value = cidade;
          campoCidadeOutra.style.display = "";
        }
      } catch (_e) {
        erroCep.textContent = "Nao foi possivel consultar o CEP. Preencha o endereco manualmente.";
        erroCep.style.display = "";
      } finally {
        cepStatus.style.display = "none";
      }
    }
    inCep.addEventListener("input", () => {
      inCep.value = mascararCep(inCep.value);
      if (soDigitos(inCep.value).length === 8) buscarCep();
    });

    // Optante
    const sOpt = secao("Voce quer o vale-transporte?");
    const opcoes = el("div", "opcoes");
    const btnSim = el("button", "opcao", { type: "button", "aria-pressed": "false" });
    btnSim.innerHTML =
      '<span class="opcao-titulo">Sim, quero</span><span class="opcao-desc">Vou usar transporte publico.</span>';
    const btnNao = el("button", "opcao", { type: "button", "aria-pressed": "false" });
    btnNao.innerHTML =
      '<span class="opcao-titulo">Nao quero</span><span class="opcao-desc">Uso meios proprios.</span>';
    opcoes.appendChild(btnSim);
    opcoes.appendChild(btnNao);
    sOpt._corpo.appendChild(opcoes);
    root.appendChild(sOpt);

    // Container dos itinerarios + totais (so aparece para optante).
    const areaItinerarios = el("div");
    root.appendChild(areaItinerarios);

    // Botao de envio + erro.
    const botaoEnviar = el("button", "botao", { type: "button" });
    botaoEnviar.textContent = "Enviar formulario";
    botaoEnviar.style.marginTop = "28px";
    botaoEnviar.style.display = "none";
    const erroEnvio = el("p", "alerta");
    erroEnvio.setAttribute("role", "alert");
    erroEnvio.style.display = "none";
    root.appendChild(botaoEnviar);
    root.appendChild(erroEnvio);

    // Estruturas dos itinerarios.
    let totaisBox = null;
    const refsTotais = {};

    function totalDe(sentido) {
      return S.conducoes
        .filter((c) => c.sentido === sentido)
        .reduce((s, c) => s + parseValor(c.valor), 0);
    }
    function atualizarTotais() {
      const ti = totalDe("IDA");
      const tv = totalDe("VOLTA");
      if (refsTotais.ida) refsTotais.ida.textContent = BRL.format(ti);
      if (refsTotais.volta) refsTotais.volta.textContent = BRL.format(tv);
      if (refsTotais.dia) refsTotais.dia.textContent = BRL.format(ti + tv);
      if (refsTotais.secaoIda) refsTotais.secaoIda.textContent = BRL.format(ti);
      if (refsTotais.secaoVolta) refsTotais.secaoVolta.textContent = BRL.format(tv);
    }

    function criarConducaoUI(item, indexNaSecao, corpoSecao) {
      const card = el("div", "conducao-card");
      item.el = card;

      function render() {
        limpar(card);
        const topo = el("div", "conducao-topo");
        const num = el("span", "conducao-num");
        const idx = S.conducoes.filter((c) => c.sentido === item.sentido).indexOf(item) + 1;
        num.textContent = "Conducao " + idx;
        const rem = el("button", "conducao-remover", { type: "button" });
        rem.textContent = "remover";
        rem.addEventListener("click", () => {
          S.conducoes = S.conducoes.filter((c) => c !== item);
          card.remove();
          // Renumera os cartoes restantes da secao.
          Array.from(corpoSecao.querySelectorAll(".conducao-num")).forEach((n, i) => {
            n.textContent = "Conducao " + (i + 1);
          });
          atualizarTotais();
        });
        topo.appendChild(num);
        topo.appendChild(rem);
        card.appendChild(topo);

        const corpo = el("div", "conducao-corpo");

        // Cidade
        const selC = criarSelect({
          opcoes: opcoesCidade(),
          valor: item.cidade,
          placeholder: "Selecione",
          buscaPlaceholder: "Busque a cidade",
          onChange: (v) => {
            if (v !== item.cidade) {
              item.cidade = v;
              item.tipoTransporte = "";
              item.valor = "";
              if (v !== OUTRA) item.cidadeOutra = "";
              render();
              atualizarTotais();
            }
          },
        });
        corpo.appendChild(campo("Cidade", selC.elemento));

        if (item.cidade === OUTRA) {
          const inCidadeOutra = el("input", "entrada", {
            placeholder: "Nome da cidade",
            maxlength: "120",
          });
          inCidadeOutra.value = item.cidadeOutra;
          inCidadeOutra.addEventListener("input", () => (item.cidadeOutra = inCidadeOutra.value));
          corpo.appendChild(campo("Qual cidade?", inCidadeOutra));
        }

        // Tipo de transporte
        let controleTipo;
        if (item.cidade === OUTRA) {
          controleTipo = el("input", "entrada", {
            placeholder: "Ex.: Onibus municipal",
            maxlength: "120",
          });
          controleTipo.value = item.tipoTransporte;
          controleTipo.addEventListener("input", () => (item.tipoTransporte = controleTipo.value));
          corpo.appendChild(campo("Tipo de transporte", controleTipo));
        } else {
          const selT = criarSelect({
            opcoes: item.cidade ? tiposDaCidade(item.cidade) : [],
            valor: item.tipoTransporte,
            placeholder: item.cidade ? "Selecione" : "Escolha a cidade antes",
            buscaPlaceholder: "Busque o transporte",
            disabled: !item.cidade,
            onChange: (v) => {
              item.tipoTransporte = v;
              const t = sugestao(item.cidade, v);
              if (t) {
                item.valor = t.valor.toFixed(2).replace(".", ",");
                inValor.value = item.valor;
                dicaValor.style.display = "";
              }
              atualizarTotais();
            },
          });
          corpo.appendChild(campo("Tipo de transporte", selT.elemento));
        }

        // Cartao
        const selCartao = criarSelect({
          opcoes: CARTOES,
          valor: item.cartao,
          placeholder: "Selecione",
          buscaPlaceholder: "Busque o cartao",
          onChange: (v) => {
            if (v !== item.cartao) {
              item.cartao = v;
              item.cartaoOutro = "";
              render();
            }
          },
        });
        corpo.appendChild(campo("Cartao utilizado", selCartao.elemento));

        if (item.cartao === "OUTRO") {
          const inCartaoOutro = el("input", "entrada", {
            placeholder: "Nome do cartao",
            maxlength: "60",
          });
          inCartaoOutro.value = item.cartaoOutro;
          inCartaoOutro.addEventListener("input", () => (item.cartaoOutro = inCartaoOutro.value));
          corpo.appendChild(campo("Qual cartao?", inCartaoOutro));
        }

        // Valor
        const inValor = el("input", "entrada", { inputmode: "decimal", placeholder: "0,00" });
        inValor.value = item.valor;
        inValor.addEventListener("input", () => {
          item.valor = inValor.value;
          atualizarTotais();
        });
        const campoValor = campo("Valor da passagem", inValor);
        const dicaValor = el("p", "dica");
        dicaValor.textContent = "Sugerido pela tabela. Ajuste se o seu valor for diferente.";
        dicaValor.style.display = item.tipoTransporte && item.cidade !== OUTRA ? "" : "none";
        campoValor.appendChild(dicaValor);
        corpo.appendChild(campoValor);

        card.appendChild(corpo);
      }

      render();
      return card;
    }

    function montarItinerarios() {
      limpar(areaItinerarios);
      refsTotais.ida = refsTotais.volta = refsTotais.dia = null;
      refsTotais.secaoIda = refsTotais.secaoVolta = null;
      if (S.optante !== true) return;

      ["IDA", "VOLTA"].forEach((sentido) => {
        const acessorio = el("span", "secao-total");
        const s = secao(sentido === "IDA" ? "Itinerario de ida" : "Itinerario de volta", acessorio);
        if (sentido === "IDA") refsTotais.secaoIda = acessorio;
        else refsTotais.secaoVolta = acessorio;

        const ajuda = el("p", "ajuda");
        ajuda.textContent =
          sentido === "IDA"
            ? "Da sua casa ate o trabalho. Adicione uma conducao para cada transporte que voce pega."
            : "Do trabalho ate a sua casa.";
        s._corpo.appendChild(ajuda);

        S.conducoes
          .filter((c) => c.sentido === sentido)
          .forEach((c) => s._corpo.appendChild(criarConducaoUI(c, 0, s._corpo)));

        const add = el("button", "adicionar", { type: "button" });
        add.textContent = "+ Adicionar conducao";
        add.addEventListener("click", () => {
          const novo = {
            sentido,
            cidade: "",
            cidadeOutra: "",
            tipoTransporte: "",
            cartao: "",
            cartaoOutro: "",
            valor: "",
          };
          S.conducoes.push(novo);
          s._corpo.insertBefore(criarConducaoUI(novo, 0, s._corpo), add);
          atualizarTotais();
        });
        s._corpo.appendChild(add);
        areaItinerarios.appendChild(s);
      });

      // Bloco de totais.
      totaisBox = el("div", "totais");
      const l1 = el("div", "totais-linha");
      const l1v = el("span", "totais-valor");
      refsTotais.ida = l1v;
      l1.innerHTML = "<span>Total da ida</span>";
      l1.appendChild(l1v);
      const l2 = el("div", "totais-linha");
      const l2v = el("span", "totais-valor");
      refsTotais.volta = l2v;
      l2.innerHTML = "<span>Total da volta</span>";
      l2.appendChild(l2v);
      const dia = el("div", "totais-dia");
      const diaR = el("span", "totais-dia-rotulo");
      diaR.textContent = "Total do dia";
      const diaV = el("span", "totais-dia-valor");
      refsTotais.dia = diaV;
      dia.appendChild(diaR);
      dia.appendChild(diaV);
      totaisBox.appendChild(l1);
      totaisBox.appendChild(l2);
      totaisBox.appendChild(dia);
      areaItinerarios.appendChild(totaisBox);

      atualizarTotais();
    }

    function escolherOptante(valor) {
      S.optante = valor;
      btnSim.setAttribute("aria-pressed", valor === true ? "true" : "false");
      btnNao.setAttribute("aria-pressed", valor === false ? "true" : "false");
      if (valor === true && S.conducoes.length === 0) {
        S.conducoes = [
          { sentido: "IDA", cidade: "", cidadeOutra: "", tipoTransporte: "", cartao: "", cartaoOutro: "", valor: "" },
          { sentido: "VOLTA", cidade: "", cidadeOutra: "", tipoTransporte: "", cartao: "", cartaoOutro: "", valor: "" },
        ];
      }
      if (valor === false) S.conducoes = [];
      montarItinerarios();
      botaoEnviar.style.display = "";
    }
    btnSim.addEventListener("click", () => escolherOptante(true));
    btnNao.addEventListener("click", () => escolherOptante(false));

    // Validacao de tela (o servidor revalida tudo).
    function pendencia() {
      const cidade = selCidade.getValor() === OUTRA ? inCidadeOutra.value.trim() : selCidade.getValor();
      if (S.optante === null) return "Escolha se voce quer ou nao o vale-transporte.";
      if (soDigitos(inCep.value).length !== 8) return "Informe o seu CEP.";
      if (!inLogradouro.value.trim()) return "Informe o seu endereco.";
      if (!inNumero.value.trim()) return "Informe o numero do seu endereco.";
      if (!inBairro.value.trim()) return "Informe o seu bairro.";
      if (!cidade) return "Informe a sua cidade.";
      if (inUf.value.trim().length !== 2) return "Informe a UF, 2 letras.";
      if (S.optante === true) {
        if (S.conducoes.length === 0) return "Adicione pelo menos uma conducao.";
        for (const c of S.conducoes) {
          if (!c.cidade) return "Escolha a cidade de cada conducao.";
          if (c.cidade === OUTRA && !c.cidadeOutra.trim()) return "Informe qual e a cidade.";
          if (!c.tipoTransporte.trim()) return "Informe o transporte de cada conducao.";
          if (!c.cartao) return "Escolha o cartao utilizado em cada conducao.";
          if (c.cartao === "OUTRO" && !c.cartaoOutro.trim()) return "Informe qual e o cartao.";
        }
      }
      return null;
    }

    function montarPayload() {
      const cidade = selCidade.getValor() === OUTRA ? inCidadeOutra.value.trim() : selCidade.getValor();
      return {
        cpf: S.cpf,
        dataNascimento: S.dataNascimento,
        optante: S.optante,
        cep: soDigitos(inCep.value),
        logradouro: inLogradouro.value.trim(),
        numero: inNumero.value.trim(),
        complemento: inComplemento.value.trim(),
        bairro: inBairro.value.trim(),
        cidade: cidade,
        uf: inUf.value.trim().toUpperCase(),
        conducoes:
          S.optante === true
            ? S.conducoes.map((c) => ({
                sentido: c.sentido,
                cidade: c.cidade === OUTRA ? c.cidadeOutra.trim() : c.cidade,
                tipoTransporte: c.tipoTransporte.trim(),
                cartao: c.cartao,
                cartaoOutro: c.cartao === "OUTRO" ? c.cartaoOutro.trim() : undefined,
                valor: parseValor(c.valor),
              }))
            : [],
      };
    }

    botaoEnviar.addEventListener("click", () => {
      const p = pendencia();
      if (p) {
        erroEnvio.textContent = p;
        erroEnvio.style.display = "";
        return;
      }
      erroEnvio.style.display = "none";
      abrirAvisos(montarPayload(), erroEnvio);
    });
  }

  // ── Avisos (modal sequencial) + envio ──────────────────────────────────────────
  function abrirAvisos(payload, erroEnvio) {
    let idx = 0;
    const fundo = el("div", "modal-fundo", { role: "dialog", "aria-modal": "true" });
    const modal = el("div", "modal");
    fundo.appendChild(modal);
    document.body.appendChild(fundo);

    let enviando = false;

    function render() {
      limpar(modal);
      const passos = el("div", "modal-passos");
      AVISOS.forEach((_, i) => {
        const p = el("span", "modal-passo" + (i <= idx ? " ativo" : ""));
        passos.appendChild(p);
      });
      const contador = el("p", "modal-contador");
      contador.textContent = "Aviso " + (idx + 1) + " de " + AVISOS.length;
      const titulo = el("h2", "modal-titulo");
      titulo.textContent = AVISOS[idx].titulo;
      const texto = el("p", "modal-texto");
      texto.textContent = AVISOS[idx].texto;
      const acoes = el("div", "modal-acoes");

      const principal = el("button", "botao", { type: "button" });
      if (idx < AVISOS.length - 1) {
        principal.textContent = "Avancar";
        principal.addEventListener("click", () => {
          idx++;
          render();
        });
      } else {
        principal.textContent = "Estou ciente das informacoes passadas";
        principal.addEventListener("click", () => enviar(principal));
      }
      const voltar = el("button", "botao-secundario", { type: "button" });
      voltar.textContent = "Voltar ao formulario";
      voltar.addEventListener("click", () => {
        if (!enviando) fundo.remove();
      });
      acoes.appendChild(principal);
      acoes.appendChild(voltar);

      modal.appendChild(passos);
      modal.appendChild(contador);
      modal.appendChild(titulo);
      modal.appendChild(texto);
      modal.appendChild(acoes);
    }

    async function enviar(botao) {
      enviando = true;
      botao.disabled = true;
      botao.textContent = "Enviando...";
      try {
        const resp = await fetch("/api/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: S.tokenRaw, payload: payload }),
        });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok || !dados.ok) {
          throw new Error(dados.erro || "Nao foi possivel enviar. Tente de novo.");
        }
        fundo.remove();
        telaEnviado(payload.optante, dados.pdfBase64);
      } catch (e) {
        fundo.remove();
        erroEnvio.textContent = e && e.message ? e.message : "Nao foi possivel enviar. Tente de novo.";
        erroEnvio.style.display = "";
      } finally {
        enviando = false;
      }
    }

    render();
  }

  /**
   * PDF de base64 para Blob, uma vez so.
   *
   * BLOB, E NAO UMA `data:` URL: no celular a `data:` URL de um PDF de dezenas de KB ou e recusada
   * pelo navegador ou abre uma aba em branco. O Blob tem URL propria, curta, que o Safari e o Chrome
   * do Android tratam como arquivo de verdade.
   */
  function pdfParaUrl(b64) {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } catch (e) {
      return null;
    }
  }

  function telaEnviado(optante, pdfBase64) {
    limpar(root);
    const box = el("div", "centro");
    box.style.padding = "8px 0";
    const icone = el("div", "ok-icone");
    icone.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28"><path d="m5 12 5 5L20 7"/></svg>';
    const h = el("h1", "saudacao");
    h.style.marginTop = "20px";
    h.textContent = "Formulario enviado";
    const p = el("p", "sub");
    p.style.maxWidth = "320px";
    p.style.margin = "8px auto 0";
    p.textContent = optante
      ? "Recebemos o seu vale-transporte. Ele sera anexado ao seu kit de admissao para assinatura junto com o contrato."
      : "Registramos que voce nao optou pelo vale-transporte. A sua declaracao sera anexada ao kit de admissao.";
    box.appendChild(icone);
    box.appendChild(h);
    box.appendChild(p);

    /*
     * O FORMULARIO PARA O CANDIDATO CONFERIR E GUARDAR.
     *
     * ISTO FALTAVA POR COMPLETO: a tela final so dizia "enviado" e a funcao, que tinha o PDF na mao,
     * nao o devolvia. A pessoa terminava o preenchimento sem nunca ver o que assinou embaixo.
     *
     * SAO DOIS LINKS DE VERDADE (`<a>`), e nao botoes com javascript: dentro do gesto do toque o
     * navegador do celular trata link como link, sem cair no bloqueio de pop-up que `window.open`
     * sofre. "Ver" abre em outra aba, e e por ali que o iPhone oferece o compartilhar e o salvar;
     * "Baixar" usa o atributo `download`, que resolve no Android e no computador.
     *
     * SEM O PDF NA RESPOSTA (versao antiga da funcao ainda no ar), nada disso e desenhado: melhor a
     * tela seguir como era do que oferecer um botao que nao abre nada.
     */
    const url = pdfBase64 ? pdfParaUrl(pdfBase64) : null;
    if (url) {
      const nomeArquivo = optante
        ? "formulario-vale-transporte.pdf"
        : "declaracao-vale-transporte.pdf";

      const acoes = el("div", "acoes-formulario");

      const ver = el("a", "botao", { href: url, target: "_blank", rel: "noopener" });
      ver.textContent = "Ver o formulario";

      const baixar = el("a", "botao-secundario", { href: url, download: nomeArquivo });
      baixar.textContent = "Baixar";

      acoes.appendChild(ver);
      acoes.appendChild(baixar);
      box.appendChild(acoes);

      const dica = el("p", "sub");
      dica.style.maxWidth = "320px";
      dica.style.margin = "12px auto 0";
      dica.textContent = "Guarde uma copia com voce. O RH ja recebeu a sua.";
      box.appendChild(dica);
    }

    root.appendChild(box);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function carregarTarifas() {
    try {
      const resp = await fetch("/tarifas.json");
      S.tarifas = await resp.json();
    } catch (_e) {
      S.tarifas = []; // sem tarifa a tela ainda funciona: tudo cai em "Outra".
    }
  }

  async function iniciar() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");
    const msgInvalido = "Link invalido ou expirado, peca um novo ao consultor.";
    if (!token) {
      telaErro(msgInvalido);
      return;
    }
    const claims = await verificarTokenOffline(token);
    if (!claims) {
      telaErro(msgInvalido);
      return;
    }
    S.tokenRaw = token;
    S.claims = claims;
    await carregarTarifas();
    telaIdentificacao();
  }

  iniciar();
})();
