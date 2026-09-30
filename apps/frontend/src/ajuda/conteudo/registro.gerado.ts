/* ARQUIVO GERADO por `pnpm ajuda:registro`. NÃO EDITE À MÃO.
 *
 * Ele é o barrel dos artigos da Central de Ajuda. É gerado, e não mantido, porque seria o único
 * arquivo que todo agente de conteúdo tocaria: dois agentes no mesmo arquivo se sobrescrevem em
 * silêncio (§A.39). Acrescentou artigo? Rode o comando.
 */

import type { Artigo } from "../tipos";
import { artigo as artigo_abrir_e_fechar_uma_janela_do_sistema } from "./comecar-aqui/abrir-e-fechar-uma-janela-do-sistema";
import { artigo as artigo_abrir_o_prontuario_no_drive } from "./comecar-aqui/abrir-o-prontuario-no-drive";
import { artigo as artigo_agir_em_varias_linhas_de_uma_vez } from "./comecar-aqui/agir-em-varias-linhas-de-uma-vez";
import { artigo as artigo_buscar_dentro_da_tela } from "./comecar-aqui/buscar-dentro-da-tela";
import { artigo as artigo_entrar_no_sistema } from "./comecar-aqui/entrar-no-sistema";
import { artigo as artigo_exportar_a_lista_para_excel } from "./comecar-aqui/exportar-a-lista-para-excel";
import { artigo as artigo_filtrar_pelo_card_de_indicador } from "./comecar-aqui/filtrar-pelo-card-de-indicador";
import { artigo as artigo_filtrar_uma_lista } from "./comecar-aqui/filtrar-uma-lista";
import { artigo as artigo_importar_uma_planilha } from "./comecar-aqui/importar-uma-planilha";
import { artigo as artigo_ler_a_linha_da_tabela } from "./comecar-aqui/ler-a-linha-da-tabela";
import { artigo as artigo_ordenar_a_lista_pelo_cabecalho } from "./comecar-aqui/ordenar-a-lista-pelo-cabecalho";
import { artigo as artigo_por_que_eu_nao_vejo_um_menu } from "./comecar-aqui/por-que-eu-nao-vejo-um-menu";
import { artigo as artigo_tema_perfil_e_sair } from "./comecar-aqui/tema-perfil-e-sair";
import { artigo as artigo_virar_a_pagina_da_lista } from "./comecar-aqui/virar-a-pagina-da-lista";
import { artigo as artigo_aplicar_a_obrigatoriedade_a_varios_clientes_de_uma_vez } from "./configuracao/aplicar-a-obrigatoriedade-a-varios-clientes-de-uma-vez";
import { artigo as artigo_aplicar_os_documentos_padrao } from "./configuracao/aplicar-os-documentos-padrao";
import { artigo as artigo_ativar_desativar_e_excluir_uma_regra_de_auditoria } from "./configuracao/ativar-desativar-e-excluir-uma-regra-de-auditoria";
import { artigo as artigo_cadastrar_a_pasta_pai_de_um_cliente_fopag } from "./configuracao/cadastrar-a-pasta-pai-de-um-cliente-fopag";
import { artigo as artigo_cadastrar_a_pasta_pai_do_drive_por_tipo_de_contrato } from "./configuracao/cadastrar-a-pasta-pai-do-drive-por-tipo-de-contrato";
import { artigo as artigo_cadastrar_a_regua_de_um_cliente_e_cargo } from "./configuracao/cadastrar-a-regua-de-um-cliente-e-cargo";
import { artigo as artigo_cadastrar_as_vagas_por_cargo } from "./configuracao/cadastrar-as-vagas-por-cargo";
import { artigo as artigo_cadastrar_os_grupos_de_entrada_do_projeto } from "./configuracao/cadastrar-os-grupos-de-entrada-do-projeto";
import { artigo as artigo_cadastrar_um_cliente_novo } from "./configuracao/cadastrar-um-cliente-novo";
import { artigo as artigo_cadastrar_um_projeto_de_alto_volume } from "./configuracao/cadastrar-um-projeto-de-alto-volume";
import { artigo as artigo_cadastrar_um_usuario } from "./configuracao/cadastrar-um-usuario";
import { artigo as artigo_classificar_o_cliente_por_segmento_e_comercial } from "./configuracao/classificar-o-cliente-por-segmento-e-comercial";
import { artigo as artigo_criar_e_renomear_um_tipo_de_kit } from "./configuracao/criar-e-renomear-um-tipo-de-kit";
import { artigo as artigo_definir_a_area_de_um_menu } from "./configuracao/definir-a-area-de-um-menu";
import { artigo as artigo_definir_a_exigencia_de_cada_documento } from "./configuracao/definir-a-exigencia-de-cada-documento";
import { artigo as artigo_definir_o_pagamento_do_beneficio_do_cliente } from "./configuracao/definir-o-pagamento-do-beneficio-do-cliente";
import { artigo as artigo_definir_quem_exige_integracao } from "./configuracao/definir-quem-exige-integracao";
import { artigo as artigo_desativar_e_reativar_um_usuario } from "./configuracao/desativar-e-reativar-um-usuario";
import { artigo as artigo_desligar_uma_pendencia_obrigatoria_de_um_cliente } from "./configuracao/desligar-uma-pendencia-obrigatoria-de-um-cliente";
import { artigo as artigo_escolher_a_cor_de_um_status_da_vaga } from "./configuracao/escolher-a-cor-de-um-status-da-vaga";
import { artigo as artigo_escrever_uma_regra_de_auditoria } from "./configuracao/escrever-uma-regra-de-auditoria";
import { artigo as artigo_inativar_a_regua_de_um_cliente } from "./configuracao/inativar-a-regua-de-um-cliente";
import { artigo as artigo_inativar_e_reativar_um_cliente } from "./configuracao/inativar-e-reativar-um-cliente";
import { artigo as artigo_ler_a_fila_de_divergencias_da_ingestao } from "./configuracao/ler-a-fila-de-divergencias-da-ingestao";
import { artigo as artigo_ler_a_fila_de_entradas_do_pandape } from "./configuracao/ler-a-fila-de-entradas-do-pandape";
import { artigo as artigo_ler_o_diagnostico_do_sistema } from "./configuracao/ler-o-diagnostico-do-sistema";
import { artigo as artigo_liberar_os_menus_de_um_usuario } from "./configuracao/liberar-os-menus-de-um-usuario";
import { artigo as artigo_manter_as_etapas_do_funil } from "./configuracao/manter-as-etapas-do-funil";
import { artigo as artigo_manter_os_status_da_vaga } from "./configuracao/manter-os-status-da-vaga";
import { artigo as artigo_manter_um_catalogo_do_sistema } from "./configuracao/manter-um-catalogo-do-sistema";
import { artigo as artigo_montar_o_dicionario_de_titulos_do_kit } from "./configuracao/montar-o-dicionario-de-titulos-do-kit";
import { artigo as artigo_montar_os_grupos_de_cliente } from "./configuracao/montar-os-grupos-de-cliente";
import { artigo as artigo_o_catalogo_de_beneficios } from "./configuracao/o-catalogo-de-beneficios";
import { artigo as artigo_o_catalogo_de_cargos } from "./configuracao/o-catalogo-de-cargos";
import { artigo as artigo_o_catalogo_de_clinicas } from "./configuracao/o-catalogo-de-clinicas";
import { artigo as artigo_o_catalogo_de_comerciais } from "./configuracao/o-catalogo-de-comerciais";
import { artigo as artigo_o_catalogo_de_dicas_de_documento } from "./configuracao/o-catalogo-de-dicas-de-documento";
import { artigo as artigo_o_catalogo_de_documentos_da_regua } from "./configuracao/o-catalogo-de-documentos-da-regua";
import { artigo as artigo_o_catalogo_de_escalas } from "./configuracao/o-catalogo-de-escalas";
import { artigo as artigo_o_catalogo_de_linhas_de_servico } from "./configuracao/o-catalogo-de-linhas-de-servico";
import { artigo as artigo_o_catalogo_de_motivos_de_cancelamento } from "./configuracao/o-catalogo-de-motivos-de-cancelamento";
import { artigo as artigo_o_catalogo_de_motivos_de_descarte } from "./configuracao/o-catalogo-de-motivos-de-descarte";
import { artigo as artigo_o_catalogo_de_motivos_de_reenvio } from "./configuracao/o-catalogo-de-motivos-de-reenvio";
import { artigo as artigo_o_catalogo_de_segmentos } from "./configuracao/o-catalogo-de-segmentos";
import { artigo as artigo_o_catalogo_de_status_da_sala_de_espera } from "./configuracao/o-catalogo-de-status-da-sala-de-espera";
import { artigo as artigo_os_alertas_de_arquivamento_e_de_prontuario } from "./configuracao/os-alertas-de-arquivamento-e-de-prontuario";
import { artigo as artigo_os_alertas_de_scheduler_desligado } from "./configuracao/os-alertas-de-scheduler-desligado";
import { artigo as artigo_padrao_ou_individual_o_que_muda_no_kit } from "./configuracao/padrao-ou-individual-o-que-muda-no-kit";
import { artigo as artigo_reordenar_as_etapas_do_funil } from "./configuracao/reordenar-as-etapas-do-funil";
import { artigo as artigo_reordenar_e_apagar_um_item_de_catalogo } from "./configuracao/reordenar-e-apagar-um-item-de-catalogo";
import { artigo as artigo_reprocessar_uma_entrada_do_pandape } from "./configuracao/reprocessar-uma-entrada-do-pandape";
import { artigo as artigo_resetar_a_senha_de_um_usuario } from "./configuracao/resetar-a-senha-de-um-usuario";
import { artigo as artigo_resolver_uma_divergencia_da_ingestao } from "./configuracao/resolver-uma-divergencia-da-ingestao";
import { artigo as artigo_vincular_e_desvincular_admissoes_do_projeto } from "./configuracao/vincular-e-desvincular-admissoes-do-projeto";
import { artigo as artigo_a_memoria_do_pacote_por_cliente_e_cargo } from "./soul-adm/a-memoria-do-pacote-por-cliente-e-cargo";
import { artigo as artigo_abrir_a_ficha_da_integracao } from "./soul-adm/abrir-a-ficha-da-integracao";
import { artigo as artigo_aceitar_o_avanco_com_pendencias } from "./soul-adm/aceitar-o-avanco-com-pendencias";
import { artigo as artigo_achar_uma_admissao_no_gerenciador } from "./soul-adm/achar-uma-admissao-no-gerenciador";
import { artigo as artigo_acompanhar_a_conferencia_do_portal } from "./soul-adm/acompanhar-a-conferencia-do-portal";
import { artigo as artigo_acompanhar_a_integracao } from "./soul-adm/acompanhar-a-integracao";
import { artigo as artigo_acompanhar_o_envelope_na_aba_cadastro } from "./soul-adm/acompanhar-o-envelope-na-aba-cadastro";
import { artigo as artigo_agendar_a_integracao_de_uma_turma } from "./soul-adm/agendar-a-integracao-de-uma-turma";
import { artigo as artigo_agendar_o_exame_admissional } from "./soul-adm/agendar-o-exame-admissional";
import { artigo as artigo_anexar_o_aso_no_exame } from "./soul-adm/anexar-o-aso-no-exame";
import { artigo as artigo_anunciar_um_candidato_na_sala_de_espera } from "./soul-adm/anunciar-um-candidato-na-sala-de-espera";
import { artigo as artigo_aprovar_ou_reprovar_uma_nao_conformidade } from "./soul-adm/aprovar-ou-reprovar-uma-nao-conformidade";
import { artigo as artigo_as_duas_vias_da_nao_conformidade } from "./soul-adm/as-duas-vias-da-nao-conformidade";
import { artigo as artigo_as_regras_de_beneficio_do_cliente } from "./soul-adm/as-regras-de-beneficio-do-cliente";
import { artigo as artigo_assumir_um_documento_como_valido } from "./soul-adm/assumir-um-documento-como-valido";
import { artigo as artigo_atender_a_fila_de_intervencao_humana } from "./soul-adm/atender-a-fila-de-intervencao-humana";
import { artigo as artigo_auditar_os_documentos_da_admissao } from "./soul-adm/auditar-os-documentos-da-admissao";
import { artigo as artigo_baixar_o_kit_de_um_funcionario } from "./soul-adm/baixar-o-kit-de-um-funcionario";
import { artigo as artigo_bloquear_e_desbloquear_o_acesso_do_candidato } from "./soul-adm/bloquear-e-desbloquear-o-acesso-do-candidato";
import { artigo as artigo_cadastrar_uma_admissao_nova } from "./soul-adm/cadastrar-uma-admissao-nova";
import { artigo as artigo_cancelar_o_documento_na_clicksign } from "./soul-adm/cancelar-o-documento-na-clicksign";
import { artigo as artigo_concluir_o_cadastro_e_o_contrato } from "./soul-adm/concluir-o-cadastro-e-o-contrato";
import { artigo as artigo_configurar_o_tipo_de_marcacao_por_cliente } from "./soul-adm/configurar-o-tipo-de-marcacao-por-cliente";
import { artigo as artigo_corrigir_o_cpf_o_cliente_e_o_cargo_pela_ficha } from "./soul-adm/corrigir-o-cpf-o-cliente-e-o-cargo-pela-ficha";
import { artigo as artigo_declinar_uma_admissao } from "./soul-adm/declinar-uma-admissao";
import { artigo as artigo_definir_cargo_folha_e_beneficios_na_nova_admissao } from "./soul-adm/definir-cargo-folha-e-beneficios-na-nova-admissao";
import { artigo as artigo_desconsiderar_a_integracao } from "./soul-adm/desconsiderar-a-integracao";
import { artigo as artigo_destravar_o_acesso_por_e_mail } from "./soul-adm/destravar-o-acesso-por-e-mail";
import { artigo as artigo_disparar_a_assinatura_de_um_candidato } from "./soul-adm/disparar-a-assinatura-de-um-candidato";
import { artigo as artigo_disparar_a_assinatura_em_lote } from "./soul-adm/disparar-a-assinatura-em-lote";
import { artigo as artigo_editar_os_dados_de_uma_admissao } from "./soul-adm/editar-os-dados-de-uma-admissao";
import { artigo as artigo_editar_um_registro_da_sala_de_espera } from "./soul-adm/editar-um-registro-da-sala-de-espera";
import { artigo as artigo_entender_o_farol_e_as_pendencias_obrigatorias } from "./soul-adm/entender-o-farol-e-as-pendencias-obrigatorias";
import { artigo as artigo_enviar_o_kit_para_assinatura } from "./soul-adm/enviar-o-kit-para-assinatura";
import { artigo as artigo_enviar_o_link_do_formulario_de_vt } from "./soul-adm/enviar-o-link-do-formulario-de-vt";
import { artigo as artigo_escolher_o_cliente_na_nova_admissao } from "./soul-adm/escolher-o-cliente-na-nova-admissao";
import { artigo as artigo_excluir_uma_admissao } from "./soul-adm/excluir-uma-admissao";
import { artigo as artigo_exportar_o_relatorio_do_gerenciador } from "./soul-adm/exportar-o-relatorio-do-gerenciador";
import { artigo as artigo_gerar_o_link_do_portal_para_o_candidato } from "./soul-adm/gerar-o-link-do-portal-para-o-candidato";
import { artigo as artigo_gerar_o_relatorio_da_clinica } from "./soul-adm/gerar-o-relatorio-da-clinica";
import { artigo as artigo_gerenciar_a_lista_de_status_do_ifractal } from "./soul-adm/gerenciar-a-lista-de-status-do-ifractal";
import { artigo as artigo_gerenciar_as_credenciais_do_ifractal } from "./soul-adm/gerenciar-as-credenciais-do-ifractal";
import { artigo as artigo_importar_as_matriculas_por_planilha } from "./soul-adm/importar-as-matriculas-por-planilha";
import { artigo as artigo_informar_o_uniforme_e_o_epi_na_liberacao } from "./soul-adm/informar-o-uniforme-e-o-epi-na-liberacao";
import { artigo as artigo_ler_a_ficha_da_admissao } from "./soul-adm/ler-a-ficha-da-admissao";
import { artigo as artigo_ler_a_fila_de_nao_conformidades } from "./soul-adm/ler-a-fila-de-nao-conformidades";
import { artigo as artigo_ler_a_fila_do_cadastro_coluna_por_coluna } from "./soul-adm/ler-a-fila-do-cadastro-coluna-por-coluna";
import { artigo as artigo_ler_a_gestao_das_assinaturas } from "./soul-adm/ler-a-gestao-das-assinaturas";
import { artigo as artigo_ler_a_regua_obrigatoria_da_admissao } from "./soul-adm/ler-a-regua-obrigatoria-da-admissao";
import { artigo as artigo_ler_faltam_para_liberar } from "./soul-adm/ler-faltam-para-liberar";
import { artigo as artigo_ler_o_farol_de_cor_da_fila_de_integracao } from "./soul-adm/ler-o-farol-de-cor-da-fila-de-integracao";
import { artigo as artigo_ler_o_modal_de_pendencias_obrigatorias } from "./soul-adm/ler-o-modal-de-pendencias-obrigatorias";
import { artigo as artigo_liberar_apto_sem_aso_validado } from "./soul-adm/liberar-apto-sem-aso-validado";
import { artigo as artigo_liberar_em_lote } from "./soul-adm/liberar-em-lote";
import { artigo as artigo_liberar_uma_admissao } from "./soul-adm/liberar-uma-admissao";
import { artigo as artigo_manter_as_tarifas_de_transporte } from "./soul-adm/manter-as-tarifas-de-transporte";
import { artigo as artigo_marcar_o_beneficio_como_cadastrado } from "./soul-adm/marcar-o-beneficio-como-cadastrado";
import { artigo as artigo_marcar_o_beneficio_como_calculado } from "./soul-adm/marcar-o-beneficio-como-calculado";
import { artigo as artigo_marcar_uma_admissao_como_banco } from "./soul-adm/marcar-uma-admissao-como-banco";
import { artigo as artigo_montar_o_grupo_de_assinatura_da_empresa } from "./soul-adm/montar-o-grupo-de-assinatura-da-empresa";
import { artigo as artigo_montar_o_pacote_de_beneficios } from "./soul-adm/montar-o-pacote-de-beneficios";
import { artigo as artigo_mover_da_sala_de_espera_para_a_admissao } from "./soul-adm/mover-da-sala-de-espera-para-a-admissao";
import { artigo as artigo_mudar_o_status_do_cadastro_e_voltar_atras } from "./soul-adm/mudar-o-status-do-cadastro-e-voltar-atras";
import { artigo as artigo_o_mapa_das_frentes_da_admissao } from "./soul-adm/o-mapa-das-frentes-da-admissao";
import { artigo as artigo_o_padrao_do_cliente_que_pre_preenche_o_wizard } from "./soul-adm/o-padrao-do-cliente-que-pre-preenche-o-wizard";
import { artigo as artigo_o_veredito_do_aso_pela_ia_na_ficha } from "./soul-adm/o-veredito-do-aso-pela-ia-na-ficha";
import { artigo as artigo_o_vocabulario_da_admissao } from "./soul-adm/o-vocabulario-da-admissao";
import { artigo as artigo_os_filtros_e_os_cards_da_fila_de_liberacao } from "./soul-adm/os-filtros-e-os-cards-da-fila-de-liberacao";
import { artigo as artigo_pausar_e_retomar_uma_admissao } from "./soul-adm/pausar-e-retomar-uma-admissao";
import { artigo as artigo_processar_o_kit_a_partir_dos_pdfs_da_folha } from "./soul-adm/processar-o-kit-a-partir-dos-pdfs-da-folha";
import { artigo as artigo_reabrir_a_pendencia_de_um_documento } from "./soul-adm/reabrir-a-pendencia-de-um-documento";
import { artigo as artigo_reagendar_o_exame } from "./soul-adm/reagendar-o-exame";
import { artigo as artigo_reaproveitar_um_candidato_pelo_cpf } from "./soul-adm/reaproveitar-um-candidato-pelo-cpf";
import { artigo as artigo_reauditar_um_documento } from "./soul-adm/reauditar-um-documento";
import { artigo as artigo_recusar_uma_admissao_na_liberacao } from "./soul-adm/recusar-uma-admissao-na-liberacao";
import { artigo as artigo_reenviar_por_correcao_com_o_pdf_corrigido } from "./soul-adm/reenviar-por-correcao-com-o-pdf-corrigido";
import { artigo as artigo_registrar_uma_nc_de_cadastro } from "./soul-adm/registrar-uma-nc-de-cadastro";
import { artigo as artigo_reimportar_os_documentos_que_faltam } from "./soul-adm/reimportar-os-documentos-que-faltam";
import { artigo as artigo_resolver_uma_nao_conformidade } from "./soul-adm/resolver-uma-nao-conformidade";
import { artigo as artigo_salvar_com_campo_obrigatorio_vazio } from "./soul-adm/salvar-com-campo-obrigatorio-vazio";
import { artigo as artigo_solicitar_o_reenvio_dos_documentos } from "./soul-adm/solicitar-o-reenvio-dos-documentos";
import { artigo as artigo_tratar_possivel_duplicata_de_cpf } from "./soul-adm/tratar-possivel-duplicata-de-cpf";
import { artigo as artigo_trocar_o_kit_anexado } from "./soul-adm/trocar-o-kit-anexado";
import { artigo as artigo_ver_o_aso_anexado } from "./soul-adm/ver-o-aso-anexado";
import { artigo as artigo_vincular_a_pre_admissao_a_sala_de_espera } from "./soul-adm/vincular-a-pre-admissao-a-sala-de-espera";
import { artigo as artigo_visualizar_um_documento_da_admissao } from "./soul-adm/visualizar-um-documento-da-admissao";
import { artigo as artigo_zerar_as_tentativas_de_auditoria } from "./soul-adm/zerar-as-tentativas-de-auditoria";
import { artigo as artigo_abrir_o_painel_da_vaga } from "./soutalent/abrir-o-painel-da-vaga";
import { artigo as artigo_abrir_uma_vaga_nova } from "./soutalent/abrir-uma-vaga-nova";
import { artigo as artigo_adicionar_candidatos_ao_funil_da_vaga } from "./soutalent/adicionar-candidatos-ao-funil-da-vaga";
import { artigo as artigo_adicionar_um_candidato_a_uma_vaga } from "./soutalent/adicionar-um-candidato-a-uma-vaga";
import { artigo as artigo_agir_em_massa_no_funil_da_vaga } from "./soutalent/agir-em-massa-no-funil-da-vaga";
import { artigo as artigo_cadastrar_um_candidato_novo } from "./soutalent/cadastrar-um-candidato-novo";
import { artigo as artigo_cancelar_a_vaga } from "./soutalent/cancelar-a-vaga";
import { artigo as artigo_clonar_uma_vaga } from "./soutalent/clonar-uma-vaga";
import { artigo as artigo_continuar_um_rascunho_de_vaga } from "./soutalent/continuar-um-rascunho-de-vaga";
import { artigo as artigo_corrigir_a_liberacao_de_uma_vaga_revisada } from "./soutalent/corrigir-a-liberacao-de-uma-vaga-revisada";
import { artigo as artigo_enviar_a_shortlist_ao_cliente } from "./soutalent/enviar-a-shortlist-ao-cliente";
import { artigo as artigo_enviar_o_candidato_para_a_admissao } from "./soutalent/enviar-o-candidato-para-a-admissao";
import { artigo as artigo_fechar_a_vaga } from "./soutalent/fechar-a-vaga";
import { artigo as artigo_finalizar_a_posicao_da_vaga } from "./soutalent/finalizar-a-posicao-da-vaga";
import { artigo as artigo_importar_candidatos_de_planilha } from "./soutalent/importar-candidatos-de-planilha";
import { artigo as artigo_ler_a_central_de_candidatos } from "./soutalent/ler-a-central-de-candidatos";
import { artigo as artigo_ler_a_central_de_vagas } from "./soutalent/ler-a-central-de-vagas";
import { artigo as artigo_ler_a_ficha_do_candidato } from "./soutalent/ler-a-ficha-do-candidato";
import { artigo as artigo_marcar_a_entrevista_do_candidato } from "./soutalent/marcar-a-entrevista-do-candidato";
import { artigo as artigo_mover_o_candidato_de_etapa } from "./soutalent/mover-o-candidato-de-etapa";
import { artigo as artigo_mover_o_status_da_vaga } from "./soutalent/mover-o-status-da-vaga";
import { artigo as artigo_reabrir_a_vaga_cancelada } from "./soutalent/reabrir-a-vaga-cancelada";
import { artigo as artigo_registrar_a_saida_do_candidato } from "./soutalent/registrar-a-saida-do-candidato";
import { artigo as artigo_registrar_contato_com_o_candidato } from "./soutalent/registrar-contato-com-o-candidato";
import { artigo as artigo_reprovar_o_candidato_pelo_cliente } from "./soutalent/reprovar-o-candidato-pelo-cliente";
import { artigo as artigo_revisar_uma_vaga_pendente_de_revisao } from "./soutalent/revisar-uma-vaga-pendente-de-revisao";
import { artigo as artigo_tratar_os_candidatos_pendentes_antes_de_fechar } from "./soutalent/tratar-os-candidatos-pendentes-antes-de-fechar";
import { artigo as artigo_trazer_o_candidato_de_volta } from "./soutalent/trazer-o-candidato-de-volta";
import { artigo as artigo_trocar_a_vaga_do_candidato } from "./soutalent/trocar-a-vaga-do-candidato";

export const ARTIGOS: Artigo[] = [
  artigo_abrir_e_fechar_uma_janela_do_sistema,
  artigo_abrir_o_prontuario_no_drive,
  artigo_agir_em_varias_linhas_de_uma_vez,
  artigo_buscar_dentro_da_tela,
  artigo_entrar_no_sistema,
  artigo_exportar_a_lista_para_excel,
  artigo_filtrar_pelo_card_de_indicador,
  artigo_filtrar_uma_lista,
  artigo_importar_uma_planilha,
  artigo_ler_a_linha_da_tabela,
  artigo_ordenar_a_lista_pelo_cabecalho,
  artigo_por_que_eu_nao_vejo_um_menu,
  artigo_tema_perfil_e_sair,
  artigo_virar_a_pagina_da_lista,
  artigo_aplicar_a_obrigatoriedade_a_varios_clientes_de_uma_vez,
  artigo_aplicar_os_documentos_padrao,
  artigo_ativar_desativar_e_excluir_uma_regra_de_auditoria,
  artigo_cadastrar_a_pasta_pai_de_um_cliente_fopag,
  artigo_cadastrar_a_pasta_pai_do_drive_por_tipo_de_contrato,
  artigo_cadastrar_a_regua_de_um_cliente_e_cargo,
  artigo_cadastrar_as_vagas_por_cargo,
  artigo_cadastrar_os_grupos_de_entrada_do_projeto,
  artigo_cadastrar_um_cliente_novo,
  artigo_cadastrar_um_projeto_de_alto_volume,
  artigo_cadastrar_um_usuario,
  artigo_classificar_o_cliente_por_segmento_e_comercial,
  artigo_criar_e_renomear_um_tipo_de_kit,
  artigo_definir_a_area_de_um_menu,
  artigo_definir_a_exigencia_de_cada_documento,
  artigo_definir_o_pagamento_do_beneficio_do_cliente,
  artigo_definir_quem_exige_integracao,
  artigo_desativar_e_reativar_um_usuario,
  artigo_desligar_uma_pendencia_obrigatoria_de_um_cliente,
  artigo_escolher_a_cor_de_um_status_da_vaga,
  artigo_escrever_uma_regra_de_auditoria,
  artigo_inativar_a_regua_de_um_cliente,
  artigo_inativar_e_reativar_um_cliente,
  artigo_ler_a_fila_de_divergencias_da_ingestao,
  artigo_ler_a_fila_de_entradas_do_pandape,
  artigo_ler_o_diagnostico_do_sistema,
  artigo_liberar_os_menus_de_um_usuario,
  artigo_manter_as_etapas_do_funil,
  artigo_manter_os_status_da_vaga,
  artigo_manter_um_catalogo_do_sistema,
  artigo_montar_o_dicionario_de_titulos_do_kit,
  artigo_montar_os_grupos_de_cliente,
  artigo_o_catalogo_de_beneficios,
  artigo_o_catalogo_de_cargos,
  artigo_o_catalogo_de_clinicas,
  artigo_o_catalogo_de_comerciais,
  artigo_o_catalogo_de_dicas_de_documento,
  artigo_o_catalogo_de_documentos_da_regua,
  artigo_o_catalogo_de_escalas,
  artigo_o_catalogo_de_linhas_de_servico,
  artigo_o_catalogo_de_motivos_de_cancelamento,
  artigo_o_catalogo_de_motivos_de_descarte,
  artigo_o_catalogo_de_motivos_de_reenvio,
  artigo_o_catalogo_de_segmentos,
  artigo_o_catalogo_de_status_da_sala_de_espera,
  artigo_os_alertas_de_arquivamento_e_de_prontuario,
  artigo_os_alertas_de_scheduler_desligado,
  artigo_padrao_ou_individual_o_que_muda_no_kit,
  artigo_reordenar_as_etapas_do_funil,
  artigo_reordenar_e_apagar_um_item_de_catalogo,
  artigo_reprocessar_uma_entrada_do_pandape,
  artigo_resetar_a_senha_de_um_usuario,
  artigo_resolver_uma_divergencia_da_ingestao,
  artigo_vincular_e_desvincular_admissoes_do_projeto,
  artigo_a_memoria_do_pacote_por_cliente_e_cargo,
  artigo_abrir_a_ficha_da_integracao,
  artigo_aceitar_o_avanco_com_pendencias,
  artigo_achar_uma_admissao_no_gerenciador,
  artigo_acompanhar_a_conferencia_do_portal,
  artigo_acompanhar_a_integracao,
  artigo_acompanhar_o_envelope_na_aba_cadastro,
  artigo_agendar_a_integracao_de_uma_turma,
  artigo_agendar_o_exame_admissional,
  artigo_anexar_o_aso_no_exame,
  artigo_anunciar_um_candidato_na_sala_de_espera,
  artigo_aprovar_ou_reprovar_uma_nao_conformidade,
  artigo_as_duas_vias_da_nao_conformidade,
  artigo_as_regras_de_beneficio_do_cliente,
  artigo_assumir_um_documento_como_valido,
  artigo_atender_a_fila_de_intervencao_humana,
  artigo_auditar_os_documentos_da_admissao,
  artigo_baixar_o_kit_de_um_funcionario,
  artigo_bloquear_e_desbloquear_o_acesso_do_candidato,
  artigo_cadastrar_uma_admissao_nova,
  artigo_cancelar_o_documento_na_clicksign,
  artigo_concluir_o_cadastro_e_o_contrato,
  artigo_configurar_o_tipo_de_marcacao_por_cliente,
  artigo_corrigir_o_cpf_o_cliente_e_o_cargo_pela_ficha,
  artigo_declinar_uma_admissao,
  artigo_definir_cargo_folha_e_beneficios_na_nova_admissao,
  artigo_desconsiderar_a_integracao,
  artigo_destravar_o_acesso_por_e_mail,
  artigo_disparar_a_assinatura_de_um_candidato,
  artigo_disparar_a_assinatura_em_lote,
  artigo_editar_os_dados_de_uma_admissao,
  artigo_editar_um_registro_da_sala_de_espera,
  artigo_entender_o_farol_e_as_pendencias_obrigatorias,
  artigo_enviar_o_kit_para_assinatura,
  artigo_enviar_o_link_do_formulario_de_vt,
  artigo_escolher_o_cliente_na_nova_admissao,
  artigo_excluir_uma_admissao,
  artigo_exportar_o_relatorio_do_gerenciador,
  artigo_gerar_o_link_do_portal_para_o_candidato,
  artigo_gerar_o_relatorio_da_clinica,
  artigo_gerenciar_a_lista_de_status_do_ifractal,
  artigo_gerenciar_as_credenciais_do_ifractal,
  artigo_importar_as_matriculas_por_planilha,
  artigo_informar_o_uniforme_e_o_epi_na_liberacao,
  artigo_ler_a_ficha_da_admissao,
  artigo_ler_a_fila_de_nao_conformidades,
  artigo_ler_a_fila_do_cadastro_coluna_por_coluna,
  artigo_ler_a_gestao_das_assinaturas,
  artigo_ler_a_regua_obrigatoria_da_admissao,
  artigo_ler_faltam_para_liberar,
  artigo_ler_o_farol_de_cor_da_fila_de_integracao,
  artigo_ler_o_modal_de_pendencias_obrigatorias,
  artigo_liberar_apto_sem_aso_validado,
  artigo_liberar_em_lote,
  artigo_liberar_uma_admissao,
  artigo_manter_as_tarifas_de_transporte,
  artigo_marcar_o_beneficio_como_cadastrado,
  artigo_marcar_o_beneficio_como_calculado,
  artigo_marcar_uma_admissao_como_banco,
  artigo_montar_o_grupo_de_assinatura_da_empresa,
  artigo_montar_o_pacote_de_beneficios,
  artigo_mover_da_sala_de_espera_para_a_admissao,
  artigo_mudar_o_status_do_cadastro_e_voltar_atras,
  artigo_o_mapa_das_frentes_da_admissao,
  artigo_o_padrao_do_cliente_que_pre_preenche_o_wizard,
  artigo_o_veredito_do_aso_pela_ia_na_ficha,
  artigo_o_vocabulario_da_admissao,
  artigo_os_filtros_e_os_cards_da_fila_de_liberacao,
  artigo_pausar_e_retomar_uma_admissao,
  artigo_processar_o_kit_a_partir_dos_pdfs_da_folha,
  artigo_reabrir_a_pendencia_de_um_documento,
  artigo_reagendar_o_exame,
  artigo_reaproveitar_um_candidato_pelo_cpf,
  artigo_reauditar_um_documento,
  artigo_recusar_uma_admissao_na_liberacao,
  artigo_reenviar_por_correcao_com_o_pdf_corrigido,
  artigo_registrar_uma_nc_de_cadastro,
  artigo_reimportar_os_documentos_que_faltam,
  artigo_resolver_uma_nao_conformidade,
  artigo_salvar_com_campo_obrigatorio_vazio,
  artigo_solicitar_o_reenvio_dos_documentos,
  artigo_tratar_possivel_duplicata_de_cpf,
  artigo_trocar_o_kit_anexado,
  artigo_ver_o_aso_anexado,
  artigo_vincular_a_pre_admissao_a_sala_de_espera,
  artigo_visualizar_um_documento_da_admissao,
  artigo_zerar_as_tentativas_de_auditoria,
  artigo_abrir_o_painel_da_vaga,
  artigo_abrir_uma_vaga_nova,
  artigo_adicionar_candidatos_ao_funil_da_vaga,
  artigo_adicionar_um_candidato_a_uma_vaga,
  artigo_agir_em_massa_no_funil_da_vaga,
  artigo_cadastrar_um_candidato_novo,
  artigo_cancelar_a_vaga,
  artigo_clonar_uma_vaga,
  artigo_continuar_um_rascunho_de_vaga,
  artigo_corrigir_a_liberacao_de_uma_vaga_revisada,
  artigo_enviar_a_shortlist_ao_cliente,
  artigo_enviar_o_candidato_para_a_admissao,
  artigo_fechar_a_vaga,
  artigo_finalizar_a_posicao_da_vaga,
  artigo_importar_candidatos_de_planilha,
  artigo_ler_a_central_de_candidatos,
  artigo_ler_a_central_de_vagas,
  artigo_ler_a_ficha_do_candidato,
  artigo_marcar_a_entrevista_do_candidato,
  artigo_mover_o_candidato_de_etapa,
  artigo_mover_o_status_da_vaga,
  artigo_reabrir_a_vaga_cancelada,
  artigo_registrar_a_saida_do_candidato,
  artigo_registrar_contato_com_o_candidato,
  artigo_reprovar_o_candidato_pelo_cliente,
  artigo_revisar_uma_vaga_pendente_de_revisao,
  artigo_tratar_os_candidatos_pendentes_antes_de_fechar,
  artigo_trazer_o_candidato_de_volta,
  artigo_trocar_a_vaga_do_candidato,
];

export const ARTIGO_POR_SLUG: Record<string, Artigo> = Object.fromEntries(
  ARTIGOS.map((a) => [a.slug, a]),
);
