/**
 * DIAS ÚTEIS E FERIADOS NACIONAIS BRASILEIROS.
 *
 * Por que existe: o termômetro do Alto Volume contava dias CORRIDOS, e "faltam 10 dias" num período
 * que pega dois fins de semana e o 7 de setembro é mentira operacional. Ninguém audita documento no
 * domingo, então o prazo real de captação é em dia útil, e é isso que o card passa a dizer.
 *
 * FEITO EM CÓDIGO, SEM BIBLIOTECA NOVA, e a escolha é deliberada. A regra brasileira é fechada e
 * pequena: oito datas fixas, uma que entrou em 2024 e uma móvel que sai da Páscoa. Uma dependência
 * traria tabela de feriado estadual e municipal que não queremos, e ficaria desatualizada num canto
 * do `package.json` justamente na virada de lei, que é quando o dado importa. Aqui a fonte é a lei e
 * está escrita ao lado de cada data.
 *
 * FONTE DE CADA FERIADO (feriados NACIONAIS, os que valem no país inteiro):
 *   Lei 662/1949 e Lei 10.607/2002 . 1 jan, 21 abr, 1 mai, 7 set, 2 nov, 15 nov, 25 dez
 *   Lei 6.802/1980 ................. 12 out (Nossa Senhora Aparecida)
 *   Lei 14.759/2023 ................ 20 nov (Consciência Negra), nacional a partir de 2024
 *   Lei 9.093/1995 ................. Sexta-feira Santa (feriado religioso nacional), móvel
 *
 * O QUE NÃO ENTRA, e o motivo: Carnaval (segunda e terça), Quarta-feira de Cinzas e Corpus Christi
 * são PONTO FACULTATIVO federal, não feriado nacional. Estão listados em `PONTOS_FACULTATIVOS` e
 * ficam DESLIGADOS por padrão, porque incluí-los seria decidir por conta própria que a operação para
 * nesses dias. Ligar é trocar o `false` de `incluirPontoFacultativo`, e é decisão do diretor.
 *
 * Feriado ESTADUAL e MUNICIPAL não entram de propósito: o projeto de alto volume acontece em cidades
 * diferentes, e aplicar o feriado de uma cidade ao projeto inteiro erraria em todas as outras.
 *
 * As funções são PURAS e trabalham em data ISO (`YYYY-MM-DD`) no fuso UTC, como o resto do serviço:
 * "faltam 3 dias" não pode depender do fuso de quem abriu a tela.
 */

/** Um dia em milissegundos, para caminhar no calendário sem cair em horário de verão. */
const DIA = 24 * 60 * 60 * 1000;

/** Feriados nacionais de data fixa: `MM-DD`. */
const FIXOS = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "12-25", // Natal
] as const;

/** Consciência Negra virou feriado NACIONAL pela Lei 14.759/2023, valendo a partir de 2024. */
const CONSCIENCIA_NEGRA = { mmdd: "11-20", aPartirDe: 2024 };

/**
 * PÁSCOA pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano), que é aritmética fechada e
 * não depende de tabela. Dela sai a Sexta-feira Santa, e dela sairiam Carnaval e Corpus Christi.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA);

/** Pontos facultativos federais, DESLIGADOS por padrão (ver o cabeçalho). */
export function pontosFacultativos(ano: number): string[] {
  const pascoa = domingoDePascoa(ano);
  return [
    iso(somaDias(pascoa, -48)), // Carnaval, segunda
    iso(somaDias(pascoa, -47)), // Carnaval, terça
    iso(somaDias(pascoa, -46)), // Quarta-feira de Cinzas
    iso(somaDias(pascoa, 60)), // Corpus Christi
  ];
}
export const PONTOS_FACULTATIVOS = pontosFacultativos;

/** Feriados NACIONAIS de um ano, em ISO, prontos para comparação direta. */
export function feriadosNacionais(ano: number): Set<string> {
  const s = new Set<string>(FIXOS.map((mmdd) => `${ano}-${mmdd}`));
  if (ano >= CONSCIENCIA_NEGRA.aPartirDe) s.add(`${ano}-${CONSCIENCIA_NEGRA.mmdd}`);
  // Sexta-feira Santa: dois dias antes do domingo de Páscoa.
  s.add(iso(somaDias(domingoDePascoa(ano), -2)));
  return s;
}

/** É dia útil? Sábado, domingo e feriado nacional não são. */
export function ehDiaUtil(data: Date, incluirPontoFacultativo = false): boolean {
  const diaDaSemana = data.getUTCDay();
  if (diaDaSemana === 0 || diaDaSemana === 6) return false;
  const ano = data.getUTCFullYear();
  const dataIso = iso(data);
  if (feriadosNacionais(ano).has(dataIso)) return false;
  if (incluirPontoFacultativo && pontosFacultativos(ano).includes(dataIso)) return false;
  return true;
}

/**
 * Quantos dias úteis existem entre duas datas, INCLUINDO as duas pontas quando são úteis.
 *
 * Inclusivo nas duas pontas porque é assim que o negócio conta prazo: um projeto de 01/09 a 13/09
 * tem o dia 01 e o dia 13 dentro dele. Devolve 0 quando o fim é anterior ao início, em vez de número
 * negativo, que não existe em contagem de prazo.
 */
export function diasUteisEntre(inicioIso: string, fimIso: string, incluirPontoFacultativo = false): number {
  let cursor = Date.parse(`${inicioIso.slice(0, 10)}T00:00:00Z`);
  const fim = Date.parse(`${fimIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(fim) || fim < cursor) return 0;

  let total = 0;
  while (cursor <= fim) {
    if (ehDiaUtil(new Date(cursor), incluirPontoFacultativo)) total += 1;
    cursor += DIA;
  }
  return total;
}
