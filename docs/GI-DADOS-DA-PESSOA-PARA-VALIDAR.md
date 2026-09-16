# GI: os dados DA PESSOA da pré-admissão, para o diretor validar

**Escopo fechado pelo diretor:** a integração manda **só os DADOS da pessoa**. Fora do escopo:
documento-arquivo (vai para o prontuário no Drive), eSocial, contrato e salário (o time preenche),
e cargo, horário, centro de custo e CBO (a Parte 4 já provou que a pré-admissão aceita vazios).

**Fonte:** a leitura ao vivo de 16/09/2026 sobre `FuncionarioSelecao` (415 campos no contrato, 119
preenchidos no único registro real), mais o parecer de 20/08. **Nenhuma reconexão foi feita: a
credencial já foi expurgada.**

---

# MAPEAMENTO FECHADO PELO DIRETOR (16/09/2026)

**Este é o retrato final da integração GI, e é a base de quando for construir.** A lista de campos
abaixo continua valendo como o inventário; esta seção diz o que vai para onde e quem preenche o quê.

## O desenho, em uma frase

O **Portal do Candidato** (interface nova, a construir) coleta os dados pela trilha do próprio
candidato, com a IA lendo os documentos para facilitar o preenchimento; o **EA** manda os **dados da
pessoa** para o **GI** por `FuncionarioSelecao` (pré-admissão); e os **documentos-arquivo** seguem
para o **prontuário no Drive**, como já é hoje.

## 1. O que entra no GI, e por onde

A integração escreve em **`FuncionarioSelecao`**, a pré-admissão, **nunca** em `Funcionario`, que é o
cadastro oficial da folha e está fechado para a nossa credencial (403). Vão **só dados e números**.

## 2. De onde vêm os dados: o PORTAL DO CANDIDATO

O candidato acessa um link e percorre uma **trilha** de entrega de documentos e preenchimento de
dados. **A IA lê os documentos para facilitar o preenchimento**, que é o mesmo caminho que o Pandapé
faz hoje, só que dentro da nossa plataforma.

O Portal é a **fonte** de tudo o que o EA não tem hoje:

| O que o Portal passa a coletar | Onde está nesta lista |
|---|---|
| Os **14 números de documento** (RG, CTPS, título, reservista, CNH, PIS) | Grupo 3 |
| Os **6 dados civis** (raça, grau de instrução, estado civil, deficiência, estrangeiro) | Grupo 2 |
| A **filiação** (nome do pai e da mãe) | Grupo 1 |
| O **endereço completo** | Grupo 5 |
| Os **2 de/para** (código da cidade, código do banco) | Grupos 5 e 6 |

**O Portal RESOLVE a ressalva do endereço, e isso é decisão registrada.** O endereço deixa de depender
do formulário de **VT**, que é opcional (§A.17), e passa a vir da **trilha do Portal**. A ressalva de
que "candidato sem VT não tem endereço no EA" **deixa de valer** quando o Portal existir. Até lá, ela
continua de pé.

## 3. O que NÃO vai para o GI

**Documento-arquivo não vai.** O binário segue para o **prontuário no Drive**, exatamente como hoje.
Para o GI vão **os dados e os números** extraídos dele, nunca o arquivo.

## 4. O que o TIME preenche na tela do GI

Fica fora da integração, por decisão do diretor:

- **Configuração de folha**, **eSocial**, **contrato** e **salário**.
- **Cargo, horário e centro de custo**, que vão **vazios**. A leitura ao vivo provou que a
  pré-admissão aceita: num registro real que o GI recebeu, `codigoFuncao`, `codigoHorario`,
  `codigoCentroCusto`, `codigoDepto`, `codigoSindicato` e `codigoFilial` estavam todos vazios. É o que
  tira do caminho crítico o de/para pesado (5.454 cargos, 4.074 horários, 12.590 centros de custo).
- **A situação trabalhista**: `primeiroEmprego`, `flagRecontratacao`, `flagAposentado`, `recebendoSD`
  e `infoCota`. Era a zona cinzenta do Grupo 7, e o diretor **fechou: é o time quem preenche**.

## 5. Os dicionários de código

**O diretor TEM os dicionários** de grau de instrução, raça, estado civil e tipo de contrato. Isso
fecha a lacuna que a leitura de hoje deixou aberta: a API do GI **não expõe** os catálogos de domínio,
então o significado dos códigos só viria de fora, e vem dele.

**ENTREGUES PELO DIRETOR em 16/09/2026.** As quatro tabelas abaixo são o que ele passou, transcritas
**exatamente**, sem completar nada. Elas resolvem o que a API do GI não expõe.

### `grauInstrucao`

| Código | Significado |
|---|---|
| `1` | Analfabeto |
| `2` | Ate 5o Ano Incompleto |
| `3` | 5o Ano Completo |
| `4` | 6o ao 9o Ano Incompleto |
| `5` | Fundamental Completo |
| `6` | Ensino Medio Incompleto |
| `7` | Ensino Medio Completo |
| `8` | Superior Incompleto |
| `9` | Superior Completo |
| `A` | Pos-Graduacao Completa |
| `B` | Mestrado Completo |
| `C` | Doutorado Completo |
| `D` | Pos-Doutorado Completo |

**São 13 valores, não 11, e isso CORRIGE a inferência anterior deste documento.** A estimativa de 11
(`1` a `9`, `A`, `B`) vinha do campo de grau de instrução mínimo do catálogo de cargos, que mostra os
valores **em uso** naquele catálogo, não o domínio completo. `C` e `D` existem e não apareciam ali.
Vale como lembrete de método: domínio derivado de dado em uso é piso, nunca o total.

### `raca`

| Código | Significado |
|---|---|
| `1` | Branca |
| `2` | Preta |
| `3` | Amarela |
| `4` | Parda |
| `5` | Indigena |
| `6` | Nao Informado |

### `estadoCivil`

| Código | Significado |
|---|---|
| `C` | Casado(a) |
| `D` | Divorciado(a) |
| `Q` | Desquitado(a) |
| `S` | Solteiro(a) |
| `V` | Viuvo(a) |
| `U` | Uniao Estavel |
| `O` | Outros |

**Os códigos NÃO são a inicial da palavra, e é uma armadilha real:** `D` é Divorciado e `Q` é
Desquitado, `V` é Viuvo e `U` é Uniao Estavel. Quem implementar de memória acerta uns e erra outros.

### `tipoContrato`

| Código | Significado |
|---|---|
| `D` | Determinado |
| `I` | Indeterminado |
| `V` | Determinado Vinculado a um Fato |

Este é preenchido pelo **time** na tela do GI, não pela integração. Fica registrado porque é o
dicionário do campo que a leitura ao vivo viu em uso.

### `tipoLogradouro`, o prefixo da via

**178 valores**, entregues pelo diretor, extraidos do sistema. Lista por extenso,
sem codigo numerico: o valor E o texto.

| | | |
|---|---|---|
| Nao Informado | Area | Acesso |
| Acampamento | Acesso Local | Adro |
| Area Especial | Aeroporto | Alameda |
| Avenida Marginal Direita | Avenida Marginal Esquerda | Anel Viario |
| Antiga Estrada | Arteria | Alto |
| Atalho | Area Verde | Avenida |
| Avenida Contorno | Avenida Marginal | Avenida Velha |
| Balneario | Beco | Buraco |
| Belvedere | Bloco | Balao |
| Blocos | Bulevar | Bosque |
| Boulevard | Baixa | Cais |
| Calcada | Caminho | Canal |
| Chacara | Chapadao | Ciclovia |
| Circular | Conjunto | Conjunto Mutirao |
| Complexo Viario | Colonia | Comunidade |
| Condominio | Corredor | Campo |
| Corrego | Contorno | Descida |
| Desvio | Distrito | Entre Bloco |
| Estrada Intermunicipal | Enseada | Entrada Particular |
| Entre Quadra | Escada | Escadaria |
| Estrada Estadual | Estrada Vicinal | Estrada de Ligacao |
| Estrada Municipal | Esplanada | Estrada de Servidao |
| Estrada | Estrada Velha | Estrada Antiga |
| Estacao | Estadio | Estancia |
| Estrada Particular | Estacionamento | Evangelica |
| Elevada | Eixo Industrial | Favela |
| Fazenda | Ferrovia | Fonte |
| Feira | Forte | Galeria |
| Granja | Nucleo Habitacional | Ilha |
| Indeterminado | Ilhota | Jardim |
| Jardinete | Ladeira | Lagoa |
| Lago | Loteamento | Largo |
| Lote | Mercado | Marina |
| Modulo | Projecao | Morro |
| Monte | Nucleo | Nucleo Rural |
| Outeiro | Paralela | Passeio |
| Patio | Praca | Praca de Esportes |
| Parada | Paradouro | Ponta |
| Praia | Prolongamento | Parque Municipal |
| Parque | Parque Residencial | Passarela |
| Passagem | Passagem de Pedestre | Passagem Subterranea |
| Ponte | Porto | Quadra |
| Quinta | Quintas | Rua |
| Rua Integracao | Rua de Ligacao | Rua Particular |
| Rua Velha | Ramal | Recreio |
| Recanto | Retiro | Residencial |
| Reta | Ruela | Rampa |
| Rodo Anel | Rodovia | Rotula |
| Rua de Pedestre | Margem | Retorno |
| Rotatoria | Segunda Avenida | Sitio |
| Servidao | Setor | Subida |
| Trincheira | Terminal | Trecho |
| Trevo | Tunel | Travessa |
| Travessa Particular | Travessa Velha | Unidade |
| Via | Via Coletora | Via Local |
| Via de Acesso | Vala | Via Costeira |
| Viaduto | Via Expressa | Vereda |
| Via Elevado | Vila | Viela |
| Vale | Via Litoranea | Via de Pedestre |
| Variante |  |  |

### `nacionalidade`

**258 valores.** Codigo numerico de tres posicoes, com zero a esquerda,
exatamente como a leitura ao vivo tinha previsto pelo formato.

| Codigo | Significado |
|---|---|
| `010` | Brasileiro |
| `013` | Afeganistao |
| `017` | Albania Republica Da |
| `020` | Naturalizado |
| `021` | Argentino |
| `022` | Boliviano |
| `023` | Chileno |
| `024` | Paraguaio |
| `025` | Uruguaio |
| `026` | Venezuelano |
| `027` | Colombiano |
| `028` | Peruano |
| `029` | Equatoriano |
| `030` | Alemao |
| `031` | Belga |
| `032` | Britanico |
| `034` | Canadense |
| `035` | Espanhol |
| `036` | EUA |
| `037` | Frances |
| `038` | Suico |
| `039` | Italiano |
| `040` | Haitiano |
| `041` | Japones |
| `042` | Chines |
| `043` | Coreano |
| `044` | Russo |
| `045` | Portugues |
| `046` | Paquistanes |
| `047` | Indiano |
| `048` | Outros Latinos |
| `049` | Outros Asiaticos |
| `050` | Outros |
| `051` | Outros Europeus |
| `053` | Arabia Saudita |
| `059` | Argelia |
| `060` | Angolano |
| `061` | Congoles |
| `062` | Sul-Africano |
| `064` | Armenia Republica Da |
| `065` | Aruba |
| `069` | Australia |
| `070` | Outros Africanos |
| `072` | Austria |
| `073` | Azerbaijao Republica Do |
| `076` | Burkina Faso |
| `077` | Bahamas Ilhas |
| `078` | Belarus Republica Da |
| `079` | Belize |
| `080` | Republica Tcheca |
| `081` | Palestina |
| `082` | Guine-Bissau |
| `083` | Cubano |
| `084` | Marrocos |
| `085` | Gana |
| `086` | Mexico |
| `087` | Senegal |
| `088` | Filipinas |
| `089` | Zambia |
| `090` | Bermudas |
| `091` | Andorra |
| `092` | Anguilla |
| `093` | Mianmar (Birmania) |
| `094` | Antigua E Barbuda |
| `095` | Antilhas Holandesas |
| `096` | Bahrein Ilhas |
| `097` | Bangladesh |
| `098` | Bosnia-Herzegovina Republica Da |
| `099` | Barbados |
| `101` | Botsuana |
| `108` | Brunei |
| `111` | Bulgaria Republica Da |
| `115` | Burundi |
| `119` | Butao |
| `127` | Cabo Verde Republica De |
| `137` | Cayan Ilhas |
| `141` | Camboja |
| `145` | Camaroes |
| `150` | Jersey Ilha Do Canal |
| `151` | Canarias Ilhas |
| `153` | Cazaquistao Republica Do |
| `154` | Catar |
| `161` | Formosa (Taiwan) |
| `163` | Chipre |
| `165` | Cocos (Keeling) Ilhas |
| `173` | Comores Ilhas |
| `183` | Cook Ilhas |
| `187` | Coreia Do Norte Rep.Pop.Democratica |
| `193` | Costa Do Marfim |
| `195` | Croacia Republica Da |
| `196` | Costa Rica |
| `198` | Coveite |
| `199` | Cuba |
| `229` | Benin |
| `232` | Dinamarca |
| `235` | Dominica Ilha |
| `240` | Egito |
| `243` | Eritreia |
| `244` | Emirados Arabes Unidos |
| `246` | Eslovenia Republica Da |
| `247` | Eslovaca Republica |
| `251` | Estonia Republica Da |
| `253` | Etiopia |
| `255` | Falkland (Ilhas Malvinas) |
| `259` | Feroe Ilhas |
| `271` | Finlandia |
| `281` | Gabao |
| `285` | Gambia |
| `291` | Georgia Republica Da |
| `293` | Gibraltar |
| `297` | Granada |
| `301` | Grecia |
| `305` | Groenlandia |
| `309` | Guadalupe |
| `313` | Guam |
| `317` | Guatemala |
| `325` | Guiana Francesa |
| `329` | Guine |
| `331` | Guine-Equatorial |
| `337` | Guiana |
| `345` | Honduras |
| `351` | Hong Kong |
| `355` | Hungria Republica Da |
| `357` | Iemen |
| `359` | Man Ilha De |
| `365` | Indonesia |
| `369` | Iraque |
| `372` | Ira Republica Islamica Do |
| `375` | Irlanda |
| `379` | Islandia |
| `383` | Israel |
| `388` | Servia E Montenegro |
| `391` | Jamaica |
| `396` | Johston Ilhas |
| `403` | Jordania |
| `411` | Kiribati |
| `420` | Laos Rep.Pop.Democr.Do |
| `423` | Lebuan Ilhas |
| `426` | Lesoto |
| `427` | Letonia Republica Da |
| `431` | Libano |
| `434` | Liberia |
| `438` | Libia |
| `440` | Liechtenstein |
| `442` | Lituania Republica Da |
| `445` | Luxemburgo |
| `447` | Macau |
| `449` | Macedonia Ant.Rep.Iugoslava |
| `450` | Madagascar |
| `452` | Ilha Da Madeira |
| `455` | Malasia |
| `458` | Malavi |
| `461` | Maldivas |
| `464` | Mali |
| `467` | Malta |
| `472` | Marianas Do Norte |
| `476` | Marshall Ilhas |
| `477` | Martinica |
| `485` | Mauricio |
| `488` | Mauritania |
| `490` | Midway Ilhas |
| `494` | Moldavia Republica Da |
| `495` | Monaco |
| `497` | Mongolia |
| `498` | Montenegro |
| `499` | Micronesia |
| `501` | Montserrat Ilhas |
| `505` | Mocambique |
| `507` | Namibia |
| `508` | Nauru |
| `511` | Christmas Ilha (Navidad) |
| `517` | Nepal |
| `521` | Nicaragua |
| `525` | Niger |
| `528` | Nigeria |
| `531` | Niue Ilha |
| `535` | Norfolk Ilha |
| `538` | Noruega |
| `542` | Nova Caledonia |
| `545` | Papua Nova Guine |
| `548` | Nova Zelandia |
| `551` | Vanuatu |
| `556` | Oma |
| `566` | Pacifico Ilhas Do |
| `573` | Paises Baixos (Holanda) |
| `575` | Palau |
| `580` | Panama |
| `593` | Pitcairn Ilha |
| `599` | Polinesia Francesa |
| `603` | Polonia Republica Da |
| `611` | Porto Rico |
| `623` | Quenia |
| `625` | Quirguiz Republica |
| `628` | Reino Unido |
| `640` | Republica Centro-Africana |
| `647` | Republica Dominicana |
| `660` | Reuniao Ilha |
| `665` | Zimbabue |
| `670` | Romenia |
| `675` | Ruanda |
| `677` | Salomao Ilhas |
| `678` | Saint Kitts E Nevis |
| `685` | Saara Ocidental |
| `687` | El Salvador |
| `690` | Samoa |
| `691` | Samoa Americana |
| `695` | Sao Cristovao E Neves Ilhas |
| `697` | San Marino |
| `700` | Sao Pedro E Miquelon |
| `705` | Sao Vicente E Granadinas |
| `710` | Santa Helena |
| `715` | Santa Lucia |
| `720` | Sao Tome E Principe Ilhas |
| `731` | Seychelles |
| `735` | Serra Leoa |
| `737` | Servia |
| `738` | Sikkim |
| `741` | Cingapura |
| `744` | Siria Republica Arabe Da |
| `748` | Somalia |
| `750` | Sri Lanka |
| `754` | Suazilandia |
| `756` | Africa Do Sul |
| `759` | Sudao |
| `764` | Suecia |
| `770` | Suriname |
| `772` | Tadjiquistao Republica Do |
| `776` | Tailandia |
| `780` | Tanzania Rep.Unida Da |
| `782` | Territorio Brit.Oc.Indico |
| `783` | Djibuti |
| `785` | Territorio da Alta Comissao do Pacifico Ocidental |
| `788` | Chade |
| `790` | Tchecoslovaquia |
| `795` | Timor Leste |
| `800` | Togo |
| `805` | Toquelau Ilhas |
| `810` | Tonga |
| `815` | Trinidad E Tobago |
| `820` | Tunisia |
| `823` | Turcas E Caicos Ilhas |
| `824` | Turcomenistao Republica Do |
| `827` | Turquia |
| `828` | Tuvalu |
| `831` | Ucrania |
| `833` | Uganda |
| `840` | Uniao Das Republicas Socialistas Sovieticas |
| `847` | Uzbequistao Republica Do |
| `848` | Vaticano Est.Da Cidade Do |
| `855` | Vietname Norte |
| `858` | Vietna |
| `863` | Virgens Ilhas (Britanicas) |
| `866` | Virgens Ilhas (E.U.A.) |
| `870` | Fiji |
| `873` | Wake Ilha |
| `875` | Wallis E Futuna Ilhas |
| `888` | Congo Republica Democratica Do |
| `890` | Zambia |

**Cuidado de implementação, que vale para todas:** `D` significa coisas diferentes em tabelas
diferentes (Pos-Doutorado em grau de instrução, Divorciado em estado civil, Determinado em contrato).
Os dicionários **não** são intercambiáveis.

### Dicionários que AINDA FALTAM, SÓ do que a INTEGRAÇÃO MANDA

O recorte é estrito: só campos **de dado da pessoa** que a integração vai **enviar**. O que o time
preenche na tela do GI está fora e não bloqueia nada.

#### A. Dicionário de verdade, que só o diretor tem: NENHUM, está fechado

**Os dois que faltavam foram entregues e fechados em 16/09/2026:**

- **`nacionalidade`: ENTREGUE**, 258 valores, registrados acima. A previsão da leitura pelo formato
  (código numérico de três posições com zero à esquerda) se confirmou.
- **`tipoEndereco`: FECHADO, não precisa de dicionário.** O diretor confirmou que **não existe esse
  campo como lista**: é **texto livre**. A leitura ao vivo tinha visto ali um valor textual por
  extenso, e era exatamente isso.

**E entrou um que não estava na lista de pedidos: `tipoLogradouro`**, 178 valores, também registrado
acima. Ele é o prefixo da via (Rua, Avenida, Travessa) e é **lista por extenso, sem código**.

**Ressalva honesta sobre o `tipoLogradouro`, para não virar surpresa na construção:** a investigação
**não identificou um campo separado de tipo de logradouro** entre os 119 preenchidos do registro real.
O GI tem `enderecoResid` como campo único. Ou o prefixo entra concatenado nele, ou existe um campo
próprio entre os **415 do contrato que ainda não inventariamos**. É item da reconexão, e não bloqueia:
o dicionário já está guardado para quando o campo aparecer.

#### B. Campos que a leitura viu preenchidos mas cujo FORMATO não conhecemos

Aqui a lacuna é da própria investigação, e vale dizer por quê: os valores destes campos **não foram
impressos**, por serem dado pessoal (§A.6). Sabemos que vêm preenchidos, não sabemos se são código ou
texto. O diretor resolve os dois de uma vez ao extrair do sistema.

| Campo | O que a investigação já sabe | O que falta |
|---|---|---|
| `naturalidade` | preenchido no registro real | é código de município ou texto livre? |
| `orgaoRG` | preenchido no registro real | é sigla de lista fixa (SSP, DETRAN) ou texto? |
| `cidadeRG` / `cidadeExpedicao` | preenchidos | são código de município ou nome por extenso? |
| `ufrg` / `ufResid` / `ufExpedicao` | preenchidos | confirmar se é a sigla de duas letras padrão |
| `sexo` | preenchido, **letra única** | confirmar o conjunto aceito e se há opção além de M e F |

#### C. NÃO são dicionário: são de/para, e saem de catálogo

Estes o diretor **não precisa** extrair. Saem da própria API do GI, que os expõe e nós já lemos.

| Campo | De onde sai |
|---|---|
| `codigoBcoFolha` / `codigoBcoPagar` | catálogo `Banco`, **163 registros**, legível pela API. Casa com o nome do banco que o EA guarda como texto livre |
| `codigoCidadeResid` | catálogo de municípios. **Não foi lido nesta investigação**, e é item da reconexão |

#### D. NÃO precisam de dicionário

`deficienteFisico`, `reabReadap`, `ctpsDigital`, `residenciaPropria`, `residenciarecursoFGTS`,
`casadoBrasileiro` e `filhosBrasileiros` vieram como **booleano** (verdadeiro ou falso). `titEleZona`,
`titEleSecao`, `smsdddCel` e `smsNroCel` são **numéricos**. Os números de documento (`rg`,
`carteiraTrabalho`, `serie`, `tituloEleitor`, `reservista`, `habilitacao`) são o **número em si**, não
código de tabela.

#### E. Fora do recorte, registrado para não voltar como dúvida

`tipoSalario`, `tipoPgto`, `tipoAdmissao`, `motivoContrato`, `tipo13o`, `tipoFer`, `tipoVT`, `tipoVR`,
o bloco eSocial (`natAtividade`, `tpRegimeJor`, `tpRegimePrev`, `tpRegimeTrab`, `indAdmissao`,
`indProvim`) e a situação trabalhista (`primeiroEmprego`, `flagRecontratacao`, `flagAposentado`,
`recebendoSD`, `infoCota`) são **preenchidos pelo time na tela do GI**. Não dependem de dicionário
nosso e não entram nesta lista de pedido.

## 6. A CONFIRMAR na hora de construir

Duas coisas dependem de **reconectar** ao GI, e nenhuma trava o desenho:

1. **A lista completa dos 415 campos.** Hoje conhecemos os 119 preenchidos e os 36 de data. Um campo
   da pessoa que exista no contrato e esteja vazio no registro real não aparece no inventário, e o
   **PIS é o suspeito principal de estar faltando**.
2. **Os campos obrigatórios de verdade.** A marcação desta lista é **inferência fraca**, por dois
   motivos somados: o swagger não marca obrigatoriedade no cadastro de funcionário, e só existe **um**
   registro real. Com um segundo registro, "preenchido nos dois" começa a valer como indício.

**A ferramenta para isso está PRESERVADA.** Os scripts de leitura ficam em
`/home/henrique/gi-investigacao/` (diretório `700`, fora do repositório, **sem segredo e sem PII**,
verificado pelo agente `seguranca`). A **grade GET-only** vai junto: allowlist de admissão, denylist
com precedência provada, zero portas de escrita e autoteste de **35 bloqueios e 25 leituras**, auditada
em quatro rodadas. A próxima rodada começa pronta, bastando o diretor subir a credencial de novo.

**A credencial NÃO foi preservada**, e isso é deliberado: foi destruída com `shred` e o diretório
removido no fim da investigação (§A.6).

---

## LEIA ISTO ANTES DA LISTA: a coluna "obrigatório" é INFERÊNCIA FRACA

Não temos como afirmar obrigatoriedade, e é importante dizer por quê, porque são duas falhas
independentes que se somam:

1. **A documentação do GI não marca.** O parecer de 20/08 mediu: dos 3.707 campos da API, só 73 estão
   marcados como obrigatórios, e **nenhum deles no cadastro de funcionário**. As marcações que existem
   são automáticas, refletem o banco e não a regra de negócio.
2. **Só existe UM registro real** na pré-admissão. Com amostra de um, "preenchido" não distingue
   obrigatório de simplesmente preenchido.

Então a lista usa três marcadores **honestos**, e nenhum deles diz "obrigatório":

| Marcador | O que significa DE FATO |
|---|---|
| **PREENCHIDO** | veio com valor no registro real. A folha usa este campo. Não prova que o GI exija |
| **VAZIO (aceito)** | o GI **aceitou** o registro com ele vazio. **Prova** de que não bloqueia |
| **não visto** | não estava entre os 119 preenchidos. Pode ser opcional, ou só não usado neste caso |

**Quem decide é o diretor, na tela do GI, que ele conhece.** A lista é para ele marcar o que a tela
exige de verdade.

---

## GRUPO 1: IDENTIDADE

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `nome` | nome completo, em campo único | PREENCHIDO | **sim** (`candidatos.nome`) |
| `cpf` | CPF | PREENCHIDO | **sim** (chave do candidato) |
| `dataNascimento` | data de nascimento | PREENCHIDO | **sim** |
| `sexo` | sexo | PREENCHIDO | **sim** |
| `nacionalidade` | nacionalidade, em código | PREENCHIDO | não |
| `naturalidade` | naturalidade | PREENCHIDO | não |
| `filiacaoNomeMae` | nome da mãe | PREENCHIDO | não |
| `filiacaoNomePai` | nome do pai | PREENCHIDO | não |

**O GI usa nome em campo ÚNICO**, então o sobrenome separado que o Pandapé pede não é exigência do GI.

---

## GRUPO 2: DADOS CIVIS

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `raca` | raça e cor, em código | PREENCHIDO | não |
| `grauInstrucao` | escolaridade, em código | PREENCHIDO | não |
| `estadoCivil` | estado civil | **VAZIO (aceito)** | não |
| `deficienteFisico` | deficiência | PREENCHIDO | não |
| `reabReadap` | reabilitado ou readaptado pelo INSS | PREENCHIDO | não |
| `casadoBrasileiro` / `filhosBrasileiros` | usados para estrangeiro | PREENCHIDO | não |

**`estadoCivil` é o único campo da pessoa que o GI aceitou VAZIO**, e é a evidência mais dura da
lista inteira: ele **não bloqueia**. Ironicamente é justo um dos três que o parecer apontava como
"falta coletar".

**Raça, grau de instrução e nacionalidade são CÓDIGO, não texto.** O domínio de grau de instrução se
sabe ter 11 valores (`1` a `9`, `A`, `B`), derivado do catálogo de cargos. **Falta o significado de
cada código**, e ele só vem do fornecedor: a leitura de hoje confirmou que a API não expõe os
catálogos de domínio.

---

## GRUPO 3: NÚMEROS DE DOCUMENTO (o EA não tem NENHUM)

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `rg` | número do RG | PREENCHIDO | não |
| `orgaoRG` | órgão expedidor | PREENCHIDO | não |
| `ufrg` / `cidadeRG` | UF e cidade do RG | PREENCHIDO | não |
| `dtExpedicaoRG` | data de expedição | PREENCHIDO | não |
| `ufExpedicao` / `cidadeExpedicao` | UF e cidade de expedição | PREENCHIDO | não |
| `carteiraTrabalho` | número da CTPS | PREENCHIDO | não |
| `serie` | série da CTPS | PREENCHIDO | não |
| `dtExpedicaoCTPS` | data de expedição da CTPS | PREENCHIDO | não |
| `ctpsDigital` | CTPS digital | PREENCHIDO | não |
| `tituloEleitor` | título de eleitor | PREENCHIDO | não |
| `titEleZona` / `titEleSecao` | zona e seção | PREENCHIDO | não |
| `reservista` | certificado de reservista | PREENCHIDO | não |
| `habilitacao` | CNH | PREENCHIDO | não |
| `cnhDataEmissao` / `dataVectoHabilitacao` | emissão e vencimento da CNH | PREENCHIDO | não |
| PIS / NIT | o contrato tem `dataCadastroPIS`; o número **não estava** entre os 119 | não visto | não |

**Este grupo é o coração do trabalho manual.** O parecer provou que **nada disto é digitado no
Pandapé**: chega como imagem, e alguém no GI abre o documento e **transcreve à mão**. É o passo manual
que o diretor descreveu, e agora ele tem tamanho.

---

## GRUPO 4: CONTATO

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `email` | e-mail | PREENCHIDO | **sim** |
| `smsdddCel` / `smsNroCel` | DDD e celular, **separados** | PREENCHIDO | **sim, mas junto** (`telefone` é campo único) |
| telefone fixo | não apareceu entre os 119 | não visto | não |

**O GI quer DDD e número em campos separados**, e o EA guarda tudo num campo só. É conversão na hora
de enviar, não coleta a mais.

---

## GRUPO 5: ENDEREÇO

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `cepResid` | CEP | PREENCHIDO | **sim, condicional** |
| `enderecoResid` | logradouro | PREENCHIDO | **sim, condicional** |
| `bairroResid` | bairro | PREENCHIDO | **sim, condicional** |
| `cidadeResid` | cidade | PREENCHIDO | **sim, condicional** |
| `ufResid` | UF | PREENCHIDO | **sim, condicional** |
| `codigoCidadeResid` | **código** da cidade no GI | PREENCHIDO | **não** (temos o nome, não o código) |
| `tipoEndereco` | residencial ou comercial | PREENCHIDO | não |
| `residenciaPropria` / `residenciarecursoFGTS` | moradia própria e uso de FGTS | PREENCHIDO | não |

**A ressalva do "condicional" vale até o Portal existir, e o mapeamento fechado a RESOLVE.** Hoje o
endereço do EA vive no **formulário de VT**, que é **opcional por decisão do diretor** (§A.17), então
candidato que não preenche o VT **não tem endereço no EA**. Pelo mapa fechado, o endereço passa a vir
da **trilha do Portal do Candidato**, e deixa de depender do VT.

Repare que `numero` e `complemento` **não aparecem separados** no GI: o EA coleta os dois e o GI tem
só `enderecoResid`. Provável concatenação no envio, a confirmar.

---

## GRUPO 6: DADOS BANCÁRIOS

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `codigoBcoFolha` / `codigoBcoPagar` | banco, em **código** | PREENCHIDO | **não** (o EA guarda o NOME, texto livre) |
| `agencia` | agência | PREENCHIDO | **sim** |
| `contaCorrente` | conta | PREENCHIDO | **sim** |

**Precisa de de/para:** o EA guarda o banco como o candidato digitou ("NUBANK", "Nu Pagamentos S.A."),
e o GI quer código. O catálogo `Banco` do GI tem **163 registros** e é legível pela API, então o
de/para é viável, ao contrário do de cargos. Agência e conta são **opcionais no Pandapé** e vêm
vazias com frequência (numa amostra de 5, três estavam em branco).

---

## GRUPO 7: SITUAÇÃO DO TRABALHADOR (fronteira do escopo, o diretor decide)

| Campo no GI | O que é | Evidência | O EA tem? |
|---|---|---|---|
| `primeiroEmprego` | primeiro emprego | PREENCHIDO | não |
| `flagRecontratacao` | recontratação | PREENCHIDO | não |
| `flagAposentado` | aposentado | PREENCHIDO | não |
| `recebendoSD` | recebendo seguro-desemprego | PREENCHIDO | não |
| `infoCota` | cota (PcD, aprendiz) | PREENCHIDO | não |

**DECIDIDO pelo diretor em 16/09/2026: estes cinco NÃO entram na integração, o TIME preenche na tela
do GI.** Eram a zona cinzenta do escopo, porque são atributos da pessoa mas não são identidade: são
situação trabalhista, que o time de admissão sabe melhor que o candidato. A pergunta está fechada e a
lista fica aqui como inventário, não como pendência.

---

## O RESUMO PARA A DECISÃO

**O EA já tem 9 dos campos da pessoa:** nome, CPF, nascimento, sexo, e-mail, celular, agência, conta
e o nome do banco. Mais o endereço, **se** o candidato preencheu o VT.

**O EA NÃO tem, e a integração precisaria coletar:**
1. **Os números de documento**, o grupo inteiro: RG, CTPS, título, reservista, CNH, PIS. **14 campos.**
2. **Os dados civis**: raça, grau de instrução, estado civil, nacionalidade, naturalidade, deficiência.
3. **A filiação**: nome do pai e da mãe.
4. **O código da cidade** e o **código do banco**, que são de/para, não coleta.

**A correção que evita subestimar o trabalho:** a frase do parecer "falta só Estado Civil, Telefone
Fixo e o sobrenome" é a comparação com os **27 campos que o Pandapé digita**, não com o GI. Contra o
GI a lacuna é muito maior, e ela se concentra exatamente onde hoje alguém transcreve à mão.

**A boa notícia, já registrada no parecer:** a maioria dos números que faltam **está dentro dos
documentos que o candidato envia**, e a IA da auditoria **já lê** esses documentos. Hoje ela devolve
"confere" ou "não confere"; devolver **os números** é ampliar a resposta de um motor que já existe.

---

## O QUE SÓ A RECONEXÃO RESOLVERIA

Duas coisas, e nenhuma bloqueia a validação do diretor:

1. **A lista dos 415 nomes de campo por inteiro.** Hoje temos os 119 preenchidos e os 36 de data. Um
   campo da pessoa que exista no contrato e esteja vazio no registro real (o **PIS** é o suspeito
   principal) não aparece nesta lista.
2. **Um segundo registro real.** Com dois, "preenchido nos dois" começa a valer como indício de
   obrigatoriedade. Com um, não vale.

*(Levantamento de 16/09/2026, sobre a investigação do mesmo dia. §A.6: só nome de campo, nenhum valor
de pessoa.)*
