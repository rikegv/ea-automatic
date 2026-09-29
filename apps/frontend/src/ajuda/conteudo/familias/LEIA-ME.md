# As famílias de artigos

Uma família é o bloco que TODOS os artigos de uma mesma tela ou aba têm igual: o pré-requisito de
chegar ali e os erros que aquela tela dá. Um arquivo por família, `<codigo>.ts`, exportando
`export const familia: FamiliaDeArtigos` com `codigo` igual ao nome do arquivo.

O barrel `../familias.gerado.ts` é GERADO por `pnpm ajuda:registro`, pelo mesmo motivo do barrel dos
artigos: seria o único arquivo que todo agente de conteúdo tocaria, e dois agentes no mesmo arquivo
se sobrescrevem em silêncio (§A.39).

Quem SOMA a família ao artigo é `artigoResolvido`, em `../../registro.ts`, na leitura. A ordem é
fixa: primeiro o bloco da família, depois o do artigo. Por isso `preRequisitos` e `seDerErrado`
continuam sendo listas simples de texto, e a tela, a busca e a cobertura não precisam saber que
família existe.

REGRA DE ESCRITA: o artigo escreve SÓ o que é dele. Repetir na família o que já está no artigo (ou o
contrário) recria exatamente a duplicação que a família existe para eliminar.
