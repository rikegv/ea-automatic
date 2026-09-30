import type { Artigo } from "../../tipos";

/**
 * O INTERRUPTOR POR CAMPO, na tela de obrigatoriedade por cliente.
 *
 * O QUE ELA COBRE: o ajuste fino, um cliente de cada vez. Abrir o cliente, desligar o campo que ele
 * não usa, religar quando voltar a usar, e o efeito disso no sinalizador da admissão.
 *
 * O QUE ELA NÃO COBRE, e tem dono:
 *   - RESOLVER a pendência (preencher o campo que falta na admissão), que é trabalho de outra tela;
 *   - a aplicação da mesma alteração a vários clientes de uma vez, que é a peça irmã;
 *   - a exigência de DOCUMENTO, que não mora aqui: ela vive na Régua Documental, por cliente e cargo.
 *
 * Os rótulos dos itens são declarados como controles porque são texto fixo da tela, e não dado de
 * catálogo: quem pergunta "o que é esse Gestor / BP" digita o que leu.
 */
export const artigo: Artigo = {
  slug: "desligar-uma-pendencia-obrigatoria-de-um-cliente",
  titulo: "Desligar Uma Pendência Obrigatória De Um Cliente",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/pendencias-cliente"],
  menus: ["pendencias-cliente"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "cadastros-do-cliente",
  resumo:
    "Como dizer que um campo obrigatório não vale para um cliente, para que as admissões dele parem de ser cobradas por algo que aquele cliente não usa.",
  termos: [
    "pendencia obrigatoria",
    "campo obrigatorio",
    "desligar obrigatoriedade",
    "nao cobrar centro de custo",
    "cliente aparece parcial",
    "obrigatoriedade por cliente",
    "religar pendencia",
    "sinalizador parcial",
  ],
  preRequisitos: [
    "Saber quais campos aquele cliente de fato não usa: desligar faz o sistema parar de cobrá-los.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Obrigatoriedade Por Cliente pelo Menu Gerencial.",
      controles: ["Obrigatoriedade Por Cliente"],
    },
    {
      gesto: "Procure o cliente pelo nome, pela operação ou pelo código.",
      detalhe:
        "Abaixo do nome, cada linha já diz se o cliente está com tudo obrigatório ou quantos itens estão desligados.",
      controles: ["Buscar por nome, operação ou código…"],
    },
    {
      gesto: "Clique na linha do cliente para abrir a lista de campos.",
      detalhe: "Cada campo tem um interruptor: ligado significa cobrado, desligado significa dispensado.",
      controles: [
        "Cliente",
        "Cargo",
        "Salário",
        "Tipo de contrato",
        "Data de admissão",
        "Termo de Banco",
        "Pacote de benefícios",
        "Escala",
        "Centro de custo",
        "Setor",
        "Gestor / BP",
        "Uniforme",
      ],
    },
    {
      gesto: "Desligue o interruptor do campo que aquele cliente não usa.",
      detalhe:
        "A alteração vale na hora e o aviso no topo confirma o que mudou e para qual cliente. Não existe botão de salvar nesta tela.",
    },
    {
      gesto: "Para voltar atrás, ligue o interruptor de novo.",
      detalhe: "O cliente volta a cobrar o campo e a linha volta a dizer que está tudo obrigatório.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O interruptor não responde ao clique.",
      acao: "Outra alteração ainda está sendo salva. Espere o aviso aparecer no topo e tente de novo.",
    },
    {
      sintoma: "Não encontro o interruptor de um documento.",
      acao: "Documento não fica aqui. Esta tela governa campos de cadastro; a exigência de cada documento vive na Régua Documental, por cliente e cargo.",
    },
    {
      sintoma: "Desliguei um campo e a admissão continua cobrando outro.",
      acao: "Cada campo é independente. Abra o cliente e confira os demais interruptores, ou veja na própria admissão quais itens ainda faltam.",
    },
  ],
  regras: [
    "O padrão é tudo obrigatório: cliente que ninguém configurou cobra todos os campos, como sempre foi.",
    "Desligar vale só para aquele cliente, e não muda nada para os demais.",
    "Ao desligar, as admissões daquele cliente deixam de cobrar o campo, e as que estavam pendentes só por ele passam a contar como completas.",
    "Esta tela governa campos de cadastro. Exigência de documento é assunto da Régua Documental.",
    "A alteração é gravada no clique: não existe botão de salvar nesta tela.",
  ],
  relacionados: [
    "aplicar-a-obrigatoriedade-a-varios-clientes-de-uma-vez",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "ler-o-modal-de-pendencias-obrigatorias",
    "ler-a-regua-obrigatoria-da-admissao",
    "salvar-com-campo-obrigatorio-vazio",
    "definir-a-exigencia-de-cada-documento",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/pendencias-cliente/page.tsx",
    "apps/backend/src/admin/pendencias-cliente/pendencias-cliente.service.ts",
    "apps/backend/src/domain/pendencia-config.ts",
  ],
  revisadoEm: "2026-09-30",
};
