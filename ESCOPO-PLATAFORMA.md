# Orion Maps: plataforma pessoal

Prioridade do proprietário: ferramentas para uso próprio antes de clientes e funções comerciais. Servidor ODM/NodeODM ainda inexistente; conexão fica para depois.

Referência funcional: telas acessíveis do Maps4meConnect consultadas em 19/09/2026. Implementação própria, sem acesso ao código-fonte da referência.

| Módulo | Recursos observados | Dependências |
|---|---|---|
| Voo | Waypoints, grid, dupla grade, corredor, oblíquo, fachada, POI, sobreposição, importação/exportação KML/KMZ/CSV, terreno | Geometria testada, câmeras verificadas, WPML validado por drone/controle |
| GCP | Área/corredor, pontos automáticos/manuais | Datum explícito, separar controle e verificação |
| GSD | Altitude, câmera, parâmetros personalizados | Não confundir resolução com acurácia |
| Geoespacial | GeoTIFF, EPSG, medidas, vetores, memorial, projetos locais | Leitura de rasters por janelas e projeções validadas |
| Compartilhamento | Ortofoto e link com validade | Arquivos privados e URLs temporárias |
| Fotogrametria | Ortofoto, relatório, MDT/MDS, LAZ, GCP | Worker separado da Vercel e fila persistente |
| Altitudes | GPS EXIF e modelo geoidal | Verificar referência altimétrica e modelo oficial |
| Conversão | Decimal, GMS, UTM, PPP IBGE | Datum, época e zona explícitos |
| GNSS | Estação externa | Hardware e protocolo a definir; tela de licença insuficiente |

## Sequência
1. Levantamentos persistentes, upload privado e ficha exportável.
2. Planejamento cartográfico e GSD.
3. GCP, conversões e GeoTIFF com medidas.
4. Processamento real quando o servidor estiver disponível.
5. Compartilhamento e relatórios finais.

Não apresentar resultados fictícios nem prometer compatibilidade de voo sem ensaios. Clientes, anúncios e assinaturas ficam fora desta fase.

Implementado nesta etapa: levantamentos e imagens privadas; calculadora GSD com câmera personalizada, cobertura e sobreposição. A calculadora não exporta missões de voo.
