-- DOIS ESTÁGIOS (decisão do diretor): o terceiro, `FINALIZADO`, foi removido da sequência.
--
-- Quem ficou nele precisa VOLTAR para um estágio válido, senão a admissão some das duas abas e vira
-- trabalho invisível: nenhuma tela a mostra e ninguém sabe que ela existe. O destino é
-- BENEFICIO_CALCULADO, que é o que "finalizado" queria dizer no desenho de três estágios: o pacote
-- já foi calculado e a pessoa saiu da fila de trabalho.
--
-- `FINALIZADO` continua no enum porque Postgres não remove valor sem recriar o tipo, mas fica órfão,
-- como `PENDENTE` e `CADASTRADO`: nenhuma linha o usa e a sequência não o oferece.
UPDATE "admissoes"
   SET "status_cadastro_beneficio" = 'BENEFICIO_CALCULADO'
 WHERE "status_cadastro_beneficio" = 'FINALIZADO';
