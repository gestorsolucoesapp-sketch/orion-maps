# Orion Maps · Agente local Windows

O agente consulta a fila privada do Orion Maps e executa o processamento no computador Windows. O uso diário é pela página **Processamento** do aplicativo. Os comandos abaixo servem para instalar ou atualizar o processador local.

## Requisitos

- Windows 10/11, na mesma conta Windows usada na instalação anterior.
- Python 3.13 disponível no `PATH`.
- Docker Desktop e NodeODM disponíveis em `http://127.0.0.1:3000`, ou no endereço já definido por `ORION_NODEODM_URL`.
- Acesso ao Orion Maps e, para atualização, ao repositório público `gestorsolucoesapp-sketch/orion-maps` no GitHub.

## Atualizar uma instalação existente

No **Pcmaquinas**, abra PowerShell na pasta `local-agent` de uma cópia atual do projeto e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\update_agent.ps1
```

Depois da primeira atualização, o comando fica disponível no diretório instalado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\OrionMaps\agent\update_agent.ps1
```

O atualizador resolve `main` uma vez para um SHA de commit. Todos os arquivos são baixados dessa mesma revisão, conferidos contra seus hashes Git e analisados quanto à sintaxe Python e PowerShell antes da instalação. Para uma revisão específica, acrescente `-Revision <SHA-do-commit>`.

Durante a atualização:

- A senha existente é lida do `keyring` da conta Windows. Não há novo pedido de senha e `setup_credentials.py` não é executado.
- O instalador exige ausência de tarefas na fila ou em processamento na conta Orion Maps e verifica se o NodeODM está ocioso. Jobs históricos `error`, `completed` e `cancelled` não bloqueiam a manutenção. Falhas de leitura de estado interrompem a atualização.
- Agentes manuais identificados são informados pelo PID e não são encerrados. O script não mata processos Python genéricos.
- Somente a tarefa agendada `\OrionMapsAgent` pode ser parada. O estado é consultado novamente após a parada.
- Os scripts anteriores recebem backup em `D:\OrionMaps\agent-backups\<data-identificador>`. Fotos, jobs, produtos e volumes do NodeODM não são apagados ou movidos.
- O pacote instala `orion_agent.py` e `orion_agent_staged.py`. A tarefa usa `run_agent.py`, um launcher que configura a raiz local e chama a implementação principal.
- Após a atualização, o início da tarefa é solicitado. Uma tarefa que já estava desativada permanece desativada. Em falha durante a substituição, os scripts anteriores são restaurados; se a tarefa já foi parada, permanece parada para revisão do erro.

Um agente manual ou processamento ativo deve terminar antes da manutenção. Aguarde a conclusão e confira o estado do processamento e os logs antes de tentar novamente. A atualização não cria jobs, não recoloca jobs na fila e não reinicia trabalhos cancelados.

O marcador temporário `agent\maintenance.json` impede novas capturas de tarefas nas versões do agente que oferecem esse suporte. Versões antigas ainda dependem das verificações antes e depois da parada. Não remova o marcador enquanto outro atualizador estiver aberto.

Se já possui um pacote completo e conferido em outra pasta, pode instalar diretamente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_agent.ps1 -UpdateOnly
```

`-UpdateOnly` reutiliza as dependências Python instaladas. Se estiverem ausentes, a atualização para sem substituir scripts. O instalador não modifica políticas globais do PowerShell, configurações do Docker ou credenciais. O parâmetro `-ExecutionPolicy Bypass` aplica-se apenas àquele processo; políticas corporativas obrigatórias continuam prevalecendo.

## Instalação inicial

Com o NodeODM ocioso e antes de criar um processamento no aplicativo, abra PowerShell na pasta `local-agent` do projeto completo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_agent.ps1
```

A instalação inicial instala as dependências, valida o login informado e guarda a senha no Gerenciador de Credenciais do Windows via `keyring`. Em seguida, copia os scripts, registra `OrionMapsAgent` para o logon da mesma conta Windows e solicita seu início. Uma instalação existente exige `-UpdateOnly`, evitando repetir a configuração de credenciais.

## Verificar a atualização

```powershell
Get-ScheduledTask -TaskName OrionMapsAgent -TaskPath '\'
Get-Content D:\OrionMaps\agent\installed_revision.txt
Get-Content D:\OrionMaps\logs\agent.log -Tail 50
```

`installed_revision.txt` contém o SHA quando o pacote veio do atualizador. Na instalação direta sem `-Revision`, recebe `pacote-local-sem-revisao-Git`, evitando apresentar uma revisão antiga como nova. Confirme o processador **online** no aplicativo e confira a versão registrada na inicialização em `agent.log`. O estado “Running” da tarefa agendada, sozinho, não confirma a conexão com o aplicativo.

**Validação no Windows:** os scripts precisam ser executados no computador de processamento. A análise de código ou sintaxe fora dele não confirma acesso ao `keyring`, associação dos processos à tarefa agendada ou início efetivo do agente no Windows.

## Processamento

1. O usuário solicita o processamento do levantamento no aplicativo.
2. O agente autenticado obtém um job elegível com `claim_my_processing_job()`.
3. As imagens são baixadas para `D:\OrionMaps\jobs\<job-id>\images`.
4. NodeODM gera os produtos-base; PDAL/GDAL geram os produtos derivados configurados.
5. Os produtos são enviados ao bucket privado `processing-results`, e seus registros são salvos em `processing_results`.

O processamento pesado permanece local. Os produtos técnicos mantêm seu sistema de coordenadas; as prévias web são preparadas em WGS84. A chave embutida no agente é publicável, e a autenticação usa a conta do próprio usuário. A senha não é armazenada nos scripts ou no repositório.
