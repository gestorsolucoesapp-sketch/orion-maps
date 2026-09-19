# Waypoint KMZ — estado da implementação

Tela própria inspirada na organização funcional do Maps4meConnect: resumo de voo no topo, editor central e controles à direita. Marca Orion em grafite, branco mineral e cobre.

Implementado: pontos manuais arrastáveis, grade simples e dupla, sobreposição, rumo, parâmetros personalizados da câmera, GSD, estimativas de área/distância/fotos/tempo, desfazer/limpar/enquadrar, importação de uma área KML/KMZ/GeoJSON, planos JSON, salvamento no navegador e exportação KMZ para Google Earth e CSV.

O editor utiliza MapLibre 6.10.0 com worker servido pelo próprio aplicativo. Mapa-base OpenStreetMap autorizado pelo proprietário em 19/09/2026: requisições diretas apenas dos tiles visíveis, com atribuição permanente e cache HTTP do navegador. Sem download em massa ou mapa offline. Consulte https://operations.osmfoundation.org/policies/tiles/. O planejamento e os arquivos continuam locais.

O KMZ é visual, com doc.kml. Não é missão executável DJI Fly, não contém waylines.wpml. Modelo do drone, controle e aplicativo ainda precisam ser informados e validados. Corredor, oblíquo, fachada, POI e acompanhamento de terreno ainda não estão implementados. A geração de grades usa aproximação plana local limitada a extensões de 20 km e latitudes ±75°. Faixas são separadas: conexões/curvas, decolagem e retorno não estão incluídos. Não usar este arquivo de revisão para comandar um voo.

Planos são salvos apenas por ação explícita no localStorage deste navegador (máximo 30; salvar o mesmo nome substitui o plano local). A exportação JSON permite backup. Sem banco adicional ou sincronização nesta etapa.

Validação: seis testes da geometria/importação/exportação ZIP; importação, grade dupla, alteração de sobreposição e salvar/carregar verificados no navegador local. Conferir build/lint e publicação ao final.
