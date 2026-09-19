# Waypoint KMZ — estado da implementação

Tela própria inspirada na organização funcional do Maps4meConnect: resumo de voo no topo, editor central e controles à direita. Marca Orion em grafite, branco mineral e cobre.

Implementado: pontos manuais arrastáveis, grade simples e dupla, sobreposição, rumo, parâmetros personalizados da câmera, GSD, estimativas de área/distância/fotos/tempo, desfazer/limpar/enquadrar, importação de uma área KML/KMZ/GeoJSON, planos JSON, salvamento no navegador e exportação KMZ para Google Earth e CSV.

O editor utiliza MapLibre 6.10.0 com worker servido pelo próprio aplicativo. Mapa-base OpenStreetMap autorizado pelo proprietário em 19/09/2026: requisições diretas apenas dos tiles visíveis, com atribuição permanente e cache HTTP do navegador. Sem download em massa ou mapa offline. Consulte https://operations.osmfoundation.org/policies/tiles/. O planejamento e os arquivos continuam locais.

O KMZ é visual, com doc.kml. Não é missão executável DJI Fly, não contém waylines.wpml. Modelo do drone, controle e aplicativo ainda precisam ser informados e validados. Corredor, oblíquo, fachada, POI e acompanhamento de terreno ainda não estão implementados. A geração de grades usa aproximação plana local limitada a extensões de 20 km e latitudes ±75°. Faixas são separadas: conexões/curvas, decolagem e retorno não estão incluídos. Não usar este arquivo de revisão para comandar um voo.

Planos são salvos apenas por ação explícita no localStorage deste navegador (máximo 30; salvar o mesmo nome substitui o plano local). A exportação JSON permite backup. Sem banco adicional ou sincronização nesta etapa.

Validação: seis testes da geometria/importação/exportação ZIP; importação, grade dupla, alteração de sobreposição e salvar/carregar verificados no navegador local. Conferir build/lint e publicação ao final.

## Localização e camadas
Minha localização agora mostra marcador, coordenadas e círculo geodésico de precisão; a localização não é adicionada ao plano nem persistida. Mapa (OpenStreetMap), Satélite (Esri World Imagery), Topográfico (Esri World Topo Map) e Relevo (Esri World Shaded Relief), autorizados pelo proprietário em 19/09/2026. Somente a camada ativa solicita imagens; alternar mantém posição, pontos e geometria. Relevo é uma camada visual regional, limitada a zoom nativo 13; não é DEM nem acompanhamento automático de terreno. Créditos dos provedores visíveis. Referência: https://doc.arcgis.com/en/arcgis-online/reference/display-copyrights.htm.
Validação: testes de raio geodésico em três latitudes, lint/build e navegador com posição sintética de 89 m; marcador e missão preservados em Satélite, Topográfico e Relevo, sem erros de console.

## Perfis de câmera (19/09/2026)

Catálogo com os dez modelos solicitados e fontes do fabricante em cada perfil. As câmeras possuem modos de resolução separados. A seleção preenche FOV e tamanho da imagem, preservando altura, velocidade, sobreposição e geometria do plano.

A geometria dos perfis usa o FOV publicado como diagonal, sem inventar dimensões físicas de sensor ou focal real. A focal exibida é equivalente em 35 mm e não participa da fórmula. Cobertura diagonal = 2 * altura * tan(FOV/2), distribuída pela proporção dos pixels. São estimativas em terreno plano, nadir, sem recorte/zoom digital/calibração de lente. Resoluções reduzidas são estimadas por redução 2x em cada dimensão da imagem máxima e identificadas na interface.

Planos antigos mantêm seus parâmetros físicos. Novos planos preservam diagonalFov e cameraId opcionais no JSON versão 1. Fonte desconhecida ou parâmetros modificados não recebem o rótulo de perfil verificado. Intervalos de fotos temporizadas são informativos e geram aviso quando a velocidade exige disparos mais rápidos; não asseguram compatibilidade com missões DJI Fly.

Verificação: sete testes de geolocalização/câmeras; lint e build aprovados. No navegador: Mini 5 Pro 12/50 MP mantém cobertura e divide GSD por dois; Air 3 tele reduz cobertura; salvar/carregar restaura perfil de 50 MP e parâmetros.

## Próximos modos solicitados

Corredor, Oblíquo e Fachada ainda não implementados. Não apresentar botões como funcionalidades concluídas. Exigem modelos geométricos próprios e validação de exportação, além de simples alterações visuais.
