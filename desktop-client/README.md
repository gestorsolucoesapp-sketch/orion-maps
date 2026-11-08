# Orion Maps para Windows

Este diretório gera um aplicativo Windows que abre o Orion Maps publicado em `https://orion-maps.vercel.app`. A interface, o login e os dados são servidos pelo site. O instalador não inclui o motor de fotogrametria; o processamento só fica disponível quando um agente autorizado está conectado à conta.

## Construir

No Windows, execute `npm ci` e `npm run make` neste diretório. O instalador é gerado em `out/make/squirrel.windows/x64/OrionMapsSetup.exe`.

Este é um piloto **sem assinatura digital**. Para distribuição pública, configure assinatura Authenticode, um canal de atualizações do aplicativo e a infraestrutura de processamento para múltiplas contas. Atualizações da interface publicada aparecem sem reinstalar o programa; atualizações do Electron exigem um novo instalador.

O instalador não modifica `D:\OrionMaps`, o banco local ou tarefas em andamento no Pcmaquinas.
