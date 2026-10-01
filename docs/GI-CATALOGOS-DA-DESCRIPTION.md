# GI: os catálogos que vivem na `description` do schema

Extraídos em 01/10/2026 de `https://apigeral.gi.app.br/openapi/v1.json`. **São 127 `description` em
11 schemas**, e é aqui que moram as listas de valores válidos que os endpoints de catálogo do GI negam
com 404 (`Raca/GetAll`, `Nacionalidade/GetAll`, `EstadoCivil/GetAll`, `GrauInstrucao/GetAll` e
companhia). Nenhum deles precisava do suporte: a lista sempre esteve no contrato.

Este arquivo é referência, gerado por varredura. Os dois schemas de pessoa estão aqui porque um
completa o outro: **`estadoCivil` está documentado ERRADO no DTO do envio** (carrega a lista de grau
de instrução) e **`grauInstrucao` não é documentado lá**, só em `TB_Funcionario`.


## `TB_FuncionarioSelecaoAPI` (42 campos documentados de 415)

### `ufExpedicao` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `sexo` (máx 1, default ``) | 2 valores

- F - Feminino
- M - Masculino

### `tipoAdmissao` (máx 1, default `D`) | 2 valores

- D - Direta
- I - Indireta

### `vinculo` (máx 1, default ``) | 18 valores

- 1 - Contrato CLT
- 2 - Estagiário(Lei Antiga)
- 3 - Avulso
- 4 - Temporário
- 5 - Diretor sem FGTS
- 6 - Serviço não Efetivo
- 7 - CLT Prazo Determinado
- 8 - Diretor com FGTS
- 9 - Outros
- C - Agente Público
- D - Autônomo que Contribui com Remuneração
- E - Autônomo que Contribui com Salário Base
- F - Transportador Autônomo que Contribui com Remuneração
- G - Transportador Autônomo que Contribui com Salário Base
- H - Menor Aprendiz(Lei 10.097/2000)
- I - Doméstico(a)
- J - Estagiário(Nova Lei 11.788 09/2008)
- K - Contrato Intermitente

### `tipoContrato` (máx 1, default `I`) | 2 valores

- D - Determinado
- I - Indeterminado

### `estadoCivil` (máx 1, default `S`) | 13 valores

- 1 - Analfabeto
- 2 - Até 5º Ano Incompleto
- 3 - 5º Ano Completo
- 4 - 6º ao 9º Ano Incompleto
- 5 - Fundamental Completo
- 6 - Ensino Médio Incompleto
- 7 - Ensino Médio Completo
- 8 - Superior Incompleto
- 9 - Superior Completo
- A - Pós-Graduação Completa
- B - Mestrado Completo
- C - Doutorado Completo
- D - Pós-Doutorado Completo

### `naturalidade` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `nacionalidade` (máx 3, default `010`) | 254 valores

- 010 - Brasileiro
- 013 - Afeganistao
- 017 - Albania, Republica Da
- 020 - Naturalizado
- 021 - Argentino
- 022 - Boliviano
- 023 - Chileno
- 024 - Paraguaio
- 025 - Uruguaio
- 026 - Venezuelano
- 027 - Colombiano
- 028 - Peruano
- 029 - Equatoriano
- 030 - Alemão
- 031 - Belga
- 032 - Britanico
- 034 - Canadense
- 035 - Espanhol
- 036 - EUA
- 037 - Francês
- 038 - Suíço
- 039 - Italiano
- 040 - Haitiano
- 041 - Japonês
- 042 - Chinês
- 043 - Coreano
- 044 - Russo
- 045 - Português
- 046 - Paquistanês
- 047 - Indiano
- 048 - Outros Latinos
- 049 - Outros Asiáticos
- 050 - Outros
- 051 - Outros Europeus
- 053 - Arabia Saudita
- 059 - Argelia
- 060 - Angolano
- 061 - Congolês
- 062 - Sul - Africano
- 064 - Armenia, Republica Da
- 065 - Aruba
- 069 - Australia
- 070 - Outros Africanos
- 072 - Austria
- 073 - Azerbaijao, Republica Do
- 076 - Burkina Faso
- 077 - Bahamas, Ilhas
- 078 - Belarus, Republica Da
- 079 - Belize
- 080 - República Tcheca
- 081 - Palestina
- 082 - Guiné - Bissau
- 083 - Cubano
- 084 - Marrocos
- 085 - Gana
- 086 - México
- 087 - Senegal
- 088 - Filipinas
- 089 - Zambia
- 090 - Bermudas
- 091 - Andorra
- 092 - Anguilla
- 093 - Mianmar(BIRMANIA)
- 094 - Antigua E Barbuda
- 095 - Antilhas Holandesas
- 096 - Bahrein, Ilhas
- 097 - Bangladesh
- 098 - Bosnia-Herzegovina(REPUBLICA Da)
- 099 - Barbados
- 101 - Botsuana
- 108 - Brunei
- 111 - Bulgaria, Republica Da
- 115 - Burundi
- 119 - Butao
- 127 - Cabo Verde, Republica De
- 137 - Cayan, Ilhas
- 141 - Camboja
- 145 - Camaroes
- 150 - Jersey, Ilha Do Canal
- 151 - Canarias, Ilhas
- 153 - Cazaquistao, Republica Do
- 154 - Catar
- 161 - Formosa(TAIWAN)
- 163 - Chipre
- 165 - Cocos(Keeling),Ilhas
- 173 - Comores, Ilhas
- 183 - Cook, Ilhas
- 187 - Coreia(DO Norte), Rep.Pop.Democratica
- 193 - Costa Do Marfim
- 195 - Croacia(REPUBLICA Da)
- 196 - Costa Rica
- 198 - Coveite
- 229 - Benin
- 232 - Dinamarca
- 235 - Dominica,Ilha
- 240 - Egito
- 243 - Eritreia
- 244 - Emirados Arabes Unidos
- 246 - Eslovenia, Republica Da
- 247 - Eslovaca, Republica
- 251 - Estonia, Republica Da
- 253 - Etiopia
- 255 - Falkland(ILHAS Malvinas)
- 259 - Feroe, Ilhas
- 271 - Finlandia
- 281 - Gabao
- 285 - Gambia
- 291 - Georgia, Republica Da
- 293 - Gibraltar
- 297 - Granada
- 301 - Grecia
- 305 - Groenlandia
- 309 - Guadalupe
- 313 - Guam
- 317 - Guatemala
- 325 - Guiana Francesa
- 329 - Guine
- 331 - Guine-Equatorial
- 337 - Guiana
- 345 - Honduras
- 351 - Hong Kong
- 355 - Hungria, Republica Da
- 357 - Iemen
- 359 - Man, Ilha De
- 365 - Indonesia
- 369 - Iraque
- 372 - Ira, Republica Islamica Do
- 375 - Irlanda
- 379 - Islandia
- 383 - Israel
- 388 - Servia E Montenegro
- 391 - Jamaica
- 396 - Johston, Ilhas
- 403 - Jordania
- 411 - Kiribati
- 420 - Laos, Rep.Pop.Democr.Do
- 423 - Lebuan,Ilhas
- 426 - Lesoto
- 427 - Letonia, Republica Da
- 431 - Libano
- 434 - Liberia
- 438 - Libia
- 440 - Liechtenstein
- 442 - Lituania, Republica Da
- 445 - Luxemburgo
- 447 - Macau
- 449 - Macedonia, Ant.Rep.Iugoslava
- 450 - Madagascar
- 452 - Ilha Da Madeira
- 455 - Malasia
- 458 - Malavi
- 461 - Maldivas
- 464 - Mali
- 467 - Malta
- 472 - Marianas Do Norte
- 476 - Marshall,Ilhas
- 477 - Martinica
- 485 - Mauricio
- 488 - Mauritania
- 490 - Midway, Ilhas
- 494 - Moldavia, Republica Da
- 495 - Monaco
- 497 - Mongolia
- 499 - Micronesia
- 501 - Montserrat,Ilhas
- 505 - Mocambique
- 507 - Namibia
- 508 - Nauru
- 511 - Christmas,Ilha(NAVIDAD)
- 517 - Nepal
- 521 - Nicaragua
- 525 - Niger
- 528 - Nigeria
- 531 - Niue,Ilha
- 535 - Norfolk,Ilha
- 538 - Noruega
- 542 - Nova Caledonia
- 545 - Papua Nova Guine
- 548 - Nova Zelandia
- 551 - Vanuatu
- 556 - Oma
- 566 - Pacifico,Ilhas Do(POSSESSAO Dos Eua)
- 573 - Paises Baixos(HOLANDA)
- 575 - Palau
- 580 - Panama
- 593 - Pitcairn,Ilha
- 599 - Polinesia Francesa
- 603 - Polonia, Republica Da
- 611 - Porto Rico
- 623 - Quenia
- 625 - Quirguiz, Republica
- 628 - Reino Unido
- 640 - Republica Centro-Africana
- 647 - Republica Dominicana
- 660 - Reuniao, Ilha
- 665 - Zimbabue
- 670 - Romenia
- 675 - Ruanda
- 677 - Salomao, Ilhas
- 678 - Saint Kitts E Nevis
- 685 - Saara Ocidental
- 687 - El Salvador
- 690 - Samoa
- 691 - Samoa Americana
- 695 - Sao Cristovao E Neves, Ilhas
- 697 - San Marino
- 700 - Sao Pedro E Miquelon
- 705 - Sao Vicente E Granadinas
- 710 - Santa Helena
- 715 - Santa Lucia
- 720 - Sao Tome E Principe, Ilhas
- 731 - Seychelles
- 735 - Serra Leoa
- 738 - Sikkim
- 741 - Cingapura
- 744 - Siria, Republica Arabe Da
- 748 - Somalia
- 750 - Sri Lanka
- 754 - Suazilandia
- 756 - Africa Do Sul
- 759 - Sudao
- 764 - Suecia
- 770 - Suriname
- 772 - Tadjiquistao, Republica Do
- 776 - Tailandia
- 780 - Tanzania, Rep.Unida Da
- 782 - Territorio Brit.Oc.Indico
- 783 - Djibuti
- 785 - Territorio da Alta Comissao do Pacifico Ocidental
- 788 - Chade
- 790 - Tchecoslovaquia
- 795 - Timor Leste
- 800 - Togo
- 805 - Toquelau, Ilhas
- 810 - Tonga
- 815 - Trinidad E Tobago
- 820 - Tunisia
- 823 - Turcas E Caicos, Ilhas
- 824 - Turcomenistao, Republica Do
- 827 - Turquia
- 828 - Tuvalu
- 831 - Ucrania
- 833 - Uganda
- 840 - Uniao Das Republicas Socialistas Sovieticas
- 847 - Uzbequistao, Republica Do
- 848 - Vaticano, Est.Da Cidade Do
- 855 - Vietname Norte
- 858 - Vietna
- 863 - Virgens, Ilhas (BRITANICAS)
- 866 - Virgens, Ilhas (E.U.A.)
- 870 - Fiji
- 873 - Wake, Ilha
- 875 - Wallis E Futuna, Ilhas
- 888 - Congo, Republica Democratica Do

### `ufResid` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `tipoSalario` (máx 1, default `M`) | 7 valores

- A - Aula(Professor)
- C - Comissao
- D - Dia
- H - Hora
- M - Mês
- Q - Quinzenal
- T - Tarefa

### `tipoFatu` (máx 1, default `S`) | 2 valores

- I - Indicação
- S - Seleção

### `codigoRescisao` (default `0`) | 14 valores

- 1 - Pela Empresa com Justa Causa
- 2 - Pela Empresa sem Justa Causa
- 3 - Pelo Empregado com Justa Causa
- 4 - Pelo Empregado sem Justa Causa
- 5 - Término de Contrato
- 6 - Transferência com Ônus
- 7 - Aposentadoria
- 8 - Morte
- 9 - Término de Contrato Antecipado pela Empresa
- 10 - Outros
- 11 - Término de Contrato Antecipado pelo Empregado
- 12 - Aposentadoria por Invalidez
- 13 - Término de Contrato Por Motivo de Acordo
- 14 - Motivo de Acordo(Contrato Intermitente)

### `ufrg` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `tipoVT` (máx 1, default `E`) | 3 valores

- A - Ambos
- D - Dinheiro
- E - Espécie

### `tipoVR` (máx 1, default `E`) | 2 valores

- D - Dinheiro
- E - Espécie

### `ocorrenciaFGTS` (default `0`) | 8 valores

- 1 -  (apenas 1 vínculo empregatício) Não Exposição a Agente Nocivo
- 2 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 15 anos de Serviço)
- 3 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 20 anos de Serviço)
- 4 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 25 anos de Serviço)
- 5 -  (mais de 1 vínculo empregatício) Não Exposição a Agente Nocivo
- 6 -  (mais de 1 vínculo empregatício)  Exposição a Agente Nocivo(Aposentadoria com 15 anos de Serviço)
- 7 -  (mais de 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 20 anos de Serviço)
- 8 -  (mais de 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 25 anos de Serviço)

### `raca` (máx 1, default ``) | 5 valores

- 1 - Branca
- 2 - Preta
- 3 - Amarela
- 4 - Parda
- 5 - Indígena

### `tipoPgto` (máx 1, default `M`) | 3 valores

- M - Mensal
- Q - Quinzenal
- S - Semanal

### `tipo13o` (default `7`) | 8 valores

- 0 - Em todos os cálculos s/ rendimentos
- 1 - Em todos os cálculos s/ rendimentos após o 15º dia(1º pgto.)
- 2 - Todo mês s/ rendimentos
- 3 - No final do contrato s/ rendimentos
- 4 - Em todos os cálculos s/ salário
- 5 - Em todos os cálculos s/ salário após o 15º dia(1º pgto.)
- 6 - Todo mês sobre salário
- 7 - No final do contrato s/ salário

### `tipoFer` (default `7`) | 2 valores

- 1 - Demanda Complementar de Serviços.
- 2 - Substituição Transitória de Pessoal Permanente.

### `tipoDemissao` (máx 1, default ``) | 3 valores

- Dispensa
- Efetivaçao
- Renovação

### `tipoVctoContrato` (máx 1, default `D`) | 2 valores

- D - Dias
- M - Meses

### `tipoVctoContratoProrr` (máx 1, default `D`) | 2 valores

- D - Dias
- M - Meses

### `tipoDeficiencia` (default `0`) | 8 valores

- 0 - Não é Portador de Deficiência
- 1 - Física
- 2 - Auditiva
- 3 - Visual
- 4 - Mental
- 5 - Múltipla
- 6 - Reabilitado
- 7 - Intelectual

### `escalaTipo` (máx 1, default ``) | 4 valores

- N - Normal
- S - Sábado
- D - Domingo
- S - Sexta - Feira

### `tipoEndereco` (máx 30, default `Nao Informado`) | 179 valores

- Nao Informado
- Area
- Acesso
- Acampamento
- Acesso Local
- Adro
- Area Especial
- Aeroporto
- Alameda
- Avenida Marginal Direita
- Avenida Marginal Esquerda
- Anel Viario
- Antiga Estrada
- Arteria
- Alto
- Atalho
- Area Verde
- Avenida
- Avenida Contorno
- Avenida Marginal
- Avenida Velha
- Balneario
- Beco
- Buraco
- Belvedere
- Bloco
- Balao
- Blocos
- Bulevar
- Bosque
- Boulevard
- Baixa
- Cais
- Calcada
- Caminho
- Canal
- Chacara
- Chapadao
- Ciclovia
- Circular
- Conjunto
- Conjunto Mutirao
- Complexo Viario
- Colonia
- Comunidade
- Condominio
- Corredor
- Campo
- Corrego
- Contorno
- Descida
- Desvio
- Distrito
- Entre Bloco
- Estrada Intermunicipal
- Enseada
- Entrada Particular
- Entre Quadra
- Escada
- Escadaria
- Estrada Estadual
- Estrada Vicinal
- Estrada de Ligacao
- Estrada Municipal
- Esplanada
- Estrada de Servidao
- Estrada
- Estrada Velha
- Estrada Antiga
- Estacao
- Estadio
- Estancia
- Estrada Particular
- Estacionamento
- Evangelica
- Elevada
- Eixo Industrial
- Favela
- Fazenda
- Ferrovia
- Fonte
- Feira
- Forte
- Galeria
- Granja
- Nucleo Habitacional
- Ilha
- Indeterminado
- Ilhota
- Jardim
- Jardinete
- Ladeira
- Lagoa
- Lago
- Loteamento
- Largo
- Lote
- Mercado
- Marina
- Modulo
- Projecao
- Morro
- Monte
- Nucleo
- Nucleo Rural
- Outeiro
- Paralela
- Passeio
- Patio
- Praca
- Praca de Esportes
- Parada
- Paradouro
- Ponta
- Praia
- Prolongamento
- Parque Municipal
- Parque
- Parque Residencial
- Passarela
- Passagem
- Passagem de Pedestre
- Passagem Subterranea
- Ponte
- Porto
- Quadra
- Quinta
- Quintas
- Rua
- Rua Integracao
- Rua de Ligacao
- Rua Particular
- Rua Velha
- Ramal
- Recreio
- Recanto
- Retiro
- Residencial
- Reta
- Ruela
- Rampa
- Rodo Anel
- Rodovia
- Rotula
- Rua de Pedestre
- Margem
- Retorno
- Rotatoria
- Segunda Avenida
- Sitio
- Servidao
- Setor
- Subida
- Trincheira
- Terminal
- Trecho
- Trevo
- Tunel
- Travessa
- Travessa Particular
- Travessa Velha
- Unidade
- Via
- Via Coletora
- Via Local
- Via de Acesso
- Vala
- Via Costeira
- Viaduto
- Via Expressa
- Vereda
- Via Elevado
- Vila
- Viela
- Vale
- Via Litoranea
- Via de Pedestre
- Variante
- Zigue-Zague

### `exterior_paisResidencia` (default `0`) | 263 valores

- 0000 - Brasil
- 0008 - Abu Dhabi
- 0009 - Dirce
- 0013 - Afeganistao
- 0017 - Albania, Republica Da
- 0020 - Alboran-Perejil,Ilhas
- 0023 - Alemanha
- 0025 - Alemanha, Republica Democratica
- 0031 - Burkina Faso
- 0037 - Andorra
- 0040 - Angola
- 0041 - Anguilla
- 0043 - Antigua E Barbuda
- 0047 - Antilhas Holandesas
- 0053 - Arabia Saudita
- 0059 - Argelia
- 0063 - Argentina
- 0064 - Armenia, Republica Da
- 0065 - Aruba
- 0069 - Australia
- 0072 - Austria
- 0073 - Azerbaijao, Republica Do
- 0077 - Bahamas, Ilhas
- 0080 - Bahrein, Ilhas
- 0081 - Bangladesh
- 0083 - Barbados
- 0085 - Belarus, Republica Da
- 0087 - Belgica
- 0088 - Belize
- 0090 - Bermudas
- 0093 - Mianmar(BIRMANIA)
- 0097 - Bolivia, Estado Plurinacional Da
- 0098 - Bosnia-Herzegovina(REPUBLICA Da)
- 0100 - Int.Z.F.Manaus
- 0101 - Botsuana
- 0105 - Brasil
- 0106 - Fretado P/Brasil
- 0108 - Brunei
- 0111 - Bulgaria, Republica Da
- 0115 - Burundi
- 0119 - Butao
- 0127 - Cabo Verde, Republica De
- 0131 - Cachemira
- 0137 - Cayman, Ilhas
- 0141 - Camboja
- 0145 - Camaroes
- 0149 - Canada
- 0150 - Jersey, Ilha Do Canal
- 0151 - Canarias, Ilhas
- 0152 - Canal,Ilhas
- 0153 - Cazaquistao, Republica Do
- 0154 - Catar
- 0158 - Chile
- 0160 - China, Republica Popular
- 0161 - Formosa(TAIWAN)
- 0163 - Chipre
- 0165 - Cocos(Keeling),Ilhas
- 0169 - Colombia
- 0173 - Comores, Ilhas
- 0177 - Congo
- 0183 - Cook, Ilhas
- 0187 - Coreia(DO Norte), Rep.Pop.Democratica
- 0190 - Coreia(DO Sul), Republica Da
- 0193 - Costa Do Marfim
- 0195 - Croacia(REPUBLICA Da)
- 0196 - Costa Rica
- 0198 - Coveite
- 0199 - Cuba
- 0229 - Benin
- 0232 - Dinamarca
- 0235 - Dominica,Ilha
- 0237 - Dubai
- 0239 - Equador
- 0240 - Egito
- 0243 - Eritreia
- 0244 - Emirados Arabes Unidos
- 0245 - Espanha
- 0246 - Eslovenia, Republica Da
- 0247 - Eslovaca, Republica
- 0249 - Estados Unidos
- 0251 - Estonia, Republica Da
- 0253 - Etiopia
- 0255 - Falkland(ILHAS Malvinas)
- 0259 - Feroe, Ilhas
- 0263 - Fezzan
- 0267 - Filipinas
- 0271 - Finlandia
- 0275 - Franca
- 0281 - Gabao
- 0285 - Gambia
- 0289 - Gana
- 0291 - Georgia, Republica Da
- 0293 - Gibraltar
- 0297 - Granada
- 0301 - Grecia
- 0305 - Groenlandia
- 0309 - Guadalupe
- 0313 - Guam
- 0317 - Guatemala
- 0325 - Guiana Francesa
- 0329 - Guine
- 0331 - Guine-Equatorial
- 0334 - Guine-Bissau
- 0337 - Guiana
- 0341 - Haiti
- 0345 - Honduras
- 0351 - Hong Kong
- 0355 - Hungria, Republica Da
- 0357 - Iemen
- 0358 - Iemem Do Sul
- 0359 - Man, Ilha De
- 0361 - India
- 0365 - Indonesia
- 0367 - Inglaterra
- 0369 - Iraque
- 0372 - Ira, Republica Islamica Do
- 0375 - Irlanda
- 0379 - Islandia
- 0383 - Israel
- 0386 - Italia
- 0388 - Servia E Montenegro
- 0391 - Jamaica
- 0395 - Jammu
- 0396 - Johnston, Ilhas
- 0399 - Japao
- 0403 - Jordania
- 0411 - Kiribati
- 0420 - Laos, Rep.Pop.Democr.Do
- 0423 - Lebuan,Ilhas
- 0426 - Lesoto
- 0427 - Letonia, Republica Da
- 0431 - Libano
- 0434 - Liberia
- 0438 - Libia
- 0440 - Liechtenstein
- 0442 - Lituania, Republica Da
- 0445 - Luxemburgo
- 0447 - Macau
- 0449 - Macedonia, Ant.Rep.Iugoslava
- 0450 - Madagascar
- 0452 - Ilha Da Madeira
- 0455 - Malasia
- 0458 - Malavi
- 0461 - Maldivas
- 0464 - Mali
- 0467 - Malta
- 0472 - Marianas Do Norte
- 0474 - Marrocos
- 0476 - Marshall,Ilhas
- 0477 - Martinica
- 0485 - Mauricio
- 0488 - Mauritania
- 0490 - Midway, Ilhas
- 0493 - Mexico
- 0494 - Moldavia, Republica Da
- 0495 - Monaco
- 0497 - Mongolia
- 0499 - Micronesia
- 0501 - Montserrat,Ilhas
- 0505 - Mocambique
- 0507 - Namibia
- 0508 - Nauru
- 0511 - Christmas,Ilha(NAVIDAD)
- 0517 - Nepal
- 0521 - Nicaragua
- 0525 - Niger
- 0528 - Nigeria
- 0531 - Niue,Ilha
- 0535 - Norfolk,Ilha
- 0538 - Noruega
- 0542 - Nova Caledonia
- 0545 - Papua Nova Guine
- 0548 - Nova Zelandia
- 0551 - Vanuatu
- 0556 - Oma
- 0563 - Pacifico,Ilhas Do(ADMINISTRACAO Dos Eua)
- 0566 - Pacifico,Ilhas Do(POSSESSAO Dos Eua)
- 0569 - Pacifico,Ilhas Do(TERRITORIO Em Fideicomisso Dos
- 0573 - Paises Baixos (HOLANDA)
- 0575 - Palau
- 0576 - Paquistao
- 0578 - Palestina
- 0580 - Panama
- 0583 - Papua Nova Guiné
- 0586 - Paraguai
- 0589 - Peru
- 0593 - Pitcairn, Ilha
- 0599 - Polinesia Francesa
- 0603 - Polonia, Republica Da
- 0607 - Portugal
- 0611 - Porto Rico
- 0623 - Quenia
- 0625 - Quirguiz, Republica
- 0628 - Reino Unido
- 0640 - Republica Centro-Africana
- 0647 - Republica Dominicana
- 0660 - Reuniao, Ilha
- 0665 - Zimbabue
- 0670 - Romenia
- 0675 - Ruanda
- 0676 - Russia, Federacao Da
- 0677 - Salomao, Ilhas
- 0678 - Saint Kitts E Nevis
- 0685 - Saara Ocidental
- 0687 - El Salvador
- 0690 - Samoa
- 0691 - Samoa Americana
- 0695 - Sao Cristovao E Neves, Ilhas
- 0697 - San Marino
- 0700 - Sao Pedro E Miquelon
- 0705 - Sao Vicente E Granadinas
- 0710 - Santa Helena
- 0715 - Santa Lucia
- 0720 - Sao Tome E Principe, Ilhas
- 0728 - Senegal
- 0731 - Seychelles
- 0735 - Serra Leoa
- 0738 - Sikkim
- 0741 - Cingapura
- 0744 - Siria, Republica Arabe Da
- 0748 - Somalia
- 0750 - Sri Lanka
- 0754 - Suazilandia
- 0756 - Africa Do Sul
- 0759 - Sudao
- 0764 - Suecia
- 0767 - Suica
- 0770 - Suriname
- 0772 - Tadjiquistao, Republica Do
- 0776 - Tailandia
- 0780 - Tanzania, Rep.Unida Da
- 0782 - Territorio Brit.Oc.Indico
- 0783 - Djibuti
- 0785 - Territorio da Alta Comissao do Pacifico Ocidental
- 0788 - Chade
- 0790 - Tchecoslovaquia
- 0791 - Tcheca, Republica
- 0795 - Timor Leste
- 0800 - Togo
- 0805 - Toquelau, Ilhas
- 0810 - Tonga
- 0815 - Trinidad E Tobago
- 0820 - Tunisia
- 0823 - Turcas E Caicos, Ilhas
- 0824 - Turcomenistao, Republica Do
- 0827 - Turquia
- 0828 - Tuvalu
- 0831 - Ucrania
- 0833 - Uganda
- 0840 - Uniao Das Republicas Socialistas Sovieticas
- 0845 - Uruguai
- 0847 - Uzbequistao, Republica Do
- 0848 - Vaticano, Est.Da Cidade Do
- 0850 - Venezuela
- 0855 - Vietname Norte
- 0858 - Vietna
- 0863 - Virgens, Ilhas (BRITANICAS)
- 0866 - Virgens, Ilhas (E.U.A.)
- 0870 - Fiji
- 0873 - Wake, Ilha
- 0875 - Wallis E Futuna, Ilhas
- 0888 - Congo, Republica Democratica Do
- 0890 - Zambia

### `indAdmissao` (default `1`) | 4 valores

- 0 - Não Informado
- 1 - Normal
- 2 - Decorrente de Ação Fiscal
- 3 - Decorrente de Decisão Judicial

### `tpRegimeTrab` (default `1`) | 3 valores

- 0 - Não Informado
- 1 - CLT - Consolidação das Leis de Trabalho e legislações trabalhistas
- 2 - Estatutário

### `tpRegimePrev` (default `1`) | 4 valores

- 0 - Não Informado
- 1 - RGPS - Regime Geral da Previdência Social
- 2 - RPPS - Regime Próprio de Previdência Social
- 3 - RPPE - Regime de Previdência Social no Exterior

### `natAtividade` (default `1`) | 3 valores

- 0 - Não Informado
- 1 - Trabalho Urbano
- 2 - Trabalho Rural

### `codCateg_eSocial` (default `0`) | 37 valores

- 000 - Não Informado
- 101 - Empregado - Geral, inclusive o empregado público da administração direta ou indireta contratado pela CLT
- 102 - Empregado - Trabalhador Rural por Pequeno Prazo da Lei 11.718/2008
- 103 - Empregado - Aprendiz
- 104 - Empregado - Doméstico
- 105 - Empregado - contrato a termo firmado nos termos da Lei 9601/98
- 106 - Empregado - contrato por prazo determinado nos termos da Lei 6019/74
- 111 - Empregado - contrato de trabalho intermitente
- 201 - Trabalhador Avulso Portuário
- 202 - Trabalhador Avulso Não Portuário
- 301 - Servidor Público Titular de Cargo Efetivo, Magistrado, Ministro de Tribunal de Contas, Conselheiro de Tribunal de Contas e Membro do Ministério Público
- 302 - Servidor Público Ocupante de Cargo exclusivo em comissão
- 303 - Agente Político
- 305 - Servidor Público indicado para conselho ou órgão representativo, na condição de representante do governo, órgão ou entidade da administração pública
- 306 - Servidor Público Temporário, sujeito a regime administrativo especial definido em lei própria
- 307 - Militar Efetivo
- 308 - Conscrito
- 309 - Agente Público - Outros
- 401 - Dirigente Sindical - informação prestada pelo Sindicato
- 410 - Trabalhador cedido - informação prestada pelo Cessionário
- 701 - Contribuinte individual - Autônomo em geral, exceto se enquadrado em uma das demais categorias de contribuinte individual
- 711 - Contribuinte individual - Transportador autônomo de passageiros
- 712 - Contribuinte individual - Transportador autônomo de carga
- 721 - Contribuinte individual - Diretor não empregado, com FGTS
- 722 - Contribuinte individual - Diretor não empregado, sem FGTS
- 723 - Contribuinte individual - empresários, sócios e membro de conselho de administração ou fiscal
- 731 - Contribuinte individual - Cooperado que presta serviços por intermédio de Cooperativa de Trabalho
- 734 - Contribuinte individual - Transportador Cooperado que presta serviços por intermédio de cooperativa de trabalho
- 738 - Contribuinte individual - Cooperado filiado a Cooperativa de Produção
- 741 - Contribuinte individual - Micro Empreendedor Individual
- 751 - Contribuinte individual - magistrado classista temporário da Justiça do Trabalho ou da Justiça Eleitoral que seja aposentado de qualquer regime prev.
- 761 - Contribuinte individual - Associado eleito para direção de Cooperativa, associação ou entidade de classe de qualquer natureza ou finalidade
- 771 - Contribuinte individual - Membro de conselho tutelar, nos termos da Lei nº 8.069, de 13 de julho de 1990
- 781 - Ministro de confissão religiosa ou membro de vida consagrada, de congregação ou de ordem religiosa
- 901 - Estagiário
- 902 - Médico Residente
- 903 - Bolsista, nos termos da lei 8958/1994

### `tpRegimeJor` (default `0`) | 5 valores

- 0 - Não Informado
- 1 - Submetidos a Horário de Trabalho(Cap.II da CLT)
- 2 - Atividade Externa especificada no Inciso I do Art. 62 da CLT
- 3 - Funções específicadas no Inciso II do Art. 62 da CLT
- 4 - Teletrabalho, previsto no Inciso III do Art. 62 da CLT

### `tipoAdmSIRETT` (default `0`) | 5 valores

- 0 - Não Informado
- 1 - Locais sem filiais
- 2 - Estudo de mercado
- 3 - Contratação superior a 3 meses
- 4 - Prorrogação de contrato

### `ufCnh` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `classTrabEstrang` (default `0`) | 13 valores

- 00 - Não Informado
- 01 - Visto permanente
- 02 - Visto temporário
- 03 - Asilado
- 04 - Refugiado
- 05 - Solicitante de Refúgio
- 06 - Residente fora do Brasil
- 07 - Deficiente físico e com mais de 51 anos
- 08 - Com residência provisória e anistiado, em situação irregular
- 09 - Permanência no Brasil em razão de filhos ou cônjuge brasileiros
- 10 - Beneficiado pelo acordo entre países do Mercosul
- 11 - Dependente de agente diplomático e/ou consular de países que mantém convênio de reciprocidade para o exercício de atividade remunerada no Brasil
- 12 - Beneficiado pelo Tratado de Amizade, Cooperação e Consulta entre a República Federativa do Brasil e a República Portuguesa

### `indProvim` (default `1`) | 3 valores

- 0 - Não Informado
- 1 - Normal
- 2 - Decorrente de Decisão Judicial

### `tpJornada` (default `1`) | 5 valores

- 0 - Não Informado
- 1 - Jornada com horário diário e folga fixos
- 2 - Jornada 12 x 36 (12 horas de trabalho seguidas de 36 horas ininterruptas de descanso)
- 3 - Jornada com horário diário fixo e folga variável
- 9 - Demais tipos de jornada

### `tpAdmissao` (default `1`) | 6 valores

- 0 - Não Informado
- 1 - Admissão
- 2 - Transferência de empresa do mesmo grupo econômico
- 3 - Transferência de empresa consorciada ou de consórcio
- 4 - Transferência por motivo de sucessão, incorporação, cisão ou fusão
- 5 - Transferência do empregado doméstico para outro representante da mesma unidade familiar

### `ufcrmExameTox` (máx 2, default ``) | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `indMV` (default `0`) | 4 valores

- 0 - Não Informado
- 1 - Contribuição descontada pelo primeiro empregador(Soma Bases para Calcular Percentual sem abater o desconto anterior)
- 2 - Contribuição descontada por outra(s) empresa(s) sobre valor inferior ao limite máximo do salário de contribuição(Soma Bases para Calculo e Desconto)
- 3 - Contribuição sobre o limite máximo de salário de contribuição já descontada em outra(s) empresa(s)  (Sem Desconto Ginfor )

### `apiSincAdmissaoDigital` (default `False`) | 1 valores

- true - Sincroniza com Admissao Digital, false - Sincroniza com GI


## `TB_Funcionario` (43 campos documentados de 365)

### `tpRegimeJor` | 5 valores

- 0 - Não Informado
- 1 - Submetidos a Horário de Trabalho(Cap.II da CLT)
- 2 - Atividade Externa especificada no Inciso I do Art. 62 da CLT
- 3 - Funções específicadas no Inciso II do Art. 62 da CLT
- 4 - Teletrabalho, previsto no Inciso III do Art. 62 da CLT

### `tpJornada` | 5 valores

- 0 - Não Informado
- 1 - Jornada com horário diário e folga fixos
- 2 - Jornada 12 x 36 (12 horas de trabalho seguidas de 36 horas ininterruptas de descanso)
- 3 - Jornada com horário diário fixo e folga variável
- 9 - Demais tipos de jornada

### `vinculo` | 18 valores

- 1 - Contrato CLT
- 2 - Estagiário(Lei Antiga)
- 3 - Avulso
- 4 - Temporário
- 5 - Diretor sem FGTS
- 6 - Serviço não Efetivo
- 7 - CLT Prazo Determinado
- 8 - Diretor com FGTS
- 9 - Outros
- C - Agente Público
- D - Autônomo que Contribui com Remuneração
- E - Autônomo que Contribui com Salário Base
- F - Transportador Autônomo que Contribui com Remuneração
- G - Transportador Autônomo que Contribui com Salário Base
- H - Menor Aprendiz(Lei 10.097/2000)
- I - Doméstico(a)
- J - Estagiário(Nova Lei 11.788 09/2008)
- K - Contrato Intermitente

### `natAtividade` | 3 valores

- 0 - Não Informado
- 1 - Trabalho Urbano
- 2 - Trabalho Rural

### `codCateg_eSocial` | 37 valores

- 000 - Não Informado
- 101 - Empregado - Geral, inclusive o empregado público da administração direta ou indireta contratado pela CLT
- 102 - Empregado - Trabalhador Rural por Pequeno Prazo da Lei 11.718/2008
- 103 - Empregado - Aprendiz
- 104 - Empregado - Doméstico
- 105 - Empregado - contrato a termo firmado nos termos da Lei 9601/98
- 106 - Empregado - contrato por prazo determinado nos termos da Lei 6019/74
- 111 - Empregado - contrato de trabalho intermitente
- 201 - Trabalhador Avulso Portuário
- 202 - Trabalhador Avulso Não Portuário
- 301 - Servidor Público Titular de Cargo Efetivo, Magistrado, Ministro de Tribunal de Contas, Conselheiro de Tribunal de Contas e Membro do Ministério Público
- 302 - Servidor Público Ocupante de Cargo exclusivo em comissão
- 303 - Agente Político
- 305 - Servidor Público indicado para conselho ou órgão representativo, na condição de representante do governo, órgão ou entidade da administração pública
- 306 - Servidor Público Temporário, sujeito a regime administrativo especial definido em lei própria
- 307 - Militar Efetivo
- 308 - Conscrito
- 309 - Agente Público - Outros
- 401 - Dirigente Sindical - informação prestada pelo Sindicato
- 410 - Trabalhador cedido - informação prestada pelo Cessionário
- 701 - Contribuinte individual - Autônomo em geral, exceto se enquadrado em uma das demais categorias de contribuinte individual
- 711 - Contribuinte individual - Transportador autônomo de passageiros
- 712 - Contribuinte individual - Transportador autônomo de carga
- 721 - Contribuinte individual - Diretor não empregado, com FGTS
- 722 - Contribuinte individual - Diretor não empregado, sem FGTS
- 723 - Contribuinte individual - empresários, sócios e membro de conselho de administração ou fiscal
- 731 - Contribuinte individual - Cooperado que presta serviços por intermédio de Cooperativa de Trabalho
- 734 - Contribuinte individual - Transportador Cooperado que presta serviços por intermédio de cooperativa de trabalho
- 738 - Contribuinte individual - Cooperado filiado a Cooperativa de Produção
- 741 - Contribuinte individual - Micro Empreendedor Individual
- 751 - Contribuinte individual - magistrado classista temporário da Justiça do Trabalho ou da Justiça Eleitoral que seja aposentado de qualquer regime prev.
- 761 - Contribuinte individual - Associado eleito para direção de Cooperativa, associação ou entidade de classe de qualquer natureza ou finalidade
- 771 - Contribuinte individual - Membro de conselho tutelar, nos termos da Lei nº 8.069, de 13 de julho de 1990
- 781 - Ministro de confissão religiosa ou membro de vida consagrada, de congregação ou de ordem religiosa
- 901 - Estagiário
- 902 - Médico Residente
- 903 - Bolsista, nos termos da lei 8958/1994

### `tpAdmissao` | 6 valores

- 0 - Não Informado
- 1 - Admissão
- 2 - Transferência de empresa do mesmo grupo econômico
- 3 - Transferência de empresa consorciada ou de consórcio
- 4 - Transferência por motivo de sucessão, incorporação, cisão ou fusão
- 5 - Transferência do empregado doméstico para outro representante da mesma unidade familiar

### `tpRegimeTrab` | 3 valores

- 0 - Não Informado
- 1 - CLT - Consolidação das Leis de Trabalho e legislações trabalhistas
- 2 - Estatutário

### `tpRegimePrev` | 4 valores

- 0 - Não Informado
- 1 - RGPS - Regime Geral da Previdência Social
- 2 - RPPS - Regime Próprio de Previdência Social
- 3 - RPPE - Regime de Previdência Social no Exterior

### `indAdmissao` | 4 valores

- 0 - Não Informado
- 1 - Normal
- 2 - Decorrente de Ação Fiscal
- 3 - Decorrente de Decisão Judicial

### `tipoAdmissao` | 2 valores

- Direta
- Indireta

### `indProvim` | 3 valores

- 0 - Não Informado
- 1 - Normal
- 2 - Decorrente de Decisão Judicial

### `codigoRescisao` | 14 valores

- 1 - Pela Empresa com Justa Causa
- 2 - Pela Empresa sem Justa Causa
- 3 - Pelo Empregado com Justa Causa
- 4 - Pelo Empregado sem Justa Causa
- 5 - Término de Contrato
- 6 - Transferência com Ônus
- 7 - Aposentadoria
- 8 - Morte
- 9 - Término de Contrato Antecipado pela Empresa
- 10 - Outros
- 11 - Término de Contrato Antecipado pelo Empregado
- 12 - Aposentadoria por Invalidez
- 13 - Término de Contrato Por Motivo de Acordo
- 14 - Motivo de Acordo(Contrato Intermitente)

### `tipoDemissao` | 3 valores

- Dispensa
- Efetivaçao
- Renovação

### `tipoVctoContrato` | 2 valores

- Dias
- Meses

### `tipoVctoContratoProrr` | 2 valores

- Dias
- Meses

### `tipoContrato` | 2 valores

- Determinado
- Indeterminado

### `tipoSalario` | 6 valores

- Comissao
- Dia
- Hora
- Mês
- Quinzenal
- Tarefa

### `tipoPgto` | 3 valores

- Mensal
- Quinzenal
- Semanal

### `ufResid` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `tipoEndereco` | 179 valores

- Nao Informado
- Area
- Acesso
- Acampamento
- Acesso Local
- Adro
- Area Especial
- Aeroporto
- Alameda
- Avenida Marginal Direita
- Avenida Marginal Esquerda
- Anel Viario
- Antiga Estrada
- Arteria
- Alto
- Atalho
- Area Verde
- Avenida
- Avenida Contorno
- Avenida Marginal
- Avenida Velha
- Balneario
- Beco
- Buraco
- Belvedere
- Bloco
- Balao
- Blocos
- Bulevar
- Bosque
- Boulevard
- Baixa
- Cais
- Calcada
- Caminho
- Canal
- Chacara
- Chapadao
- Ciclovia
- Circular
- Conjunto
- Conjunto Mutirao
- Complexo Viario
- Colonia
- Comunidade
- Condominio
- Corredor
- Campo
- Corrego
- Contorno
- Descida
- Desvio
- Distrito
- Entre Bloco
- Estrada Intermunicipal
- Enseada
- Entrada Particular
- Entre Quadra
- Escada
- Escadaria
- Estrada Estadual
- Estrada Vicinal
- Estrada de Ligacao
- Estrada Municipal
- Esplanada
- Estrada de Servidao
- Estrada
- Estrada Velha
- Estrada Antiga
- Estacao
- Estadio
- Estancia
- Estrada Particular
- Estacionamento
- Evangelica
- Elevada
- Eixo Industrial
- Favela
- Fazenda
- Ferrovia
- Fonte
- Feira
- Forte
- Galeria
- Granja
- Nucleo Habitacional
- Ilha
- Indeterminado
- Ilhota
- Jardim
- Jardinete
- Ladeira
- Lagoa
- Lago
- Loteamento
- Largo
- Lote
- Mercado
- Marina
- Modulo
- Projecao
- Morro
- Monte
- Nucleo
- Nucleo Rural
- Outeiro
- Paralela
- Passeio
- Patio
- Praca
- Praca de Esportes
- Parada
- Paradouro
- Ponta
- Praia
- Prolongamento
- Parque Municipal
- Parque
- Parque Residencial
- Passarela
- Passagem
- Passagem de Pedestre
- Passagem Subterranea
- Ponte
- Porto
- Quadra
- Quinta
- Quintas
- Rua
- Rua Integracao
- Rua de Ligacao
- Rua Particular
- Rua Velha
- Ramal
- Recreio
- Recanto
- Retiro
- Residencial
- Reta
- Ruela
- Rampa
- Rodo Anel
- Rodovia
- Rotula
- Rua de Pedestre
- Margem
- Retorno
- Rotatoria
- Segunda Avenida
- Sitio
- Servidao
- Setor
- Subida
- Trincheira
- Terminal
- Trecho
- Trevo
- Tunel
- Travessa
- Travessa Particular
- Travessa Velha
- Unidade
- Via
- Via Coletora
- Via Local
- Via de Acesso
- Vala
- Via Costeira
- Viaduto
- Via Expressa
- Vereda
- Via Elevado
- Vila
- Viela
- Vale
- Via Litoranea
- Via de Pedestre
- Variante
- Zigue-Zague

### `tipoDeficiencia` | 8 valores

- 0 - Não é Portador de Deficiência
- 1 - Física
- 2 - Auditiva
- 3 - Visual
- 4 - Mental
- 5 - Múltipla
- 6 - Reabilitado
- 7 - Intelectual

### `sexo` | 2 valores

- F - Feminino
- M - Masculino

### `raca` | 5 valores

- 1 - Branca
- 2 - Preta
- 3 - Amarela
- 4 - Parda
- 5 - Indígena

### `estadoCivil` | 7 valores

- C - Casado(a)
- D - Divorciado(a)
- Q - Desquitado(a)
- S - Solteiro(a)
- V - Viúvo(a)
- U - União Estável
- O - Outros

### `grauInstrucao` | 13 valores

- 1 - Analfabeto
- 2 - Até 5º Ano Incompleto
- 3 - 5º Ano Completo
- 4 - 6º ao 9º Ano Incompleto
- 5 - Fundamental Completo
- 6 - Ensino Médio Incompleto
- 7 - Ensino Médio Completo
- 8 - Superior Incompleto
- 9 - Superior Completo
- A - Pós-Graduação Completa
- B - Mestrado Completo
- C - Doutorado Completo
- D - Pós-Doutorado Completo

### `nacionalidade` | 254 valores

- 010 - Brasileiro
- 013 - Afeganistao
- 017 - Albania, Republica Da
- 020 - Naturalizado
- 021 - Argentino
- 022 - Boliviano
- 023 - Chileno
- 024 - Paraguaio
- 025 - Uruguaio
- 026 - Venezuelano
- 027 - Colombiano
- 028 - Peruano
- 029 - Equatoriano
- 030 - Alemão
- 031 - Belga
- 032 - Britanico
- 034 - Canadense
- 035 - Espanhol
- 036 - EUA
- 037 - Francês
- 038 - Suíço
- 039 - Italiano
- 040 - Haitiano
- 041 - Japonês
- 042 - Chinês
- 043 - Coreano
- 044 - Russo
- 045 - Português
- 046 - Paquistanês
- 047 - Indiano
- 048 - Outros Latinos
- 049 - Outros Asiáticos
- 050 - Outros
- 051 - Outros Europeus
- 053 - Arabia Saudita
- 059 - Argelia
- 060 - Angolano
- 061 - Congolês
- 062 - Sul - Africano
- 064 - Armenia, Republica Da
- 065 - Aruba
- 069 - Australia
- 070 - Outros Africanos
- 072 - Austria
- 073 - Azerbaijao, Republica Do
- 076 - Burkina Faso
- 077 - Bahamas, Ilhas
- 078 - Belarus, Republica Da
- 079 - Belize
- 080 - República Tcheca
- 081 - Palestina
- 082 - Guiné - Bissau
- 083 - Cubano
- 084 - Marrocos
- 085 - Gana
- 086 - México
- 087 - Senegal
- 088 - Filipinas
- 089 - Zambia
- 090 - Bermudas
- 091 - Andorra
- 092 - Anguilla
- 093 - Mianmar(BIRMANIA)
- 094 - Antigua E Barbuda
- 095 - Antilhas Holandesas
- 096 - Bahrein, Ilhas
- 097 - Bangladesh
- 098 - Bosnia-Herzegovina(REPUBLICA Da)
- 099 - Barbados
- 101 - Botsuana
- 108 - Brunei
- 111 - Bulgaria, Republica Da
- 115 - Burundi
- 119 - Butao
- 127 - Cabo Verde, Republica De
- 137 - Cayan, Ilhas
- 141 - Camboja
- 145 - Camaroes
- 150 - Jersey, Ilha Do Canal
- 151 - Canarias, Ilhas
- 153 - Cazaquistao, Republica Do
- 154 - Catar
- 161 - Formosa(TAIWAN)
- 163 - Chipre
- 165 - Cocos(Keeling),Ilhas
- 173 - Comores, Ilhas
- 183 - Cook, Ilhas
- 187 - Coreia(DO Norte), Rep.Pop.Democratica
- 193 - Costa Do Marfim
- 195 - Croacia(REPUBLICA Da)
- 196 - Costa Rica
- 198 - Coveite
- 229 - Benin
- 232 - Dinamarca
- 235 - Dominica,Ilha
- 240 - Egito
- 243 - Eritreia
- 244 - Emirados Arabes Unidos
- 246 - Eslovenia, Republica Da
- 247 - Eslovaca, Republica
- 251 - Estonia, Republica Da
- 253 - Etiopia
- 255 - Falkland(ILHAS Malvinas)
- 259 - Feroe, Ilhas
- 271 - Finlandia
- 281 - Gabao
- 285 - Gambia
- 291 - Georgia, Republica Da
- 293 - Gibraltar
- 297 - Granada
- 301 - Grecia
- 305 - Groenlandia
- 309 - Guadalupe
- 313 - Guam
- 317 - Guatemala
- 325 - Guiana Francesa
- 329 - Guine
- 331 - Guine-Equatorial
- 337 - Guiana
- 345 - Honduras
- 351 - Hong Kong
- 355 - Hungria, Republica Da
- 357 - Iemen
- 359 - Man, Ilha De
- 365 - Indonesia
- 369 - Iraque
- 372 - Ira, Republica Islamica Do
- 375 - Irlanda
- 379 - Islandia
- 383 - Israel
- 388 - Servia E Montenegro
- 391 - Jamaica
- 396 - Johston, Ilhas
- 403 - Jordania
- 411 - Kiribati
- 420 - Laos, Rep.Pop.Democr.Do
- 423 - Lebuan,Ilhas
- 426 - Lesoto
- 427 - Letonia, Republica Da
- 431 - Libano
- 434 - Liberia
- 438 - Libia
- 440 - Liechtenstein
- 442 - Lituania, Republica Da
- 445 - Luxemburgo
- 447 - Macau
- 449 - Macedonia, Ant.Rep.Iugoslava
- 450 - Madagascar
- 452 - Ilha Da Madeira
- 455 - Malasia
- 458 - Malavi
- 461 - Maldivas
- 464 - Mali
- 467 - Malta
- 472 - Marianas Do Norte
- 476 - Marshall,Ilhas
- 477 - Martinica
- 485 - Mauricio
- 488 - Mauritania
- 490 - Midway, Ilhas
- 494 - Moldavia, Republica Da
- 495 - Monaco
- 497 - Mongolia
- 499 - Micronesia
- 501 - Montserrat,Ilhas
- 505 - Mocambique
- 507 - Namibia
- 508 - Nauru
- 511 - Christmas,Ilha(NAVIDAD)
- 517 - Nepal
- 521 - Nicaragua
- 525 - Niger
- 528 - Nigeria
- 531 - Niue,Ilha
- 535 - Norfolk,Ilha
- 538 - Noruega
- 542 - Nova Caledonia
- 545 - Papua Nova Guine
- 548 - Nova Zelandia
- 551 - Vanuatu
- 556 - Oma
- 566 - Pacifico,Ilhas Do(POSSESSAO Dos Eua)
- 573 - Paises Baixos(HOLANDA)
- 575 - Palau
- 580 - Panama
- 593 - Pitcairn,Ilha
- 599 - Polinesia Francesa
- 603 - Polonia, Republica Da
- 611 - Porto Rico
- 623 - Quenia
- 625 - Quirguiz, Republica
- 628 - Reino Unido
- 640 - Republica Centro-Africana
- 647 - Republica Dominicana
- 660 - Reuniao, Ilha
- 665 - Zimbabue
- 670 - Romenia
- 675 - Ruanda
- 677 - Salomao, Ilhas
- 678 - Saint Kitts E Nevis
- 685 - Saara Ocidental
- 687 - El Salvador
- 690 - Samoa
- 691 - Samoa Americana
- 695 - Sao Cristovao E Neves, Ilhas
- 697 - San Marino
- 700 - Sao Pedro E Miquelon
- 705 - Sao Vicente E Granadinas
- 710 - Santa Helena
- 715 - Santa Lucia
- 720 - Sao Tome E Principe, Ilhas
- 731 - Seychelles
- 735 - Serra Leoa
- 738 - Sikkim
- 741 - Cingapura
- 744 - Siria, Republica Arabe Da
- 748 - Somalia
- 750 - Sri Lanka
- 754 - Suazilandia
- 756 - Africa Do Sul
- 759 - Sudao
- 764 - Suecia
- 770 - Suriname
- 772 - Tadjiquistao, Republica Do
- 776 - Tailandia
- 780 - Tanzania, Rep.Unida Da
- 782 - Territorio Brit.Oc.Indico
- 783 - Djibuti
- 785 - Territorio da Alta Comissao do Pacifico Ocidental
- 788 - Chade
- 790 - Tchecoslovaquia
- 795 - Timor Leste
- 800 - Togo
- 805 - Toquelau, Ilhas
- 810 - Tonga
- 815 - Trinidad E Tobago
- 820 - Tunisia
- 823 - Turcas E Caicos, Ilhas
- 824 - Turcomenistao, Republica Do
- 827 - Turquia
- 828 - Tuvalu
- 831 - Ucrania
- 833 - Uganda
- 840 - Uniao Das Republicas Socialistas Sovieticas
- 847 - Uzbequistao, Republica Do
- 848 - Vaticano, Est.Da Cidade Do
- 855 - Vietname Norte
- 858 - Vietna
- 863 - Virgens, Ilhas (BRITANICAS)
- 866 - Virgens, Ilhas (E.U.A.)
- 870 - Fiji
- 873 - Wake, Ilha
- 875 - Wallis E Futuna, Ilhas
- 888 - Congo, Republica Democratica Do

### `naturalidade` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `classTrabEstrang` | 13 valores

- 00 - Não Informado
- 01 - Visto permanente
- 02 - Visto temporário
- 03 - Asilado
- 04 - Refugiado
- 05 - Solicitante de Refúgio
- 06 - Residente fora do Brasil
- 07 - Deficiente físico e com mais de 51 anos
- 08 - Com residência provisória e anistiado, em situação irregular
- 09 - Permanência no Brasil em razão de filhos ou cônjuge brasileiros
- 10 - Beneficiado pelo acordo entre países do Mercosul
- 11 - Dependente de agente diplomático e/ou consular de países que mantém convênio de reciprocidade para o exercício de atividade remunerada no Brasil
- 12 - Beneficiado pelo Tratado de Amizade, Cooperação e Consulta entre a República Federativa do Brasil e a República Portuguesa

### `exterior_paisResidencia` | 263 valores

- 0000 - Brasil
- 0008 - Abu Dhabi
- 0009 - Dirce
- 0013 - Afeganistao
- 0017 - Albania, Republica Da
- 0020 - Alboran-Perejil,Ilhas
- 0023 - Alemanha
- 0025 - Alemanha, Republica Democratica
- 0031 - Burkina Faso
- 0037 - Andorra
- 0040 - Angola
- 0041 - Anguilla
- 0043 - Antigua E Barbuda
- 0047 - Antilhas Holandesas
- 0053 - Arabia Saudita
- 0059 - Argelia
- 0063 - Argentina
- 0064 - Armenia, Republica Da
- 0065 - Aruba
- 0069 - Australia
- 0072 - Austria
- 0073 - Azerbaijao, Republica Do
- 0077 - Bahamas, Ilhas
- 0080 - Bahrein, Ilhas
- 0081 - Bangladesh
- 0083 - Barbados
- 0085 - Belarus, Republica Da
- 0087 - Belgica
- 0088 - Belize
- 0090 - Bermudas
- 0093 - Mianmar(BIRMANIA)
- 0097 - Bolivia, Estado Plurinacional Da
- 0098 - Bosnia-Herzegovina(REPUBLICA Da)
- 0100 - Int.Z.F.Manaus
- 0101 - Botsuana
- 0105 - Brasil
- 0106 - Fretado P/Brasil
- 0108 - Brunei
- 0111 - Bulgaria, Republica Da
- 0115 - Burundi
- 0119 - Butao
- 0127 - Cabo Verde, Republica De
- 0131 - Cachemira
- 0137 - Cayman, Ilhas
- 0141 - Camboja
- 0145 - Camaroes
- 0149 - Canada
- 0150 - Jersey, Ilha Do Canal
- 0151 - Canarias, Ilhas
- 0152 - Canal,Ilhas
- 0153 - Cazaquistao, Republica Do
- 0154 - Catar
- 0158 - Chile
- 0160 - China, Republica Popular
- 0161 - Formosa(TAIWAN)
- 0163 - Chipre
- 0165 - Cocos(Keeling),Ilhas
- 0169 - Colombia
- 0173 - Comores, Ilhas
- 0177 - Congo
- 0183 - Cook, Ilhas
- 0187 - Coreia(DO Norte), Rep.Pop.Democratica
- 0190 - Coreia(DO Sul), Republica Da
- 0193 - Costa Do Marfim
- 0195 - Croacia(REPUBLICA Da)
- 0196 - Costa Rica
- 0198 - Coveite
- 0199 - Cuba
- 0229 - Benin
- 0232 - Dinamarca
- 0235 - Dominica,Ilha
- 0237 - Dubai
- 0239 - Equador
- 0240 - Egito
- 0243 - Eritreia
- 0244 - Emirados Arabes Unidos
- 0245 - Espanha
- 0246 - Eslovenia, Republica Da
- 0247 - Eslovaca, Republica
- 0249 - Estados Unidos
- 0251 - Estonia, Republica Da
- 0253 - Etiopia
- 0255 - Falkland(ILHAS Malvinas)
- 0259 - Feroe, Ilhas
- 0263 - Fezzan
- 0267 - Filipinas
- 0271 - Finlandia
- 0275 - Franca
- 0281 - Gabao
- 0285 - Gambia
- 0289 - Gana
- 0291 - Georgia, Republica Da
- 0293 - Gibraltar
- 0297 - Granada
- 0301 - Grecia
- 0305 - Groenlandia
- 0309 - Guadalupe
- 0313 - Guam
- 0317 - Guatemala
- 0325 - Guiana Francesa
- 0329 - Guine
- 0331 - Guine-Equatorial
- 0334 - Guine-Bissau
- 0337 - Guiana
- 0341 - Haiti
- 0345 - Honduras
- 0351 - Hong Kong
- 0355 - Hungria, Republica Da
- 0357 - Iemen
- 0358 - Iemem Do Sul
- 0359 - Man, Ilha De
- 0361 - India
- 0365 - Indonesia
- 0367 - Inglaterra
- 0369 - Iraque
- 0372 - Ira, Republica Islamica Do
- 0375 - Irlanda
- 0379 - Islandia
- 0383 - Israel
- 0386 - Italia
- 0388 - Servia E Montenegro
- 0391 - Jamaica
- 0395 - Jammu
- 0396 - Johnston, Ilhas
- 0399 - Japao
- 0403 - Jordania
- 0411 - Kiribati
- 0420 - Laos, Rep.Pop.Democr.Do
- 0423 - Lebuan,Ilhas
- 0426 - Lesoto
- 0427 - Letonia, Republica Da
- 0431 - Libano
- 0434 - Liberia
- 0438 - Libia
- 0440 - Liechtenstein
- 0442 - Lituania, Republica Da
- 0445 - Luxemburgo
- 0447 - Macau
- 0449 - Macedonia, Ant.Rep.Iugoslava
- 0450 - Madagascar
- 0452 - Ilha Da Madeira
- 0455 - Malasia
- 0458 - Malavi
- 0461 - Maldivas
- 0464 - Mali
- 0467 - Malta
- 0472 - Marianas Do Norte
- 0474 - Marrocos
- 0476 - Marshall,Ilhas
- 0477 - Martinica
- 0485 - Mauricio
- 0488 - Mauritania
- 0490 - Midway, Ilhas
- 0493 - Mexico
- 0494 - Moldavia, Republica Da
- 0495 - Monaco
- 0497 - Mongolia
- 0499 - Micronesia
- 0501 - Montserrat,Ilhas
- 0505 - Mocambique
- 0507 - Namibia
- 0508 - Nauru
- 0511 - Christmas,Ilha(NAVIDAD)
- 0517 - Nepal
- 0521 - Nicaragua
- 0525 - Niger
- 0528 - Nigeria
- 0531 - Niue,Ilha
- 0535 - Norfolk,Ilha
- 0538 - Noruega
- 0542 - Nova Caledonia
- 0545 - Papua Nova Guine
- 0548 - Nova Zelandia
- 0551 - Vanuatu
- 0556 - Oma
- 0563 - Pacifico,Ilhas Do(ADMINISTRACAO Dos Eua)
- 0566 - Pacifico,Ilhas Do(POSSESSAO Dos Eua)
- 0569 - Pacifico,Ilhas Do(TERRITORIO Em Fideicomisso Dos
- 0573 - Paises Baixos (HOLANDA)
- 0575 - Palau
- 0576 - Paquistao
- 0578 - Palestina
- 0580 - Panama
- 0583 - Papua Nova Guiné
- 0586 - Paraguai
- 0589 - Peru
- 0593 - Pitcairn, Ilha
- 0599 - Polinesia Francesa
- 0603 - Polonia, Republica Da
- 0607 - Portugal
- 0611 - Porto Rico
- 0623 - Quenia
- 0625 - Quirguiz, Republica
- 0628 - Reino Unido
- 0640 - Republica Centro-Africana
- 0647 - Republica Dominicana
- 0660 - Reuniao, Ilha
- 0665 - Zimbabue
- 0670 - Romenia
- 0675 - Ruanda
- 0676 - Russia, Federacao Da
- 0677 - Salomao, Ilhas
- 0678 - Saint Kitts E Nevis
- 0685 - Saara Ocidental
- 0687 - El Salvador
- 0690 - Samoa
- 0691 - Samoa Americana
- 0695 - Sao Cristovao E Neves, Ilhas
- 0697 - San Marino
- 0700 - Sao Pedro E Miquelon
- 0705 - Sao Vicente E Granadinas
- 0710 - Santa Helena
- 0715 - Santa Lucia
- 0720 - Sao Tome E Principe, Ilhas
- 0728 - Senegal
- 0731 - Seychelles
- 0735 - Serra Leoa
- 0738 - Sikkim
- 0741 - Cingapura
- 0744 - Siria, Republica Arabe Da
- 0748 - Somalia
- 0750 - Sri Lanka
- 0754 - Suazilandia
- 0756 - Africa Do Sul
- 0759 - Sudao
- 0764 - Suecia
- 0767 - Suica
- 0770 - Suriname
- 0772 - Tadjiquistao, Republica Do
- 0776 - Tailandia
- 0780 - Tanzania, Rep.Unida Da
- 0782 - Territorio Brit.Oc.Indico
- 0783 - Djibuti
- 0785 - Territorio da Alta Comissao do Pacifico Ocidental
- 0788 - Chade
- 0790 - Tchecoslovaquia
- 0791 - Tcheca, Republica
- 0795 - Timor Leste
- 0800 - Togo
- 0805 - Toquelau, Ilhas
- 0810 - Tonga
- 0815 - Trinidad E Tobago
- 0820 - Tunisia
- 0823 - Turcas E Caicos, Ilhas
- 0824 - Turcomenistao, Republica Do
- 0827 - Turquia
- 0828 - Tuvalu
- 0831 - Ucrania
- 0833 - Uganda
- 0840 - Uniao Das Republicas Socialistas Sovieticas
- 0845 - Uruguai
- 0847 - Uzbequistao, Republica Do
- 0848 - Vaticano, Est.Da Cidade Do
- 0850 - Venezuela
- 0855 - Vietname Norte
- 0858 - Vietna
- 0863 - Virgens, Ilhas (BRITANICAS)
- 0866 - Virgens, Ilhas (E.U.A.)
- 0870 - Fiji
- 0873 - Wake, Ilha
- 0875 - Wallis E Futuna, Ilhas
- 0888 - Congo, Republica Democratica Do
- 0890 - Zambia

### `ufrg` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `ufExpedicao` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `ufCnh` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `ufcrmExameTox` | 27 valores

- AC
- AL
- AM
- AP
- BA
- CE
- DF
- ES
- GO
- MA
- MG
- MS
- MT
- PA
- PB
- PE
- PI
- PR
- RJ
- RN
- RO
- RR
- RS
- SC
- SE
- SP
- TO

### `tipoAdmSIRETT` | 5 valores

- 0 - Não Informado
- 1 - Locais sem filiais
- 2 - Estudo de mercado
- 3 - Contratação superior a 3 meses
- 4 - Prorrogação de contrato

### `tipo13o` | 8 valores

- 0 - Em todos os cálculos s/ rendimentos
- 1 - Em todos os cálculos s/ rendimentos após o 15º dia(1º pgto.)
- 2 - Todo mês s/ rendimentos
- 3 - No final do contrato s/ rendimentos
- 4 - Em todos os cálculos s/ salário
- 5 - Em todos os cálculos s/ salário após o 15º dia(1º pgto.)
- 6 - Todo mês sobre salário
- 7 - No final do contrato s/ salário

### `tipoFer` | 8 valores

- 0 - Em todos os cálculos s/ rendimentos
- 1 - Em todos os cálculos s/ rendimentos após o 15º dia(1º pgto.)
- 2 - Todo mês s/ rendimentos
- 3 - No final do contrato s/ rendimentos
- 4 - Em todos os cálculos s/ salário
- 5 - Em todos os cálculos s/ salário após o 15º dia(1º pgto.)
- 6 - Todo mês sobre salário
- 7 - No final do contrato s/ salário

### `motivoContrato` | 2 valores

- 1 - Demanda Complementar de Serviços.
- 2 - Substituição Transitória de Pessoal Permanente.

### `ocorrenciaFGTS` | 8 valores

- 1 -  (apenas 1 vínculo empregatício) Não Exposição a Agente Nocivo
- 2 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 15 anos de Serviço)
- 3 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 20 anos de Serviço)
- 4 -  (apenas 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 25 anos de Serviço)
- 5 -  (mais de 1 vínculo empregatício) Não Exposição a Agente Nocivo
- 6 -  (mais de 1 vínculo empregatício)  Exposição a Agente Nocivo(Aposentadoria com 15 anos de Serviço)
- 7 -  (mais de 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 20 anos de Serviço)
- 8 -  (mais de 1 vínculo empregatício) Exposição a Agente Nocivo(Aposentadoria com 25 anos de Serviço)

### `indMV` | 4 valores

- 0 - Não Informado
- 1 - Contribuição descontada pelo primeiro empregador(Soma Bases para Calcular Percentual sem abater o desconto anterior)
- 2 - Contribuição descontada por outra(s) empresa(s) sobre valor inferior ao limite máximo do salário de contribuição(Soma Bases para Calculo e Desconto)
- 3 - Contribuição sobre o limite máximo de salário de contribuição já descontada em outra(s) empresa(s)  (Sem Desconto Ginfor )

### `tipoFatu` | 2 valores

- Indicação
- Seleção

### `tipoVT` | 3 valores

- A - Ambos
- D - Dinheiro
- E - Espécie

### `tipoVR` | 2 valores

- D - Dinheiro
- E - Espécie

### `escalaTipo` | 4 valores

- Normal
- Sábado
- Domingo
- Sexta - Feira

