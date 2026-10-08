# Importação de localização do Google Maps — v0.4.18

Disponível no mapa de Novo levantamento/Editar levantamento e no planejador de voo. Fluxo: Importar do Google Maps → colar → Localizar → conferir → Aplicar localização. As explicações ficam no ícone i.

## Escopo e formatos

- Coordenadas em query/q e no caminho; marcador !3d/!4d tem prioridade sobre a câmera @.
- Centro de visualização via @, center ou ll é identificado como centro, não como marcador.
- Latitude/longitude decimal e pares de graus/minutos/segundos são aceitos.
- Links maps.app.goo.gl, goo.gl/maps e share.google são resolvidos somente quando redirecionam para um link Maps com coordenadas verificáveis. Links curtos com intersticiais HTML, expirados ou com identificação opaca de lugar não são adivinhados.
- Rotas, Street View, Google My Maps e buscas somente por nome são recusados; não importamos seus pontos arbitrariamente.
- Não utiliza chaves Google, Places ou Google imagery. Nenhuma imagem Google é copiada; a prévia utiliza o mapa-base do Orion.

## Preservação

Pré-visualizar/cancelar não altera o mapa principal. Aplicar muda o centro e adiciona um marcador sem alterar cidade digitada, data, câmera, contorno, medição, parâmetros ou exportação da rota. No levantamento, o marcador e o centro são preservados no JSON `planning_context` quando o usuário salva. A propriedade `importedLocation` é opcional, retrocompatível e validada no servidor; não exige migração. Não persiste o link compartilhado original.

No planejador, o marcador é apenas uma referência visual: não vira waypoint, posição GPS, home de decolagem, nem pedido ao RC 2. O código de exportação, o processador e a ortofoto original não foram modificados.

## Segurança e concorrência

Links completos são analisados no navegador. A resolução de links curtos exige sessão autenticada, origem idêntica, JSON limitado, restrição de tentativas por usuário/instância, timeout total de 10 segundos e no máximo cinco saltos. Somente HTTPS e uma lista fechada de hosts e caminhos Google Maps são aceitos; cada destino é verificado antes da próxima chamada. Não encaminha Cookie, Authorization ou Referer. Não baixa páginas HTML nem segue consentimentos, serviços arbitrários, IPs privados ou URLs com credenciais.

Editar/fechar o importador cancela consultas pendentes e invalida respostas antigas. Aplicar um ponto invalida também a geocodificação de cidade pendente, impedindo que um resultado atrasado mova o mapa depois da confirmação.

## Verificação

`node --test tests/google-maps-import.test.cjs` cobre parsing, ordem latitude/longitude, pin vs câmera, formatos, entradas inválidas, redirecionamentos maliciosos, loops, ausência de rede em links completos e persistência retrocompatível. Testes de navegador exercitam layouts desktop e mobile, links curtos reais, conferência sem mutação, cancelamento, corridas de requisições, salvamento/restauração e igualdade da exportação de missão antes/depois.

## Referência primária

Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started (consultado em 08/10/2026). Os formatos !3d/!4d e URLs curtos são compatibilidade de compartilhamento, não uma API contratual; ausência de coordenadas produz erro explícito.
