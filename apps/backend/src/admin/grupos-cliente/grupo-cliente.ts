/**
 * DOMÍNIO DO GRUPO DE CLIENTES (cenário 2). Puro, sem I/O, porque a regra é o que importa e ela
 * precisa ser testável sem banco.
 */

/**
 * A NORMALIZAÇÃO DO NOME, a mesma do catálogo de lojas: caixa alta, pontas cortadas, espaços
 * repetidos colapsados. Acento NÃO é removido, porque a extensão `unaccent` não está instalada no
 * banco e o índice único precisa usar exatamente esta mesma expressão.
 *
 * É ela que impede o grupo de nascer com o defeito que ele veio consertar: hoje o CAGC vive no
 * apelido do cliente em NOVE grafias, e `CAGC CORIFEU` convive com `CAGC CORIFEU ` como se fossem
 * dois grupos diferentes.
 */
export function nomeGrupoNormalizado(nome: string): string {
  return nome.trim().replace(/\s+/g, " ").toUpperCase();
}

export interface MembroAtual {
  codCliente: string;
  grupoId: string;
  grupoNome: string;
}

export type EfeitoMembro =
  | { codCliente: string; efeito: "ENTRA" }
  | { codCliente: string; efeito: "TROCA"; deGrupoId: string; deGrupoNome: string }
  | { codCliente: string; efeito: "JA_ESTA" }
  | { codCliente: string; efeito: "SAI" };

/**
 * O QUE VAI ACONTECER com cada cliente, antes de gravar.
 *
 * POR QUE A PRÉVIA EXISTE, e não é enfeite: mover um CNPJ de grupo é decisão administrativa com
 * consequência de leitura (o painel do grupo de origem perde aquela farmácia), e o banco não tem como
 * perguntar. A tela mostra "SAI de CAGC Frei Caneca e entra em CAGC Corifeu" ANTES, e o consultor
 * confirma sabendo. O que NÃO acontece, e a tela precisa dizer: as admissões antigas não se mexem,
 * porque o carimbo delas é histórico.
 *
 * `selecionados` é a lista COMPLETA de quem deve pertencer ao grupo depois de salvar. Quem estava e
 * saiu da lista vira `SAI`: o livreto trabalha por marcação, então desmarcar é uma ação legítima.
 */
export function efeitosDaGravacao(
  grupoId: string,
  selecionados: string[],
  membrosAtuais: MembroAtual[],
): EfeitoMembro[] {
  const porCliente = new Map(membrosAtuais.map((m) => [m.codCliente, m]));
  const alvo = new Set(selecionados);
  const efeitos: EfeitoMembro[] = [];

  for (const codCliente of alvo) {
    const atual = porCliente.get(codCliente);
    if (!atual) {
      efeitos.push({ codCliente, efeito: "ENTRA" });
    } else if (atual.grupoId === grupoId) {
      efeitos.push({ codCliente, efeito: "JA_ESTA" });
    } else {
      efeitos.push({
        codCliente,
        efeito: "TROCA",
        deGrupoId: atual.grupoId,
        deGrupoNome: atual.grupoNome,
      });
    }
  }

  // Quem ERA deste grupo e não está mais na lista sai dele, e fica sem grupo nenhum. Não é atribuído
  // a outro por conta própria: ficar sem grupo é estado válido, e adivinhar destino seria invenção.
  for (const m of membrosAtuais) {
    if (m.grupoId === grupoId && !alvo.has(m.codCliente)) {
      efeitos.push({ codCliente: m.codCliente, efeito: "SAI" });
    }
  }

  return efeitos;
}

/** O resumo que a confirmação mostra. Números dos dois lados, nunca só "tem certeza?". */
export function resumoDosEfeitos(efeitos: EfeitoMembro[]) {
  return {
    entram: efeitos.filter((e) => e.efeito === "ENTRA").length,
    trocam: efeitos.filter((e) => e.efeito === "TROCA").length,
    saem: efeitos.filter((e) => e.efeito === "SAI").length,
    jaEstao: efeitos.filter((e) => e.efeito === "JA_ESTA").length,
  };
}
