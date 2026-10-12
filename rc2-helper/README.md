# Conectar Orion RC2

Assistente local para Windows. O botão **Enviar ao RC 2 ↗** no Orion Maps
envia o trajeto a `127.0.0.1:48765`, onde o assistente faz backup da missão
existente, cria um KMZ no formato do RC 2, substitui o arquivo pelo mesmo nome e
lê de volta para comparar SHA-256. O DJI Fly precisa estar totalmente fechado e
o drone em solo durante a cópia.
Não é necessário baixar ou abrir uma prévia do KMZ antes de enviar. Salvar o
projeto é uma operação independente.

## Instalação neste computador

Abra PowerShell nesta pasta e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

O instalador usa o Python já existente, copia os scripts para
`D:\OrionMaps\rc2-helper`, cria **Conectar Orion RC2** na área de trabalho e na
inicialização do Windows e inicia o assistente em segundo plano. Os backups e
comprovantes ficam em `D:\OrionMaps\rc2-transfers`.

O assistente escuta apenas o loopback local e aceita pedidos do domínio de
produção do Orion Maps. Ele não decola nem controla o drone. O ponto H serve à
estimativa de ida e retorno; o Home real é definido no DJI Fly.

## Atualização do assistente no PC

O assistente já instalado com `protocolVersion: 2` aceita o intervalo único:
uma geração offline a partir de um backup nativo produziu o grupo do primeiro
ao último waypoint. Esta versão de `mission.py` adiciona validação do intervalo
único e posiciona a ação de gimbal no início da captura caso haja pontos
anteriores a ela. Para atualizar o assistente em outro momento, feche
**Conectar Orion RC2** antes de executar novamente o
`install.ps1`; ele atualiza os arquivos em `D:\OrionMaps\rc2-helper` e reinicia o
processo local. O botão do site consulta `/health` e bloqueia o envio quando o
assistente instalado não informa `protocolVersion: 2`. Não há código a instalar
no controle. A missão só entra no RC 2 quando o usuário inicia uma
transferência separada e confirma a operação.

Fotos por tempo continuam **experimentais**: o arquivo foi conferido, mas o
intervalo não foi comprovado no Mini 5 Pro/DJI Fly. Fotos por distância
não são aceitas pelo botão. Confira a missão no DJI Fly antes de voar.
