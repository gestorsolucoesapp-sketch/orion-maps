# Orion Nature — revisão visual

Paleta: sálvia no fundo, superfícies brancas, verde-floresta em texto e ações, terracota para desenho/avisos. Referência: pesquisa Material 3 Expressive, Google Design (https://design.google/library/expressive-material-design-google-research). Aplicação própria, sem copiar layout ou ativos de terceiros.

Diagnóstico: planejador usava painéis escuros contíguos e fonte pequena. Separados visualmente missão/câmera, voo e arquivos; métricas em cartões. Tema global harmoniza entrada, painel e GSD.

Preservação: alterações exclusivamente em globals.css e waypoints.css. Nenhuma alteração em armazenamento, localStorage, autenticação, tabelas ou fórmulas. Planos permanecem na chave orion-missions-v1; fotos permanecem no Supabase. Nenhum serviço contratado ou dependência adicionada.

Redundância visual existente: GSD aparece na ficha da câmera e resumo do voo, ambos usam calculation.gsd. Mantida, pois atende consulta em dois contextos; nenhuma cópia de dados introduzida.

Revisão: desktop e largura de 390 px; campos de câmera e mapa; foco visível e estados desabilitados distintos. Sem migração ou limpeza de dados. Publicação pelo fluxo GitHub/Vercel existente e autorizado.
