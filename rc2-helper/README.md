# Conectar Orion RC2

Assistente local para Windows. O botão **Enviar plano ao controle** no Orion Maps
envia o trajeto a `127.0.0.1:48765`, onde o assistente faz backup da missão
existente, cria um KMZ no formato do RC 2, substitui o arquivo pelo mesmo nome e
lê de volta para comparar SHA-256. O DJI Fly precisa estar totalmente fechado e
o drone em solo durante a cópia.

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

Fotos por tempo continuam **experimentais** até teste em voo. Fotos por distância
não são aceitas pelo botão. Confira a missão no DJI Fly antes de voar.
