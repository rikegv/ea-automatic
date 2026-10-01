/**
 * OS CAMPOS QUE NÃO SAEM DE DOCUMENTO, e os dicionários de domínio do G.I.
 *
 * A trilha do Portal (peça 1) tem dois momentos de validação: a conferência POR DOCUMENTO (o
 * candidato confere o que a IA leu daquele documento) e o PASSO FINAL, curto, com o que ficou vazio
 * mais os campos que NÃO estão em documento nenhum: raça, grau de instrução, estado civil,
 * nacionalidade e naturalidade.
 *
 * ┌─ DE ONDE VÊM ESTAS TABELAS ─────────────────────────────────────────────────────────────────┐
 * │ Transcritas de `docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md`, entregues pelo diretor em          │
 * │ 16/09/2026. A API do G.I NÃO expõe os catálogos de domínio, então o significado dos códigos   │
 * │ só vem de fora, e veio dele. O VALOR que grava é o CÓDIGO (ex.: "1" = Branca); o candidato    │
 * │ escolhe pelo rótulo. Cuidado registrado no doc: os códigos de estadoCivil NÃO são a inicial   │
 * │ da palavra (D = Divorciado, Q = Desquitado, V = Viuvo, U = Uniao Estavel).                    │
 * │                                                                                              │
 * │ DUAS tabelas vêm de OUTRA fonte, e é melhor: `UF_NASCIMENTO` (naturalidade) e                 │
 * │ `NACIONALIDADE` saem da `description` dos próprios campos no CONTRATO do G.I, compiladas em   │
 * │ `docs/GI-CATALOGOS-DA-DESCRIPTION.md`. Ali o catálogo é o do próprio sistema, não transcrição. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa vive aqui, só o domínio público (dicionário de código). §A.24: os
 * rótulos são etiquetas de opção, então Title Case. §A.11: nenhum travessão.
 *
 * NOTA DE COORDENAÇÃO (dono do shared-types é o coordenador, §A.39): estes dicionários e as chaves
 * de campo estão aqui, no frontend, para a peça 1 andar em homologação. Quando o backend do G.I
 * (peça 3) materializar o de/para, o ideal é que a fonte única suba para `@ea/shared-types` ou um
 * catálogo, e este arquivo passe a reexportá-la, como já se fez com as dicas de documento.
 */

export interface OpcaoGi {
  /** O código que grava no G.I (ex.: "1", "C"). */
  value: string;
  /** O rótulo que o candidato lê. Title Case (§A.24). */
  label: string;
}

/** `grauInstrucao`: 13 valores (GI-DADOS §A). */
export const GRAU_INSTRUCAO: readonly OpcaoGi[] = [
  { value: "1", label: "Analfabeto" },
  { value: "2", label: "Até 5o Ano Incompleto" },
  { value: "3", label: "5o Ano Completo" },
  { value: "4", label: "6o Ao 9o Ano Incompleto" },
  { value: "5", label: "Fundamental Completo" },
  { value: "6", label: "Ensino Médio Incompleto" },
  { value: "7", label: "Ensino Médio Completo" },
  { value: "8", label: "Superior Incompleto" },
  { value: "9", label: "Superior Completo" },
  { value: "A", label: "Pós-Graduação Completa" },
  { value: "B", label: "Mestrado Completo" },
  { value: "C", label: "Doutorado Completo" },
  { value: "D", label: "Pós-Doutorado Completo" },
];

/** `raca`: 6 valores (GI-DADOS §A). */
export const RACA: readonly OpcaoGi[] = [
  { value: "1", label: "Branca" },
  { value: "2", label: "Preta" },
  { value: "3", label: "Amarela" },
  { value: "4", label: "Parda" },
  { value: "5", label: "Indígena" },
  { value: "6", label: "Não Informado" },
];

/** `estadoCivil`: 7 valores (GI-DADOS §A). Código NÃO é a inicial da palavra. */
export const ESTADO_CIVIL: readonly OpcaoGi[] = [
  { value: "S", label: "Solteiro(a)" },
  { value: "C", label: "Casado(a)" },
  { value: "D", label: "Divorciado(a)" },
  { value: "Q", label: "Desquitado(a)" },
  { value: "V", label: "Viúvo(a)" },
  { value: "U", label: "União Estável" },
  { value: "O", label: "Outros" },
];

/**
 * `naturalidade`: as 27 siglas de UF (`description` do campo no contrato do G.I, máx 2 caracteres).
 * O G.I NÃO quer a cidade: quer a sigla do estado de nascimento, e por isso o rótulo na tela é
 * "UF De Nascimento". O código e o rótulo são a própria sigla.
 */
export const UF_NASCIMENTO: readonly OpcaoGi[] = [
  { value: "AC", label: "AC" },
  { value: "AL", label: "AL" },
  { value: "AM", label: "AM" },
  { value: "AP", label: "AP" },
  { value: "BA", label: "BA" },
  { value: "CE", label: "CE" },
  { value: "DF", label: "DF" },
  { value: "ES", label: "ES" },
  { value: "GO", label: "GO" },
  { value: "MA", label: "MA" },
  { value: "MG", label: "MG" },
  { value: "MS", label: "MS" },
  { value: "MT", label: "MT" },
  { value: "PA", label: "PA" },
  { value: "PB", label: "PB" },
  { value: "PE", label: "PE" },
  { value: "PI", label: "PI" },
  { value: "PR", label: "PR" },
  { value: "RJ", label: "RJ" },
  { value: "RN", label: "RN" },
  { value: "RO", label: "RO" },
  { value: "RR", label: "RR" },
  { value: "RS", label: "RS" },
  { value: "SC", label: "SC" },
  { value: "SE", label: "SE" },
  { value: "SP", label: "SP" },
  { value: "TO", label: "TO" },
];

/**
 * `nacionalidade`: os 254 valores da `description` do campo no contrato do G.I (máx 3 caracteres,
 * default `010`). Transcritos de `docs/GI-CATALOGOS-DA-DESCRIPTION.md`, seção
 * `TB_FuncionarioSelecaoAPI` / `nacionalidade`, na ORDEM da própria `description`, que começa por
 * Brasileiro (`010`): é o caso de quase todo candidato, então é a primeira opção da lista, e não a
 * primeira em ordem alfabética. O rótulo é só o nome documentado (o código fica no `value`).
 */
export const NACIONALIDADE: readonly OpcaoGi[] = [
  { value: "010", label: "Brasileiro" },
  { value: "013", label: "Afeganistao" },
  { value: "017", label: "Albania, Republica Da" },
  { value: "020", label: "Naturalizado" },
  { value: "021", label: "Argentino" },
  { value: "022", label: "Boliviano" },
  { value: "023", label: "Chileno" },
  { value: "024", label: "Paraguaio" },
  { value: "025", label: "Uruguaio" },
  { value: "026", label: "Venezuelano" },
  { value: "027", label: "Colombiano" },
  { value: "028", label: "Peruano" },
  { value: "029", label: "Equatoriano" },
  { value: "030", label: "Alemão" },
  { value: "031", label: "Belga" },
  { value: "032", label: "Britanico" },
  { value: "034", label: "Canadense" },
  { value: "035", label: "Espanhol" },
  { value: "036", label: "EUA" },
  { value: "037", label: "Francês" },
  { value: "038", label: "Suíço" },
  { value: "039", label: "Italiano" },
  { value: "040", label: "Haitiano" },
  { value: "041", label: "Japonês" },
  { value: "042", label: "Chinês" },
  { value: "043", label: "Coreano" },
  { value: "044", label: "Russo" },
  { value: "045", label: "Português" },
  { value: "046", label: "Paquistanês" },
  { value: "047", label: "Indiano" },
  { value: "048", label: "Outros Latinos" },
  { value: "049", label: "Outros Asiáticos" },
  { value: "050", label: "Outros" },
  { value: "051", label: "Outros Europeus" },
  { value: "053", label: "Arabia Saudita" },
  { value: "059", label: "Argelia" },
  { value: "060", label: "Angolano" },
  { value: "061", label: "Congolês" },
  { value: "062", label: "Sul - Africano" },
  { value: "064", label: "Armenia, Republica Da" },
  { value: "065", label: "Aruba" },
  { value: "069", label: "Australia" },
  { value: "070", label: "Outros Africanos" },
  { value: "072", label: "Austria" },
  { value: "073", label: "Azerbaijao, Republica Do" },
  { value: "076", label: "Burkina Faso" },
  { value: "077", label: "Bahamas, Ilhas" },
  { value: "078", label: "Belarus, Republica Da" },
  { value: "079", label: "Belize" },
  { value: "080", label: "República Tcheca" },
  { value: "081", label: "Palestina" },
  { value: "082", label: "Guiné - Bissau" },
  { value: "083", label: "Cubano" },
  { value: "084", label: "Marrocos" },
  { value: "085", label: "Gana" },
  { value: "086", label: "México" },
  { value: "087", label: "Senegal" },
  { value: "088", label: "Filipinas" },
  { value: "089", label: "Zambia" },
  { value: "090", label: "Bermudas" },
  { value: "091", label: "Andorra" },
  { value: "092", label: "Anguilla" },
  { value: "093", label: "Mianmar(BIRMANIA)" },
  { value: "094", label: "Antigua E Barbuda" },
  { value: "095", label: "Antilhas Holandesas" },
  { value: "096", label: "Bahrein, Ilhas" },
  { value: "097", label: "Bangladesh" },
  { value: "098", label: "Bosnia-Herzegovina(REPUBLICA Da)" },
  { value: "099", label: "Barbados" },
  { value: "101", label: "Botsuana" },
  { value: "108", label: "Brunei" },
  { value: "111", label: "Bulgaria, Republica Da" },
  { value: "115", label: "Burundi" },
  { value: "119", label: "Butao" },
  { value: "127", label: "Cabo Verde, Republica De" },
  { value: "137", label: "Cayan, Ilhas" },
  { value: "141", label: "Camboja" },
  { value: "145", label: "Camaroes" },
  { value: "150", label: "Jersey, Ilha Do Canal" },
  { value: "151", label: "Canarias, Ilhas" },
  { value: "153", label: "Cazaquistao, Republica Do" },
  { value: "154", label: "Catar" },
  { value: "161", label: "Formosa(TAIWAN)" },
  { value: "163", label: "Chipre" },
  { value: "165", label: "Cocos(Keeling),Ilhas" },
  { value: "173", label: "Comores, Ilhas" },
  { value: "183", label: "Cook, Ilhas" },
  { value: "187", label: "Coreia(DO Norte), Rep.Pop.Democratica" },
  { value: "193", label: "Costa Do Marfim" },
  { value: "195", label: "Croacia(REPUBLICA Da)" },
  { value: "196", label: "Costa Rica" },
  { value: "198", label: "Coveite" },
  { value: "229", label: "Benin" },
  { value: "232", label: "Dinamarca" },
  { value: "235", label: "Dominica,Ilha" },
  { value: "240", label: "Egito" },
  { value: "243", label: "Eritreia" },
  { value: "244", label: "Emirados Arabes Unidos" },
  { value: "246", label: "Eslovenia, Republica Da" },
  { value: "247", label: "Eslovaca, Republica" },
  { value: "251", label: "Estonia, Republica Da" },
  { value: "253", label: "Etiopia" },
  { value: "255", label: "Falkland(ILHAS Malvinas)" },
  { value: "259", label: "Feroe, Ilhas" },
  { value: "271", label: "Finlandia" },
  { value: "281", label: "Gabao" },
  { value: "285", label: "Gambia" },
  { value: "291", label: "Georgia, Republica Da" },
  { value: "293", label: "Gibraltar" },
  { value: "297", label: "Granada" },
  { value: "301", label: "Grecia" },
  { value: "305", label: "Groenlandia" },
  { value: "309", label: "Guadalupe" },
  { value: "313", label: "Guam" },
  { value: "317", label: "Guatemala" },
  { value: "325", label: "Guiana Francesa" },
  { value: "329", label: "Guine" },
  { value: "331", label: "Guine-Equatorial" },
  { value: "337", label: "Guiana" },
  { value: "345", label: "Honduras" },
  { value: "351", label: "Hong Kong" },
  { value: "355", label: "Hungria, Republica Da" },
  { value: "357", label: "Iemen" },
  { value: "359", label: "Man, Ilha De" },
  { value: "365", label: "Indonesia" },
  { value: "369", label: "Iraque" },
  { value: "372", label: "Ira, Republica Islamica Do" },
  { value: "375", label: "Irlanda" },
  { value: "379", label: "Islandia" },
  { value: "383", label: "Israel" },
  { value: "388", label: "Servia E Montenegro" },
  { value: "391", label: "Jamaica" },
  { value: "396", label: "Johston, Ilhas" },
  { value: "403", label: "Jordania" },
  { value: "411", label: "Kiribati" },
  { value: "420", label: "Laos, Rep.Pop.Democr.Do" },
  { value: "423", label: "Lebuan,Ilhas" },
  { value: "426", label: "Lesoto" },
  { value: "427", label: "Letonia, Republica Da" },
  { value: "431", label: "Libano" },
  { value: "434", label: "Liberia" },
  { value: "438", label: "Libia" },
  { value: "440", label: "Liechtenstein" },
  { value: "442", label: "Lituania, Republica Da" },
  { value: "445", label: "Luxemburgo" },
  { value: "447", label: "Macau" },
  { value: "449", label: "Macedonia, Ant.Rep.Iugoslava" },
  { value: "450", label: "Madagascar" },
  { value: "452", label: "Ilha Da Madeira" },
  { value: "455", label: "Malasia" },
  { value: "458", label: "Malavi" },
  { value: "461", label: "Maldivas" },
  { value: "464", label: "Mali" },
  { value: "467", label: "Malta" },
  { value: "472", label: "Marianas Do Norte" },
  { value: "476", label: "Marshall,Ilhas" },
  { value: "477", label: "Martinica" },
  { value: "485", label: "Mauricio" },
  { value: "488", label: "Mauritania" },
  { value: "490", label: "Midway, Ilhas" },
  { value: "494", label: "Moldavia, Republica Da" },
  { value: "495", label: "Monaco" },
  { value: "497", label: "Mongolia" },
  { value: "499", label: "Micronesia" },
  { value: "501", label: "Montserrat,Ilhas" },
  { value: "505", label: "Mocambique" },
  { value: "507", label: "Namibia" },
  { value: "508", label: "Nauru" },
  { value: "511", label: "Christmas,Ilha(NAVIDAD)" },
  { value: "517", label: "Nepal" },
  { value: "521", label: "Nicaragua" },
  { value: "525", label: "Niger" },
  { value: "528", label: "Nigeria" },
  { value: "531", label: "Niue,Ilha" },
  { value: "535", label: "Norfolk,Ilha" },
  { value: "538", label: "Noruega" },
  { value: "542", label: "Nova Caledonia" },
  { value: "545", label: "Papua Nova Guine" },
  { value: "548", label: "Nova Zelandia" },
  { value: "551", label: "Vanuatu" },
  { value: "556", label: "Oma" },
  { value: "566", label: "Pacifico,Ilhas Do(POSSESSAO Dos Eua)" },
  { value: "573", label: "Paises Baixos(HOLANDA)" },
  { value: "575", label: "Palau" },
  { value: "580", label: "Panama" },
  { value: "593", label: "Pitcairn,Ilha" },
  { value: "599", label: "Polinesia Francesa" },
  { value: "603", label: "Polonia, Republica Da" },
  { value: "611", label: "Porto Rico" },
  { value: "623", label: "Quenia" },
  { value: "625", label: "Quirguiz, Republica" },
  { value: "628", label: "Reino Unido" },
  { value: "640", label: "Republica Centro-Africana" },
  { value: "647", label: "Republica Dominicana" },
  { value: "660", label: "Reuniao, Ilha" },
  { value: "665", label: "Zimbabue" },
  { value: "670", label: "Romenia" },
  { value: "675", label: "Ruanda" },
  { value: "677", label: "Salomao, Ilhas" },
  { value: "678", label: "Saint Kitts E Nevis" },
  { value: "685", label: "Saara Ocidental" },
  { value: "687", label: "El Salvador" },
  { value: "690", label: "Samoa" },
  { value: "691", label: "Samoa Americana" },
  { value: "695", label: "Sao Cristovao E Neves, Ilhas" },
  { value: "697", label: "San Marino" },
  { value: "700", label: "Sao Pedro E Miquelon" },
  { value: "705", label: "Sao Vicente E Granadinas" },
  { value: "710", label: "Santa Helena" },
  { value: "715", label: "Santa Lucia" },
  { value: "720", label: "Sao Tome E Principe, Ilhas" },
  { value: "731", label: "Seychelles" },
  { value: "735", label: "Serra Leoa" },
  { value: "738", label: "Sikkim" },
  { value: "741", label: "Cingapura" },
  { value: "744", label: "Siria, Republica Arabe Da" },
  { value: "748", label: "Somalia" },
  { value: "750", label: "Sri Lanka" },
  { value: "754", label: "Suazilandia" },
  { value: "756", label: "Africa Do Sul" },
  { value: "759", label: "Sudao" },
  { value: "764", label: "Suecia" },
  { value: "770", label: "Suriname" },
  { value: "772", label: "Tadjiquistao, Republica Do" },
  { value: "776", label: "Tailandia" },
  { value: "780", label: "Tanzania, Rep.Unida Da" },
  { value: "782", label: "Territorio Brit.Oc.Indico" },
  { value: "783", label: "Djibuti" },
  { value: "785", label: "Territorio da Alta Comissao do Pacifico Ocidental" },
  { value: "788", label: "Chade" },
  { value: "790", label: "Tchecoslovaquia" },
  { value: "795", label: "Timor Leste" },
  { value: "800", label: "Togo" },
  { value: "805", label: "Toquelau, Ilhas" },
  { value: "810", label: "Tonga" },
  { value: "815", label: "Trinidad E Tobago" },
  { value: "820", label: "Tunisia" },
  { value: "823", label: "Turcas E Caicos, Ilhas" },
  { value: "824", label: "Turcomenistao, Republica Do" },
  { value: "827", label: "Turquia" },
  { value: "828", label: "Tuvalu" },
  { value: "831", label: "Ucrania" },
  { value: "833", label: "Uganda" },
  { value: "840", label: "Uniao Das Republicas Socialistas Sovieticas" },
  { value: "847", label: "Uzbequistao, Republica Do" },
  { value: "848", label: "Vaticano, Est.Da Cidade Do" },
  { value: "855", label: "Vietname Norte" },
  { value: "858", label: "Vietna" },
  { value: "863", label: "Virgens, Ilhas (BRITANICAS)" },
  { value: "866", label: "Virgens, Ilhas (E.U.A.)" },
  { value: "870", label: "Fiji" },
  { value: "873", label: "Wake, Ilha" },
  { value: "875", label: "Wallis E Futuna, Ilhas" },
  { value: "888", label: "Congo, Republica Democratica Do" },
];

/**
 * O tipo de um campo do passo final: SELECT (dicionário) ou TEXTO livre.
 *
 * A DÚVIDA DA `naturalidade` ESTÁ RESOLVIDA, e não volta: a leitura completa da documentação do
 * G.I mostrou que o campo é a SIGLA DA UF de nascimento (máx 2 caracteres, as 27 siglas na
 * `description` do contrato), NÃO o código de município nem a cidade em texto livre. `nacionalidade`
 * também é lista fechada (254 códigos, máx 3). Então os cinco campos do passo final são SELECT, e
 * nenhum deles é mais texto livre. A chave (`campo`) casa com o que a IA usa na extração e com o
 * que o backend espera em `POST /portal/dados-gi`.
 */
export type CampoFinal =
  | { campo: string; rotulo: string; tipo: "select"; opcoes: readonly OpcaoGi[] }
  | { campo: string; rotulo: string; tipo: "texto"; ajuda?: string };

/**
 * OS CAMPOS QUE NÃO SAEM DE DOCUMENTO, na ordem do passo final. São sempre pedidos ao candidato,
 * porque o G.I precisa deles e nenhum documento comum os traz.
 */
export const CAMPOS_SEM_DOCUMENTO: readonly CampoFinal[] = [
  { campo: "raca", rotulo: "Cor Ou Raça", tipo: "select", opcoes: RACA },
  { campo: "grauInstrucao", rotulo: "Grau De Instrução", tipo: "select", opcoes: GRAU_INSTRUCAO },
  { campo: "estadoCivil", rotulo: "Estado Civil", tipo: "select", opcoes: ESTADO_CIVIL },
  { campo: "nacionalidade", rotulo: "Nacionalidade", tipo: "select", opcoes: NACIONALIDADE },
  { campo: "naturalidade", rotulo: "UF De Nascimento", tipo: "select", opcoes: UF_NASCIMENTO },
];

/** O rótulo de uma opção pelo código, para exibir o já confirmado sem re-perguntar. */
export function rotuloDaOpcao(opcoes: readonly OpcaoGi[], value: string): string {
  return opcoes.find((o) => o.value === value)?.label ?? value;
}

/**
 * UM campo confirmado, pronto para gravar. É o corpo de `POST /portal/dados-gi`: a lista dos campos
 * que o candidato confirmou, cada um com a sua chave e o valor DELE (nunca o chute da IA). A
 * admissão vem da SESSÃO do portal, não do corpo (§A.6: o corpo não carrega quem é a pessoa).
 */
export interface CampoConfirmadoGi {
  campo: string;
  valor: string;
}

/** O corpo de `POST /portal/dados-gi`. */
export interface CorpoDadosGi {
  campos: CampoConfirmadoGi[];
}

/** Um campo do G.I que o candidato já viu na trilha: o rótulo e o valor que ELE confirmou. */
export interface CampoVisto {
  rotulo: string;
  valor: string;
}

/**
 * O QUE JÁ FOI CONFIRMADO COM VALOR, para deduplicar. Só entra o campo com valor não vazio: um
 * campo visto e deixado vazio NÃO conta como confirmado, então um documento seguinte que o leia
 * ainda oferece a segunda chance (o nome que não saiu no RG pode sair na CTPS).
 */
export function valoresConfirmadosDe(vistos: Record<string, CampoVisto>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [campo, v] of Object.entries(vistos)) if (v.valor !== "") m[campo] = v.valor;
  return m;
}

/** O que ficou vazio no caminho: visto num documento e nunca preenchido. Volta no passo final. */
export function camposVaziosDe(vistos: Record<string, CampoVisto>): { campo: string; rotulo: string }[] {
  return Object.entries(vistos)
    .filter(([, v]) => v.valor === "")
    .map(([campo, v]) => ({ campo, rotulo: v.rotulo }));
}

/**
 * DEDUPLICAÇÃO: separa os campos deste documento em NOVOS (a conferir) e REPETIDOS (já confirmados
 * antes, só exibidos, nunca re-perguntados). O critério é a presença no mapa dos já confirmados.
 */
export function separarCampos<T extends { campo: string }>(
  campos: T[],
  jaConfirmados: Record<string, string>,
): { novos: T[]; repetidos: T[] } {
  const novos: T[] = [];
  const repetidos: T[] = [];
  for (const c of campos) {
    if (c.campo in jaConfirmados) repetidos.push(c);
    else novos.push(c);
  }
  return { novos, repetidos };
}
