# Orion Maps · Agente local Windows

Este agente transforma o PC de processamento em um worker da fila privada do Orion Maps.

## Fluxo

1. O usuário seleciona um levantamento em `/processamento` e clica em **Iniciar processamento**.
2. O site cria uma linha em `processing_jobs`.
3. O agente local autenticado consulta `claim_my_processing_job()`.
4. O agente baixa as fotos privadas para `D:\OrionMaps\jobs\<job-id>\images`.
5. NodeODM gera a ortofoto e a nuvem base.
6. PDAL gera classificação de terreno, DTM, DSM e nuvem web.
7. GDAL gera curvas de nível, hillshade, declividade, hipsometria e previews WGS84.
8. Os produtos são enviados ao bucket privado `processing-results`.
9. `processing_results` é preenchida e o job termina em `completed`.

## Requisitos locais

- Windows 10/11
- Python 3.13 já disponível no PATH
- Docker Desktop
- container `orion-nodeodm` em `http://127.0.0.1:3000`
- imagens do levantamento já enviadas ao Orion Maps

## Instalação

Abra o PowerShell na pasta `local-agent` e execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install_agent.ps1
```

O instalador:
- copia os arquivos para `D:\OrionMaps\agent`;
- instala as dependências Python;
- valida o login do Orion Maps;
- salva a senha no Gerenciador de Credenciais do Windows via `keyring`;
- ajusta o container NodeODM para reinício automático;
- cria a tarefa `OrionMapsAgent` no Agendador de Tarefas;
- inicia o agente.

## Verificação

```powershell
Get-ScheduledTask -TaskName OrionMapsAgent
Get-Content D:\OrionMaps\logs\agent.log -Tail 50
```

Para iniciar manualmente:

```powershell
python D:\OrionMaps\agent\orion_agent.py
```

## Segurança

A chave embutida é a chave publicável do Supabase, não uma `service_role`.
O agente autentica como o próprio usuário e continua sujeito às políticas RLS.
A senha fica no armazenamento de credenciais do Windows e não é escrita no repositório nem em arquivo texto.

## Observações técnicas

O processamento pesado continua local. A Vercel apenas cria e exibe a fila.
Os resultados técnicos são preservados no CRS do processamento; previews web são reprojetados para WGS84.
DTM em áreas vegetadas continua sendo uma estimativa fotogramétrica e requer validação antes de uso topográfico ou legal.
