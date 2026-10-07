# Inclinação do terreno — v0.4.5

## Uso no Orion Maps

No mapa de resultados, ative Declividade ou use o bloco Inclinação em % e o botão Consultar % no mapa. Toque no terreno para ler a inclinação local e a elevação da célula do DTM. A consulta também pode ser usada sobre a ortofoto ou outras camadas.

Fixar este ponto adiciona uma etiqueta com a porcentagem. São permitidos até 20 pontos na sessão, sem duplicar a mesma célula. É possível esconder, restaurar e remover etiquetas. Essas marcações não são gravadas automaticamente na conta: exporte a análise para guardá-las.

Desenhar área abre a régua existente. Marque pelo menos três vértices e use Analisar inclinação da área. O resumo contém média dos valores válidos, mínima, máxima local, cobertura válida estimada, área sem dados e distribuição em hectares e porcentagem por faixa. Enquanto a régua está aberta, os toques desenham o contorno, não consultam pontos. Feche a medição para voltar à consulta pontual. Alterar o contorno invalida o resumo anterior e exige uma nova análise. O salvamento existente da régua continua disponível para guardar o contorno na conta.

Baixar análise GeoJSON exporta pontos fixados e, quando disponível, o polígono com seu resumo. Relatório da seleção / PDF abre um relatório próprio da seleção com botão Imprimir / Salvar em PDF. Ele não substitui o relatório completo do levantamento. Os dois incluem a identificação do resultado DTM, do processamento e do levantamento, sem URLs assinadas ou credenciais.

## Método e limites

A leitura usa o DTM original existente, com transformação das coordenadas WGS84 para a grade métrica nativa. A elevação é a da célula selecionada; a inclinação é a magnitude do gradiente local de maior declive, calculada pelo método Horn em uma vizinhança 3×3. Não é uma medição entre dois pontos nem a diferença entre os extremos de elevação da propriedade.

A análise de área considera as células cujo centro está dentro do polígono. A média usa somente inclinações válidas; as áreas por classe resultam da contagem de células multiplicada pela área horizontal da célula. A cobertura e as áreas nas bordas são aproximadas. As porcentagens de cada classe têm como denominador a parte válida, não a área total. Não se calcula área de superfície inclinada.

Pontos fora da cobertura, células NoData e vizinhanças incompletas são informados como indisponíveis, nunca como 0%. A fonte não é suavizada, interpolada, recortada nem modificada. Extremos acima de 100% recebem aviso para revisão de transições abruptas e qualidade do modelo, sem exclusão silenciosa desses valores. Grades incompatíveis são recusadas para a consulta numérica.

Todos os resultados são estimativas derivadas do DTM. Não certificam a precisão do levantamento e não validam segurança de máquinas, aptidão agronômica ou limites legais. A conferência do software não substitui a validação técnica do modelo de terreno.

## Desempenho e preservação

O DTM só é solicitado quando a camada ou a consulta precisa dele. O mapa colorido e a leitura numérica compartilham o mesmo carregamento, evitando novo download. A primeira abertura da ortofoto permanece usando sua prévia leve. Nenhum processamento, fotografia, registro de resultado, arquivo DTM/DSM ou objeto de armazenamento é alterado por esta funcionalidade. Os arquivos originais permanecem disponíveis.

## Verificação realizada

Passaram 49 testes automatizados: 13 de análise do terreno, 22 de medições e 14 de prévia/acesso/gradiente. TypeScript, verificação de estilo dos arquivos alterados e compilação de produção passaram.

Também passaram 13 verificações de interface em ambiente local isolado, usando os componentes reais e arquivos existentes do levantamento: leitura por toque, correspondência com a coordenada efetivamente clicada, etiquetas e deduplicação, ocultar/restaurar, compartilhamento do DTM, ausência de conflito com a régua, estatísticas da seleção, GeoJSON, relatório imprimível, invalidação ao editar, ausência de dados, larguras de 360/390/1440 pixels e preservação dos hashes dos arquivos. Nenhum erro de navegador foi registrado. As ações de conta foram isoladas nesses testes e não efetuaram gravações.

Esses testes não equivalem a um teste autenticado da interface de produção nem a uma medição de desempenho no iPhone do usuário. A prontidão da publicação e a versão pública são verificadas separadamente.
