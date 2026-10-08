# Orion Agro — entrega funcional 0.4.0

Rota privada: `/agro`. Acesso pelo painel e pela tela de resultados do levantamento. Implementação incremental; não altera NodeODM, agente, monitor de atividade ou o visual do mapa de resultados existente.

## Funcionalidades entregues

- Desenho e ajuste de vértices do talhão no mapa; até 20 polígonos de exclusão.
- Importação de um Polygon GeoJSON com recortes ou de um plano JSON Orion Agro.
- Linhas paralelas com espaçamento exato no plano UTM, orientação da grade e recuo nas pontas. Polígonos côncavos e exclusões sobrepostas são recortados; não há conexão de voo através de uma exclusão.
- Seleção por toque/clique, lista, intervalo de linhas ou seleção total. Cultura, variedade, situação e observação por linha.
- Cores por cultura; café, soja e outros nomes personalizados. Não há detecção automática de cultura/plantas.
- Simulação de faixas centrais de pulverização; volume teórico opcional calculado apenas a partir do valor informado pelo usuário e da área útil completa.
- Área total/útil/excluída e extensão das linhas em metros UTM. Não atribui uma área individual à cultura de uma linha.
- Salvamento privado em versões imutáveis na conta. O mesmo ID de solicitação não duplica a versão em uma repetição de rede. Nova edição gera nova versão.
- Exportação GeoJSON, CSV e JSON editável. Proteção de CSV contra interpretação de fórmulas.
- Acesso pelos resultados abre outra aba do mesmo aplicativo com a mesma ortofoto e o mesmo processamento, carregados automaticamente. Usa a mesma prévia privada e o mesmo tratamento visual do mapa original; não duplica nem altera arquivos. Trocar o levantamento cancela respostas antigas e recarrega a referência. Sem ortofoto concluída, o editor informa a ausência e permite planejamento preliminar no mapa-base.

## Limites explícitos

Geometrias de entrada/saída em WGS84; cálculo em UTM WGS84 da zona/hemisfério da área. Não rotular como SIRGAS2000. Restrição de extensão de 10 km e uma única zona/hemisfério; até 200 vértices por contorno, 2.000 linhas e 10.000 segmentos. Contornos cruzados, degenerados ou totalmente excluídos são rejeitados.

Linhas retas em planta, NÃO linhas em nível. O recuo nas pontas não é buffer de segurança geral. Recortar uma linha central não simula a faixa molhada ou a deriva. Não considera terreno, vento, obstáculos não desenhados, autonomia e manobras. Os arquivos NÃO são missões executáveis nem são enviados ao drone. Não há prescrição agronômica nem recomendação automática de produto/dose.

Não há chamada de API de IA nesta entrega. Não foi criada uma conexão fictícia nem adicionada uma chave ao frontend. Também não há produtos LiDAR, NIR/NDVI ou precisão certificada gerados a partir destas funções.

## Persistência e segurança

Migration: `supabase/migrations/20261007001000_agro_plans.sql`. Tabela `agro_plans` com RLS por `owner_id`, verificação de propriedade do levantamento associado e índices. `anon` não tem leitura. `authenticated` só pode ler e inserir suas versões; não pode sobrescrever nem apagar versões. Ações validam a sessão e os dados, recalculam métricas no servidor e não confiam no resumo enviado pelo navegador. Credenciais/tokens não são aceitos como argumentos do usuário.

## Verificação

- `node tests/test-agro-plan.cjs`: 19 casos de geometria, exclusões, limites, atributos e exportação.
- `python -m unittest discover -s tests -p "test_agent*.py"`: regressões do processamento existente.
- `node tests/test-processing-activity.cjs`: regressões da telemetria.
- `npx eslint src/app/agro src/lib/agro-plan.ts src/proxy.ts` e `npm run build`.
- Navegador real: login, desenho, importação, linhas café/soja, exportações, salvamento idempotente, restauração em outro contexto mobile e simulação de pulverização. Larguras 360, 390 e 1440 px. Dados sintéticos de QA são removidos por seus IDs exatos ao final, sem tocar levantamentos reais.
- RLS conferida: outra identidade não enxerga os registros sintéticos; acesso anônimo e edição/exclusão direta não são concedidos.

## Referências de implementação

- Proj4js: https://proj4js.org/
- Polygon clipping: https://github.com/mfogel/polygon-clipping
- MapLibre: https://maplibre.org/maplibre-gl-js/docs/examples/add-a-geojson-line/
- RLS Supabase: https://supabase.com/docs/guides/database/postgres/row-level-security
