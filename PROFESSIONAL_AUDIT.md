# Orion Maps — Auditoria profissional v0.4.7

Data: 07/10/2026
Levantamento de validação: 0dcbab7e-224c-4627-a6b3-3e09b7860f49
Processamento: c54701ef-28f7-4861-bdbe-1c7a2b088117
Fotos: 93

## Matriz de estado

| Área | Estado | Evidência / limite |
|---|---|---|
| Login e sessão | FUNCIONAL | Rotas de arquivos pesados passam pelo proxy e renovam sessão quando possível. |
| Ortofoto | FUNCIONAL | Prévia privada leve; original preservado para download. |
| Curvas 0,50 m | FUNCIONAL | Carregamento sob demanda com URL renovada. Outros intervalos ainda não estão registrados como produtos deste job. |
| DTM | FUNCIONAL | Visualização, leitura pontual, análise por polígono e perfil usam o GeoTIFF existente. |
| DSM | FUNCIONAL | Visualização própria do GeoTIFF. |
| Declividade | FUNCIONAL | Classes em %, leitura pontual Horn 3×3, resumo por área e avisos de extremos. |
| Hipsometria e relevo | FUNCIONAL | Camadas sob demanda. |
| Medições | FUNCIONAL | Distância, área, perímetro, edição e salvamento existentes. |
| Perfil de elevação | FUNCIONAL | Distância × altitude, mínimo, máximo, ganho, perda, cobertura e lacunas NoData. |
| Nuvem de pontos | FUNCIONAL COM REQUISITO | URL privada renovada; visualizador exige WebGPU compatível. |
| Relatório | FUNCIONAL | Ortofoto, DTM, DSM, declividade real, produtos e rastreabilidade. |
| Qualidade / rastreabilidade | FUNCIONAL | Job, fotos, engine, produtos, GCP solicitado, presença/ausência de métricas de precisão. |
| Precisão certificada | NÃO DISPONÍVEL | Não há RMSE/checkpoints registrados neste levantamento. Não inventar precisão. |
| Comparação temporal | AUSENTE | Requer fluxo próprio de seleção de dois levantamentos comparáveis. |
| Corte/aterro e volume de projeto | AUSENTE | Requer superfície de referência/projeto definida; não inferir sem ela. |
| NDVI/NDRE | NÃO APLICÁVEL A ESTE LEVANTAMENTO | Não há produto multiespectral registrado. |
| Opacidade/ordem avançada de camadas | PARCIAL | Visibilidade e camadas principais existem; controle completo de opacidade/ordem ainda não foi implementado. |

## Confiabilidade

As URLs assinadas de produtos expiram. A partir desta versão, Curvas, DTM, DSM, relevo, hipsometria, downloads e LAZ obtêm uma URL nova no momento do uso através de rota autenticada com as permissões existentes do usuário.

A página não trata HTTP 400 de URL expirada como falha do processamento.

## Agrimensura e terreno

O desnível exibido é a amplitude do DTM do processamento selecionado: máximo menos mínimo. Não representa altura de voo nem precisão vertical.

A análise de declividade usa o DTM na grade métrica nativa e método Horn 3×3. NoData não vira 0%.

O perfil de elevação amostra o DTM ao longo de uma linha projetada, preservando lacunas sem dados. Ganho e perda somam apenas diferenças entre amostras válidas consecutivas.

Em vegetação, o DTM fotogramétrico é uma estimativa do terreno. Para uso cadastral, divisas, locação, segurança operacional ou finalidade legal, é necessária validação conforme o método e controles apropriados.

## Segurança

Runtime audit após atualização:
- Next.js 16.4.0
- Sharp 0.35.5
- source-map-js 1.2.2 por override
- npm audit --omit=dev: 0 vulnerabilidades

O audit completo ainda apresenta avisos altos em dependências de desenvolvimento/lint ligadas a fast-glob/micromatch/braces; não há versão corrigida de braces publicada no registry verificado durante esta auditoria. Não foi aplicado downgrade incompatível.

## Testes

- 16 testes de análise de terreno e perfil: aprovados.
- 22 testes de medição WGS84: aprovados.
- 14 testes de preview/acesso/gradiente: aprovados.
- ESLint dos arquivos alterados: sem erros/avisos após limpeza.
- TypeScript: aprovado.
- Build de produção Next.js 16.4.0: aprovado.
- QA de interface com arquivos reais do levantamento: 14 verificações aprovadas, incluindo perfil, NoData, 360/390/1440 px e preservação dos hashes.
- Teste autenticado em produção: ortofoto, curvas, DTM numérico, DTM visual e DSM carregaram sem falhas de Storage antes da etapa final desta release.

Os testes de software não certificam a precisão topográfica do levantamento.
