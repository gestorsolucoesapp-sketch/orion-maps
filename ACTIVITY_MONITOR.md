# Orion Maps 0.3.19 — Atividade real

O monitor é um processo auxiliar independente. Não reinicia o agente, Docker ou NodeODM e não cria, cancela, recoloca na fila ou altera o percentual de nenhuma tarefa.

## Fontes e significado

- `GET /task/{uuid}/info`: UUID, estado e percentual interno do NodeODM.
- `GET /task/{uuid}/output?line=...`: novas linhas e etapa reconhecida do motor.
- Inspeção somente de metadados em diretórios fixos do mesmo UUID: quantidade, tamanho e modificação de arquivos intermediários. Os arquivos de imagem/raster não são abertos nem modificados.
- `docker stats --no-stream`: CPU e memória do container; estes valores não medem conclusão de trabalho nem isolam um processo individual.

A contagem de `depth*.dmap` é de arquivos intermediários gravados, não de fotos concluídas. Não presumir que o total esperado seja a quantidade de imagens. Não criar uma barra percentual fictícia a partir dessa contagem. A etapa pode atualizar, substituir ou remover arquivos posteriormente.

## Interpretação conservadora

- Atividade confirmada: arquivo, percentual ou log teve mudança observada recentemente (janela de 120 s).
- CPU em atividade: houve consumo no container; não comprova, sozinho, avanço da reconstrução.
- Sem avanço detectado: após a observação inicial, sem mudanças recentes nos arquivos monitorados e CPU abaixo do limiar de 1%. Não confirma travamento; não dispara cancelamento.
- Monitor sem atualização: amostra com mais de 45 s, com horário inválido ou UUID incompatível não confirma atividade atual.
- Etapa do motor concluída: NodeODM terminou; o pipeline Orion ainda deve gerar/verificar/enviar os produtos.

Coleta aproximadamente a cada 10 s. A página usa o atualizador já existente de 10 s. Falhas deixam a última amostra marcada como atrasada, sem fabricar atividade. Histórico em cada amostra: até 30 pontos e seis eventos. Logs locais têm rotação.

## Banco

Aplicar a migration `supabase/migrations/20261006233500_processing_activity.sql` antes de publicar a interface. Ela acrescenta `processing_jobs.activity` como JSONB e mantém o isolamento por proprietário existente. O monitor autentica a conta já cadastrada no Windows e escreve somente `activity`, com filtros de proprietário, dispositivo, UUID e estado ativo. Ele não escreve `heartbeat_at`, `status`, `progress`, `config` ou `message`.

O trigger existente pode atualizar `updated_at` ao receber telemetria. O frontend continua usando `heartbeat_at` como sinal do agente; a telemetria tem seu próprio `sampled_at`.

## Instalação

Na mesma conta Windows que possui as credenciais Orion, execute uma vez o script `local-agent/install_activity_monitor.ps1` da revisão conferida. Ele instala `OrionMapsActivityMonitor` com execução no logon e privilégio limitado. Somente a tarefa deste monitor pode ser reiniciada pelo instalador; o cálculo principal continua intacto.

Arquivos instalados: `D:\OrionMaps\activity-monitor\bin`. Log: `D:\OrionMaps\logs\activity.log`. A instalação é separada da atualização do agente principal e precisa ser reaplicada quando houver mudanças no monitor. O agente principal pode permanecer na 0.3.18 durante o trabalho em andamento; monitor e interface são 0.3.19.

## Validação

```text
python -m unittest discover -s tests -p "test_agent*.py"
node tests/test-processing-activity.cjs
npm run build
```

O teste de navegador deve verificar login, painel principal e processamento, contagem real, mudança de `data-sampled-at` sem recarga manual e larguras de 360, 390 e 1440 pixels. Nunca usar apenas heartbeat para afirmar que o cálculo avançou.

## Referências técnicas

NodeODM API: https://github.com/OpenDroneMap/NodeODM/blob/master/docs/index.adoc
Docker métricas: https://docs.docker.com/reference/cli/docker/container/stats/
