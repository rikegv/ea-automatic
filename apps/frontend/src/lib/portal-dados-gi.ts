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
 * primeira em ordem alfabética.
 *
 * O RÓTULO CARREGA O CÓDIGO, no formato da própria `description` do contrato (`010 - Brasileiro`),
 * e isso não é enfeite: a busca do seletor filtra pelo `label`, então, com o rótulo só do nome,
 * digitar `010` não achava nada numa lista de 254 opções. Com o código no rótulo, o candidato acha
 * pelo nome OU pelo número, e o operador que confere vê o mesmo código que o G.I grava. Hífen
 * simples, nunca travessão (§A.11), que é também o que o G.I usa.
 */
export const NACIONALIDADE: readonly OpcaoGi[] = [
  { value: "010", label: "010 - Brasileiro" },
  { value: "013", label: "013 - Afeganistao" },
  { value: "017", label: "017 - Albania, Republica Da" },
  { value: "020", label: "020 - Naturalizado" },
  { value: "021", label: "021 - Argentino" },
  { value: "022", label: "022 - Boliviano" },
  { value: "023", label: "023 - Chileno" },
  { value: "024", label: "024 - Paraguaio" },
  { value: "025", label: "025 - Uruguaio" },
  { value: "026", label: "026 - Venezuelano" },
  { value: "027", label: "027 - Colombiano" },
  { value: "028", label: "028 - Peruano" },
  { value: "029", label: "029 - Equatoriano" },
  { value: "030", label: "030 - Alemão" },
  { value: "031", label: "031 - Belga" },
  { value: "032", label: "032 - Britanico" },
  { value: "034", label: "034 - Canadense" },
  { value: "035", label: "035 - Espanhol" },
  { value: "036", label: "036 - EUA" },
  { value: "037", label: "037 - Francês" },
  { value: "038", label: "038 - Suíço" },
  { value: "039", label: "039 - Italiano" },
  { value: "040", label: "040 - Haitiano" },
  { value: "041", label: "041 - Japonês" },
  { value: "042", label: "042 - Chinês" },
  { value: "043", label: "043 - Coreano" },
  { value: "044", label: "044 - Russo" },
  { value: "045", label: "045 - Português" },
  { value: "046", label: "046 - Paquistanês" },
  { value: "047", label: "047 - Indiano" },
  { value: "048", label: "048 - Outros Latinos" },
  { value: "049", label: "049 - Outros Asiáticos" },
  { value: "050", label: "050 - Outros" },
  { value: "051", label: "051 - Outros Europeus" },
  { value: "053", label: "053 - Arabia Saudita" },
  { value: "059", label: "059 - Argelia" },
  { value: "060", label: "060 - Angolano" },
  { value: "061", label: "061 - Congolês" },
  { value: "062", label: "062 - Sul - Africano" },
  { value: "064", label: "064 - Armenia, Republica Da" },
  { value: "065", label: "065 - Aruba" },
  { value: "069", label: "069 - Australia" },
  { value: "070", label: "070 - Outros Africanos" },
  { value: "072", label: "072 - Austria" },
  { value: "073", label: "073 - Azerbaijao, Republica Do" },
  { value: "076", label: "076 - Burkina Faso" },
  { value: "077", label: "077 - Bahamas, Ilhas" },
  { value: "078", label: "078 - Belarus, Republica Da" },
  { value: "079", label: "079 - Belize" },
  { value: "080", label: "080 - República Tcheca" },
  { value: "081", label: "081 - Palestina" },
  { value: "082", label: "082 - Guiné - Bissau" },
  { value: "083", label: "083 - Cubano" },
  { value: "084", label: "084 - Marrocos" },
  { value: "085", label: "085 - Gana" },
  { value: "086", label: "086 - México" },
  { value: "087", label: "087 - Senegal" },
  { value: "088", label: "088 - Filipinas" },
  { value: "089", label: "089 - Zambia" },
  { value: "090", label: "090 - Bermudas" },
  { value: "091", label: "091 - Andorra" },
  { value: "092", label: "092 - Anguilla" },
  { value: "093", label: "093 - Mianmar(BIRMANIA)" },
  { value: "094", label: "094 - Antigua E Barbuda" },
  { value: "095", label: "095 - Antilhas Holandesas" },
  { value: "096", label: "096 - Bahrein, Ilhas" },
  { value: "097", label: "097 - Bangladesh" },
  { value: "098", label: "098 - Bosnia-Herzegovina(REPUBLICA Da)" },
  { value: "099", label: "099 - Barbados" },
  { value: "101", label: "101 - Botsuana" },
  { value: "108", label: "108 - Brunei" },
  { value: "111", label: "111 - Bulgaria, Republica Da" },
  { value: "115", label: "115 - Burundi" },
  { value: "119", label: "119 - Butao" },
  { value: "127", label: "127 - Cabo Verde, Republica De" },
  { value: "137", label: "137 - Cayan, Ilhas" },
  { value: "141", label: "141 - Camboja" },
  { value: "145", label: "145 - Camaroes" },
  { value: "150", label: "150 - Jersey, Ilha Do Canal" },
  { value: "151", label: "151 - Canarias, Ilhas" },
  { value: "153", label: "153 - Cazaquistao, Republica Do" },
  { value: "154", label: "154 - Catar" },
  { value: "161", label: "161 - Formosa(TAIWAN)" },
  { value: "163", label: "163 - Chipre" },
  { value: "165", label: "165 - Cocos(Keeling),Ilhas" },
  { value: "173", label: "173 - Comores, Ilhas" },
  { value: "183", label: "183 - Cook, Ilhas" },
  { value: "187", label: "187 - Coreia(DO Norte), Rep.Pop.Democratica" },
  { value: "193", label: "193 - Costa Do Marfim" },
  { value: "195", label: "195 - Croacia(REPUBLICA Da)" },
  { value: "196", label: "196 - Costa Rica" },
  { value: "198", label: "198 - Coveite" },
  { value: "229", label: "229 - Benin" },
  { value: "232", label: "232 - Dinamarca" },
  { value: "235", label: "235 - Dominica,Ilha" },
  { value: "240", label: "240 - Egito" },
  { value: "243", label: "243 - Eritreia" },
  { value: "244", label: "244 - Emirados Arabes Unidos" },
  { value: "246", label: "246 - Eslovenia, Republica Da" },
  { value: "247", label: "247 - Eslovaca, Republica" },
  { value: "251", label: "251 - Estonia, Republica Da" },
  { value: "253", label: "253 - Etiopia" },
  { value: "255", label: "255 - Falkland(ILHAS Malvinas)" },
  { value: "259", label: "259 - Feroe, Ilhas" },
  { value: "271", label: "271 - Finlandia" },
  { value: "281", label: "281 - Gabao" },
  { value: "285", label: "285 - Gambia" },
  { value: "291", label: "291 - Georgia, Republica Da" },
  { value: "293", label: "293 - Gibraltar" },
  { value: "297", label: "297 - Granada" },
  { value: "301", label: "301 - Grecia" },
  { value: "305", label: "305 - Groenlandia" },
  { value: "309", label: "309 - Guadalupe" },
  { value: "313", label: "313 - Guam" },
  { value: "317", label: "317 - Guatemala" },
  { value: "325", label: "325 - Guiana Francesa" },
  { value: "329", label: "329 - Guine" },
  { value: "331", label: "331 - Guine-Equatorial" },
  { value: "337", label: "337 - Guiana" },
  { value: "345", label: "345 - Honduras" },
  { value: "351", label: "351 - Hong Kong" },
  { value: "355", label: "355 - Hungria, Republica Da" },
  { value: "357", label: "357 - Iemen" },
  { value: "359", label: "359 - Man, Ilha De" },
  { value: "365", label: "365 - Indonesia" },
  { value: "369", label: "369 - Iraque" },
  { value: "372", label: "372 - Ira, Republica Islamica Do" },
  { value: "375", label: "375 - Irlanda" },
  { value: "379", label: "379 - Islandia" },
  { value: "383", label: "383 - Israel" },
  { value: "388", label: "388 - Servia E Montenegro" },
  { value: "391", label: "391 - Jamaica" },
  { value: "396", label: "396 - Johston, Ilhas" },
  { value: "403", label: "403 - Jordania" },
  { value: "411", label: "411 - Kiribati" },
  { value: "420", label: "420 - Laos, Rep.Pop.Democr.Do" },
  { value: "423", label: "423 - Lebuan,Ilhas" },
  { value: "426", label: "426 - Lesoto" },
  { value: "427", label: "427 - Letonia, Republica Da" },
  { value: "431", label: "431 - Libano" },
  { value: "434", label: "434 - Liberia" },
  { value: "438", label: "438 - Libia" },
  { value: "440", label: "440 - Liechtenstein" },
  { value: "442", label: "442 - Lituania, Republica Da" },
  { value: "445", label: "445 - Luxemburgo" },
  { value: "447", label: "447 - Macau" },
  { value: "449", label: "449 - Macedonia, Ant.Rep.Iugoslava" },
  { value: "450", label: "450 - Madagascar" },
  { value: "452", label: "452 - Ilha Da Madeira" },
  { value: "455", label: "455 - Malasia" },
  { value: "458", label: "458 - Malavi" },
  { value: "461", label: "461 - Maldivas" },
  { value: "464", label: "464 - Mali" },
  { value: "467", label: "467 - Malta" },
  { value: "472", label: "472 - Marianas Do Norte" },
  { value: "476", label: "476 - Marshall,Ilhas" },
  { value: "477", label: "477 - Martinica" },
  { value: "485", label: "485 - Mauricio" },
  { value: "488", label: "488 - Mauritania" },
  { value: "490", label: "490 - Midway, Ilhas" },
  { value: "494", label: "494 - Moldavia, Republica Da" },
  { value: "495", label: "495 - Monaco" },
  { value: "497", label: "497 - Mongolia" },
  { value: "499", label: "499 - Micronesia" },
  { value: "501", label: "501 - Montserrat,Ilhas" },
  { value: "505", label: "505 - Mocambique" },
  { value: "507", label: "507 - Namibia" },
  { value: "508", label: "508 - Nauru" },
  { value: "511", label: "511 - Christmas,Ilha(NAVIDAD)" },
  { value: "517", label: "517 - Nepal" },
  { value: "521", label: "521 - Nicaragua" },
  { value: "525", label: "525 - Niger" },
  { value: "528", label: "528 - Nigeria" },
  { value: "531", label: "531 - Niue,Ilha" },
  { value: "535", label: "535 - Norfolk,Ilha" },
  { value: "538", label: "538 - Noruega" },
  { value: "542", label: "542 - Nova Caledonia" },
  { value: "545", label: "545 - Papua Nova Guine" },
  { value: "548", label: "548 - Nova Zelandia" },
  { value: "551", label: "551 - Vanuatu" },
  { value: "556", label: "556 - Oma" },
  { value: "566", label: "566 - Pacifico,Ilhas Do(POSSESSAO Dos Eua)" },
  { value: "573", label: "573 - Paises Baixos(HOLANDA)" },
  { value: "575", label: "575 - Palau" },
  { value: "580", label: "580 - Panama" },
  { value: "593", label: "593 - Pitcairn,Ilha" },
  { value: "599", label: "599 - Polinesia Francesa" },
  { value: "603", label: "603 - Polonia, Republica Da" },
  { value: "611", label: "611 - Porto Rico" },
  { value: "623", label: "623 - Quenia" },
  { value: "625", label: "625 - Quirguiz, Republica" },
  { value: "628", label: "628 - Reino Unido" },
  { value: "640", label: "640 - Republica Centro-Africana" },
  { value: "647", label: "647 - Republica Dominicana" },
  { value: "660", label: "660 - Reuniao, Ilha" },
  { value: "665", label: "665 - Zimbabue" },
  { value: "670", label: "670 - Romenia" },
  { value: "675", label: "675 - Ruanda" },
  { value: "677", label: "677 - Salomao, Ilhas" },
  { value: "678", label: "678 - Saint Kitts E Nevis" },
  { value: "685", label: "685 - Saara Ocidental" },
  { value: "687", label: "687 - El Salvador" },
  { value: "690", label: "690 - Samoa" },
  { value: "691", label: "691 - Samoa Americana" },
  { value: "695", label: "695 - Sao Cristovao E Neves, Ilhas" },
  { value: "697", label: "697 - San Marino" },
  { value: "700", label: "700 - Sao Pedro E Miquelon" },
  { value: "705", label: "705 - Sao Vicente E Granadinas" },
  { value: "710", label: "710 - Santa Helena" },
  { value: "715", label: "715 - Santa Lucia" },
  { value: "720", label: "720 - Sao Tome E Principe, Ilhas" },
  { value: "731", label: "731 - Seychelles" },
  { value: "735", label: "735 - Serra Leoa" },
  { value: "738", label: "738 - Sikkim" },
  { value: "741", label: "741 - Cingapura" },
  { value: "744", label: "744 - Siria, Republica Arabe Da" },
  { value: "748", label: "748 - Somalia" },
  { value: "750", label: "750 - Sri Lanka" },
  { value: "754", label: "754 - Suazilandia" },
  { value: "756", label: "756 - Africa Do Sul" },
  { value: "759", label: "759 - Sudao" },
  { value: "764", label: "764 - Suecia" },
  { value: "770", label: "770 - Suriname" },
  { value: "772", label: "772 - Tadjiquistao, Republica Do" },
  { value: "776", label: "776 - Tailandia" },
  { value: "780", label: "780 - Tanzania, Rep.Unida Da" },
  { value: "782", label: "782 - Territorio Brit.Oc.Indico" },
  { value: "783", label: "783 - Djibuti" },
  { value: "785", label: "785 - Territorio da Alta Comissao do Pacifico Ocidental" },
  { value: "788", label: "788 - Chade" },
  { value: "790", label: "790 - Tchecoslovaquia" },
  { value: "795", label: "795 - Timor Leste" },
  { value: "800", label: "800 - Togo" },
  { value: "805", label: "805 - Toquelau, Ilhas" },
  { value: "810", label: "810 - Tonga" },
  { value: "815", label: "815 - Trinidad E Tobago" },
  { value: "820", label: "820 - Tunisia" },
  { value: "823", label: "823 - Turcas E Caicos, Ilhas" },
  { value: "824", label: "824 - Turcomenistao, Republica Do" },
  { value: "827", label: "827 - Turquia" },
  { value: "828", label: "828 - Tuvalu" },
  { value: "831", label: "831 - Ucrania" },
  { value: "833", label: "833 - Uganda" },
  { value: "840", label: "840 - Uniao Das Republicas Socialistas Sovieticas" },
  { value: "847", label: "847 - Uzbequistao, Republica Do" },
  { value: "848", label: "848 - Vaticano, Est.Da Cidade Do" },
  { value: "855", label: "855 - Vietname Norte" },
  { value: "858", label: "858 - Vietna" },
  { value: "863", label: "863 - Virgens, Ilhas (BRITANICAS)" },
  { value: "866", label: "866 - Virgens, Ilhas (E.U.A.)" },
  { value: "870", label: "870 - Fiji" },
  { value: "873", label: "873 - Wake, Ilha" },
  { value: "875", label: "875 - Wallis E Futuna, Ilhas" },
  { value: "888", label: "888 - Congo, Republica Democratica Do" },
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

/**
 * O QUE O PASSO FINAL JÁ CHEGA PREENCHIDO, e por quê.
 *
 * `nacionalidade` nasce em `010` (Brasileiro). O motivo é que o `PassoFinal` só envia campo com
 * valor não vazio: quem não abria o seletor mandava NADA, e o campo chegava ao G.I pelo default
 * dele, sem passar pelo EA. Pré-selecionado, o campo é efetivamente ENVIADO, que é o objetivo.
 *
 * NÃO É CONFIRMAÇÃO FABRICADA, e a distinção importa (veto V12): o valor NÃO sai da IA nem de
 * leitura de documento, é o default documentado do próprio G.I (`nacionalidade`, default `010`),
 * visível na tela, editável, e o candidato ainda precisa tocar em "Concluir" com ele à vista. O
 * dado que chega ao G.I é o MESMO dos dois jeitos; o que muda é passar a sair daqui, explícito.
 *
 * Os outros quatro campos (raça, grau de instrução, estado civil, UF de nascimento) seguem VAZIOS
 * de propósito: ali não existe default do G.I que valha para qualquer pessoa, e chutar um seria
 * inventar informação.
 */
export const PRE_SELECIONADOS_PASSO_FINAL: Readonly<Record<string, string>> = {
  nacionalidade: "010",
};

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
