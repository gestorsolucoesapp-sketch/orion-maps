# Processamento de ortofoto — estado em 08/10/2026

O aplicativo cria tarefas privadas na página `/processamento`. O agente Windows da mesma conta baixa as fotos, usa NodeODM no Docker e envia produtos ao bucket privado `processing-results`. A página web não executa fotogrametria no servidor Vercel. Consulte `local-agent/README.md` para instalar ou atualizar o agente.

## Entrada e execução

- Fotos JPG/PNG originais no levantamento; até 50 MB por arquivo e 200 por lote na interface atual.
- Antes de enviar ao NodeODM, o agente valida abertura das imagens, conta coordenadas GPS no EXIF e rejeita arquivos duplicados ou lotes sem nenhuma foto georreferenciada. GPS no EXIF não prova precisão; a triagem não avalia nitidez nem cobertura.
- Presets: ortofoto, elevação, nuvem e completo. O preset de ortofoto evita derivados de terreno. Nos demais, o agente ainda calcula derivados antes de filtrar os produtos pedidos para upload.
- A resolução em cm/pixel é uma configuração do motor, não uma promessa de acurácia.
- Marcar “Este levantamento exige pontos de controle” impede iniciar o processamento enquanto GCP e checkpoints não puderem ser importados, marcados nas fotos e validados. O rascunho continua disponível.

## Saída e limites

- A prévia da ortofoto é um PNG privado em WGS84. O novo arquivo técnico é um COG GeoTIFF no CRS extraído do raster produzido pelo NodeODM; aparece como download separado. O arquivo original local permanece no diretório do job. O armazenamento aceita objetos de até 2 GB; arquivos maiores falham com diagnóstico, sem fingir que foram entregues.
- DTM e DSM mantêm seus próprios CRS técnicos. Os metadados não presumem uma zona UTM fixa. Quando o EPSG não puder ser identificado, o campo fica vazio em vez de receber um código inventado.
- O relatório JSON guarda a triagem das imagens, CRS e rastreabilidade. A página imprimível mostra os produtos e deixa claro quando não há RMSE de checkpoints independentes.
- Curvas, relevo, hipsometria, declividade e nuvem de pontos dependem do preset. O visualizador 3D depende de WebGPU no navegador.

## Validação desta revisão

Build de produção Next.js, lint, testes Node e Python, triagem local de um lote existente de 93 fotos, e conversão GDAL de uma ortofoto sintética EPSG:31983 para prévia WGS84 e COG. Isso não substitui uma validação de precisão em campo ou um novo processamento completo de fotos.
