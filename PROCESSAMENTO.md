# Preparação de processamento — 19/09/2026

Rota /processamento, protegida pela sessão existente e pelo proxy. Consulta levantamentos e imagens pelo token do usuário e pelas mesmas verificações de propriedade do painel. Sem credencial privilegiada no cliente. Upload e visualização reutilizam ImageWorkspace e suas server actions.

Funciona: selecionar área, consultar/enviar fotos privadas, escolher quatro combinações de produtos, qualidade e resolução desejadas, registrar intenção de GCP, salvar/abrir rascunhos e exportar ficha JSON. Rascunhos ficam no navegador sob orion-processing-v1:<userId>, não no banco. Dados corrompidos bloqueiam gravação em vez de serem substituídos. A ficha não inclui fotos nem GCP.

Pendente: servidor NodeODM/ODM, fila e execução real, progresso, resultados e download de produtos, importação/marcação GCP, RTK/MRK, correção geoidal e saída CAD. Não foram criados créditos, cobrança ou resultados fictícios. Nenhuma opção de processamento é enviada para um motor nesta etapa.

Referências: fluxo visual observado em Maps4me; produtos e conceitos consultados em https://docs.opendronemap.org/arguments/ . Interface e código próprios.

Verificação: quatro testes de validação/persistência; lint e build. Navegador local com área sintética: rascunho salvo, intenção GCP identificada como pendente, iniciar indisponível. Autenticação da rota verificada por redirecionamento; envio real de fotos na nova rota depende de sessão do proprietário. A tela temporária de teste foi removida.

Também: ajuste manual da posição no mapa. Próximo clique tem prioridade sobre criação de waypoint; marcador manual sem círculo GPS e com rótulo próprio. Cancelar mantém a posição anterior. Uma nova consulta à localização do navegador substitui a posição manual. A posição permanece apenas em memória da aba, sem entrar na missão salva.
