import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA EXAME, 4 de 4: O GESTO QUE ASSUME RISCO.
 *
 * ┌─ ESTE ARTIGO NÃO ENSINA UM ATALHO, ELE ENSINA UMA RESPONSABILIDADE ──────────────────────────┐
 * │ Concluir o Exame sem o atestado aprovado pela leitura automática abre o Cadastro de uma pessoa │
 * │ cuja aptidão médica ninguém confirmou. O sistema permite, por exceção, e cobra o preço: fica   │
 * │ registrada uma não conformidade em nome de quem autorizou, com o termo de ciência, a data e o  │
 * │ papel. O texto tem de dizer isso ANTES do passo a passo, senão ele vira receita de contorno.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUEM PODE, MEDIDO NO CÓDIGO E NÃO NO COMENTÁRIO DA TELA ────────────────────────────────────┐
 * │ `esteira.service.ts` bloqueia DURO só o papel COMUM ("aptoSemAsoValidado", sem opção de        │
 * │ liberar) e oferece a autorização a MASTER e SUPER_ADMIN ("aptoSemAsoSuperAdmin"). O comentário │
 * │ da tela diz "só SUPER_ADMIN", e ele está DEFASADO: o guard olha `user.papel === "COMUM"`, e o  │
 * │ registro da não conformidade escreve o papel de quem confirmou justamente para não fixar um.   │
 * │ O artigo segue o CÓDIGO: Master ou Super Admin.                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARTIGO DEIXA PARA OS IRMÃOS ─────────────────────────────────────────────────────┐
 * │ Anexar o atestado e ler o veredito da leitura automática é "anexar-o-aso-no-exame". Avançar    │
 * │ com CAMPO obrigatório em branco é outra janela e outro artigo,                                 │
 * │ "aceitar-o-avanco-com-pendencias": as duas podem aparecer em sequência no mesmo clique, e o     │
 * │ passo 6 avisa disso sem reensinar a segunda. Julgar a não conformidade depois é a tela de Não   │
 * │ Conformidades, fora deste artigo.                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a captura da fila e das janelas que trazem
 * o nome do candidato está vetada enquanto a homologação não tiver arnês sintético. Os prints entram
 * em entrega própria.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa, e nenhum resultado de exame de ninguém.
 */
export const artigo: Artigo = {
  slug: "liberar-apto-sem-aso-validado",
  titulo: "Liberar Apto Sem ASO Validado",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como concluir o Exame como apto quando o atestado ainda não foi aprovado pela leitura automática, quem tem permissão para isso, o que a confirmação pergunta e exatamente o que fica registrado, em nome de quem.",
  termos: [
    "liberar sem aso",
    "apto sem aso",
    "marcar apto sem atestado",
    "aso nao validado",
    "forcar apto",
    "liberei sem documento",
    "autorizar liberacao",
    "estou ciente",
    "nao conformidade",
    "nc",
    "ficou registrado no meu nome",
    "o sistema nao deixa marcar apto",
    "so master pode",
  ],
  preRequisitos: [
    "Ser Master ou Super Admin. O consultor comum recebe um aviso de bloqueio, sem opção de seguir.",
    "Ter um motivo de processo para não esperar o atestado. Esta é uma exceção autorizada e registrada, não um jeito de fechar a fila.",
  ],
  passos: [
    {
      gesto: "Na aba Exame, ache a pessoa e abra o seletor de status da linha dela.",
      detalhe:
        "O caminho é o mesmo de qualquer mudança de etapa da frente: o seletor traz as situações do catálogo vigente do exame.",
      controles: ["EXAME", "Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Escolha a situação de apto.",
      detalhe:
        "É ela que conclui o Exame. Com o atestado já aprovado pela leitura automática, a conclusão acontece sem nenhuma pergunta a mais, e este artigo termina aqui.",
    },
    {
      gesto: "Leia a janela Liberar Apto Sem ASO Validado?",
      detalhe:
        "Ela aparece quando o atestado não está anexado, ou está anexado e ainda não foi aprovado pela leitura automática. O texto avisa que a liberação fica registrada em seu nome, e essa frase é literal: o registro guarda quem confirmou.",
    },
    {
      gesto: "Decida: Cancelar, ou Autorizar liberação.",
      detalhe:
        "Cancelar não muda nada e a pessoa segue na fila do Exame. Autorizar liberação conclui a frente na hora, e o Cadastro passa a poder abrir, desde que a Auditoria também esteja concluída.",
      controles: ["Autorizar liberação", "Cancelar"],
    },
    {
      gesto: "Leia a mensagem verde do topo, que confirma o registro.",
      detalhe:
        "Ela diz que uma não conformidade foi registrada. O registro guarda o termo de ciência de que a pessoa foi marcada como apta sem o atestado, quem autorizou, o papel de quem autorizou e a data. Ele é permanente e consultável, e a decisão sobre ele acontece na tela de Não Conformidades, não aqui.",
    },
    {
      gesto: "Responda a segunda pergunta, se ela aparecer.",
      detalhe:
        "Havendo também campo obrigatório da admissão em branco, o sistema pede em seguida o aceite de avanço com pendências, que é outra janela e outro registro. Uma não substitui a outra: a primeira é sobre o atestado, a segunda é sobre os campos.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Aparece Anexe o ASO para liberar como Apto (a I.A valida o documento).",
      acao: "Você é consultor comum e não há atestado anexado. Não existe opção de seguir: anexe o atestado, ou peça a autorização a um Master ou Super Admin, dizendo o motivo.",
    },
    {
      sintoma:
        "Aparece O ASO ainda não foi validado pela I.A como apto. Aguarde a leitura da I.A.",
      acao: "O arquivo chegou e a leitura não aprovou, ou ainda não terminou. O caminho normal é conferir o documento e reenviar. Sendo caso de não esperar, a autorização é de Master ou Super Admin.",
    },
    {
      sintoma: "Autorizei e a admissão não apareceu na fila do Cadastro.",
      acao: "O Cadastro só abre com a Auditoria e o Exame concluídos. Faltando a Auditoria, a admissão fica aguardando, e o Cadastro abre sozinho quando ela fechar.",
    },
    {
      sintoma: "Autorizei sem querer.",
      acao: "Volte o status da frente pelo seletor: o sistema pede confirmação, porque isso reabre pendência em quem já pode estar em cadastro. O registro da não conformidade não é apagado por esse recuo, e é assim de propósito: ele é a trilha do que foi autorizado.",
    },
    {
      sintoma: "Anexei o atestado depois e ele foi aprovado. O registro sai?",
      acao: "Não sai. O registro é permanente, e o que muda é a situação do documento. A decisão sobre aquele registro é tomada na tela de Não Conformidades.",
    },
    {
      sintoma: "Autorizei duas vezes a mesma admissão e quero saber se gerou dois registros.",
      acao: "Não gera. O registro é um por admissão para esse motivo, então repetir o gesto não duplica nada.",
    },
    {
      sintoma: "Eu não sou Master e o cliente precisa da pessoa trabalhando antes do atestado.",
      acao: "Existe, no mesmo seletor, a situação que libera o avanço para o Cadastro sem concluir o Exame, e ela não depende de papel. Ela tem regras próprias de data e mantém a pessoa na fila do Exame até o atestado subir. Combine o caminho com quem conduz a admissão antes de mudar o status.",
    },
  ],
  regras: [
    "Quem valida o atestado é a leitura automática do documento. Não existe validação manual pela tela.",
    "O consultor comum não consegue concluir o Exame sem o atestado aprovado: para ele o bloqueio é total, sem opção de seguir.",
    "Master e Super Admin conseguem, por autorização explícita, e a autorização fica registrada em nome de quem confirmou.",
    "O registro guarda o termo de ciência, o autor, o papel do autor e a data. Ele é permanente e consultável.",
    "A decisão sobre esse registro acontece na tela de Não Conformidades, não na esteira.",
    "É um registro por admissão para esse motivo: repetir o gesto não cria outro.",
    "Voltar o status depois não apaga o registro, e reabrir pendência em quem já está em cadastro exige confirmação.",
    "Concluído o Exame, o Cadastro só abre se a Auditoria também estiver concluída.",
    "Havendo campo obrigatório da admissão em branco, o sistema pede em seguida o aceite de avanço com pendências, que é um segundo registro.",
  ],
  relacionados: [
    "anexar-o-aso-no-exame",
    "agendar-o-exame-admissional",
    "reagendar-o-exame",
    "aceitar-o-avanco-com-pendencias",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "concluir-o-cadastro-e-o-contrato",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/domain/nao-conformidade.ts",
  ],
  revisadoEm: "2026-09-30",
};
