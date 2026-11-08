# Distribuição do Orion Maps para clientes

## Estado do piloto

- `OrionMapsSetup.exe` instala a interface Windows que abre o Orion Maps publicado.
- O aplicativo usa HTTPS, isola o conteúdo remoto do Node.js e bloqueia navegação para esquemas não confiáveis.
- O executável atual não está assinado e não possui canal automático de atualização do Electron.
- O processamento completo ainda exige um agente conectado à conta. O agente atual do Pcmaquinas usa `claim_my_processing_job` e recebe apenas tarefas de seu próprio usuário.

## Arquitetura recomendada para distribuição

1. **Cliente Windows:** aplicativo leve que usa a versão hospedada, com autenticação por conta. Nenhuma chave de serviço ou credencial de processamento entra no instalador.
2. **Serviço de processamento:** fila central e trabalhadores Linux dedicados. Cada trabalho recebe acesso limitado aos arquivos de seu proprietário; a conta do trabalhador é separada das contas dos clientes. O motor pode continuar em contêiner no servidor, sem exigir Docker no computador do cliente.
3. **Dados:** Supabase hospedado para login, projetos, fila e arquivos, com políticas de acesso por proprietário e backups definidos. Dados do Supabase local do Pcmaquinas precisam de migração planejada e verificada antes de qualquer desativação.
4. **Distribuição:** assinatura Authenticode, publicação do instalador em canal oficial e atualizador do aplicativo com verificação de assinatura. A interface web já se atualiza pelo deploy do site; o runtime Electron requer atualizações próprias.
5. **Operação:** limites por conta para fotos, armazenamento e concorrência; medição de custo por trabalho; alertas de falha; retomada sem duplicar tarefas.

## Critérios para chamar de versão pronta para clientes

- Instala e desinstala em Windows 10/11 limpo sem exigir Node.js, Python ou Docker no computador do cliente.
- Abre, autentica, planeja voo e mantém sessão após reiniciar o programa.
- Envia fotos, processa uma tarefa em um trabalhador central e entrega os produtos somente ao proprietário.
- Mostra progresso real, detecta trabalhador offline e retoma tarefas após falha do servidor.
- Atualiza o aplicativo com assinatura verificada; conserva dados de usuário durante atualização/desinstalação.
- Passa por ensaio com duas contas separadas, inclusive tentativas de acessar arquivos e trabalhos da outra conta.

O piloto atual comprova a instalação e a abertura da interface. Ele ainda não satisfaz os critérios de processamento multiusuário, assinatura e atualização automática.
