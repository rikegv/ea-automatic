import type { Artigo } from "../../tipos";

/**
 * N1 DO WIZARD, 2 de 3: O CPF QUE JÁ EXISTE.
 *
 * ┌─ O ARTIGO EXISTE PORQUE O CARTÃO PARECE UM ERRO, E NÃO É ───────────────────────────────────┐
 * │ "CPF já cadastrado" tem cara de barreira: ícone de atenção, fundo destacado, contagem de       │
 * │ admissões anteriores. Quem lê isso no meio de um cadastro pensa que está duplicando gente e    │
 * │ para. É o contrário: readmissão é caminho normal (§A.3, regra 6), e o cartão está OFERECENDO   │
 * │ trabalho pronto. Metade deste artigo é dizer isso com todas as letras.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O BOTÃO TRAZ, MEDIDO NO CÓDIGO E NÃO SUPOSTO ────────────────────────────────────────┐
 * │ `reaproveitar()` (`app/(app)/nova/page.tsx`) copia TRÊS campos: nome, e-mail e telefone. Não   │
 * │ traz data de nascimento, não traz sexo e não traz nada da vaga anterior. Escrever "traz os     │
 * │ dados do candidato" seria vago o bastante para a pessoa achar que o resto veio e não conferir. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TRAVA DE DUPLICIDADE **NÃO** É DAQUI, e dizer que era seria erro: a checagem de admissão viva do
 * mesmo CPF mora na LIBERAÇÃO (`travarDuplicidadeDeCpf`), não na criação pelo wizard. O artigo diz o
 * que este caminho faz, e manda ao irmão da Liberação para o outro.
 *
 * §A.6: nenhum CPF, nome ou e-mail de pessoa aparece aqui.
 */
export const artigo: Artigo = {
  slug: "reaproveitar-um-candidato-pelo-cpf",
  titulo: "Reaproveitar Um Candidato Pelo CPF",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nova-admissao",
  resumo:
    "Quando o CPF digitado já existe na base, o wizard avisa e oferece trazer nome, e-mail e telefone da pessoa. A admissão nova é criada do mesmo jeito, e o histórico das anteriores continua intacto.",
  termos: [
    "cpf ja cadastrado",
    "cpf repetido",
    "cpf existente",
    "ja existe",
    "readmissao",
    "readmitir",
    "recontratar",
    "voltou",
    "reaproveitar",
    "aproveitar dados",
    "duplicado",
    "duplicidade",
    "mesma pessoa",
    "historico do candidato",
  ],
  preRequisitos: [
    "Estar na etapa Candidato do wizard, com cliente e cargo já escolhidos nas etapas anteriores.",
  ],
  passos: [
    {
      gesto: "Digite o CPF do candidato no campo CPF.",
      detalhe:
        "A consulta só acontece com o CPF completo e válido: a etiqueta abaixo do campo precisa estar em CPF válido. Enquanto o sistema procura, ele avisa que está verificando o histórico.",
      controles: ["CPF *", "CPF válido", "CPF inválido", "Verificando histórico do CPF…"],
    },
    {
      gesto: "Leia o cartão CPF já cadastrado, quando ele aparecer.",
      detalhe:
        "Ele diz o nome que está na base e quantas admissões anteriores a pessoa tem. Não é um bloqueio nem um alerta de erro: é o aviso de que você já conhece essa pessoa.",
      controles: ["CPF já cadastrado"],
      print: {
        arquivo: "01-cpf-ja-cadastrado.png",
        legenda: "Passo 2: o cartão que aparece quando o CPF digitado já existe na base.",
      },
    },
    {
      gesto: "Clique em Reaproveitar dados.",
      detalhe:
        "O botão preenche nome, e-mail e telefone com o que já estava cadastrado, e a etiqueta muda para Dados reaproveitados.",
      controles: ["Reaproveitar dados", "Dados reaproveitados"],
      print: {
        arquivo: "02-dados-reaproveitados.png",
        legenda: "Passo 3: a etiqueta de confirmação depois do reaproveitamento.",
      },
    },
    {
      gesto: "Confira o que veio e complete o que não veio.",
      detalhe:
        "Só nome, e-mail e telefone são trazidos. Data de nascimento, sexo e data de admissão continuam com você, e nada da vaga anterior é copiado: cargo, salário e benefícios são os desta contratação.",
      controles: ["Nome completo *", "Telefone *", "E-mail *", "Data de nascimento *", "Sexo *"],
    },
    {
      gesto: "Siga com o cadastro normalmente e clique em Confirmar admissão.",
      detalhe:
        "A admissão nova nasce ligada à mesma pessoa, e as anteriores continuam onde estavam. O CPF é a chave: uma pessoa, várias admissões.",
      controles: ["Confirmar admissão"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Digitei o CPF e o cartão não apareceu.",
      acao: "Ou o CPF ainda não está completo e válido, ou essa pessoa nunca foi cadastrada. Confira a etiqueta abaixo do campo: sem o CPF válido, o sistema nem consulta.",
    },
    {
      sintoma: "Cliquei em Reaproveitar dados e a data de nascimento continua vazia.",
      acao: "É o esperado. O botão traz nome, e-mail e telefone, e mais nada. Preencha o restante conferindo os documentos da pessoa.",
    },
    {
      sintoma: "Corrigi o CPF depois de reaproveitar e o botão voltou a aparecer.",
      acao: "É de propósito: outro CPF é outra pessoa, então o sistema desfaz a marca e consulta de novo. Confira se o nome que veio agora é mesmo o de quem você está cadastrando.",
    },
    {
      sintoma: "O nome que veio está diferente do que o candidato informou agora.",
      acao: "O cadastro guarda o nome da vez anterior. Corrija o campo Nome completo aqui mesmo, sem medo: a correção vale para esta admissão e você não perde o histórico.",
    },
    {
      sintoma: "Tenho medo de estar duplicando a pessoa.",
      acao: "Não está. O CPF é único no sistema e a pessoa continua sendo uma só, com várias admissões penduradas nela. Para ver as anteriores, procure pelo CPF no Gerenciador.",
    },
  ],
  regras: [
    "O CPF é a chave única do candidato: a mesma pessoa pode ter várias admissões, e todas ficam guardadas.",
    "O reaproveitamento traz nome, e-mail e telefone. Nada da vaga anterior é copiado.",
    "Reaproveitar é opcional. Ignorar o cartão e digitar tudo à mão dá no mesmo, porque o vínculo com a pessoa é feito pelo CPF, não pelo botão.",
    "Criar admissão nova não apaga nem altera as anteriores: o histórico é preservado.",
    "Trocar o CPF digitado desfaz o reaproveitamento e refaz a consulta, porque outro CPF é outra pessoa.",
    "O aviso de admissão viva do mesmo CPF, aquele que pede confirmação de que não é duplicata, acontece na Liberação Admissional, não aqui.",
  ],
  relacionados: [
    "cadastrar-uma-admissao-nova",
    "salvar-com-campo-obrigatorio-vazio",
    "achar-uma-admissao-no-gerenciador",
    "liberar-uma-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/admissoes.controller.ts",
  ],
  revisadoEm: "2026-09-28",
};
