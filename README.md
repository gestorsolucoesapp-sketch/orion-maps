# Orion Maps

Plataforma pessoal de fotogrametria e levantamentos com drone. Aplicação publicada em https://orion-maps.vercel.app.

## Recursos implementados

- Next.js App Router, TypeScript e Tailwind CSS.
- Cadastro, login, logout e renovação da sessão com Supabase; área protegida.
- Criação, edição e busca de levantamentos pessoais: área, data, drone e anotações.
- Fotos JPG/PNG em armazenamento privado, até 50 MB por arquivo e 200 arquivos por lote.
- Envio direto por URL assinada, progresso por foto e indicação individual de falhas.
- Consulta de fotos com links temporários, ficha JSON e impressão do levantamento.
- Calculadora de GSD em `/gsd`: resolução por eixo, cobertura, espaçamento de fotos e faixas, intervalo de disparo e altura para uma resolução desejada.
- Banco com RLS: cada usuário acessa apenas seus levantamentos e imagens.

## Executar

Requer Node.js 20.9+ e npm. Copie `.env.example` para `.env.local` e configure a URL e a chave publicável do Supabase. Nunca use service_role no navegador.

```sh
npm ci
npm run dev
```

Validação:

```sh
npm run lint
npm run build
npm start
```

## Banco e armazenamento

A migração `supabase/surveys.sql` cria a tabela de levantamentos e o bucket privado `survey-images`. Aplicar uma única vez após configurar Supabase Auth. A instalação existente já possui profiles e sua política de acesso.

O upload passa diretamente do navegador ao Supabase Storage, sem atravessar o limite de corpo da Vercel. Fotos não ficam no Git. Os limites de armazenamento da conta Supabase continuam valendo. Para lotes grandes, a evolução prevista é upload retomável; nesta versão mantenha a página aberta até concluir. Em falha de rede, confira a lista antes de reenviar para evitar duplicatas.

## Etapas seguintes

Consulte `ESCOPO-PLATAFORMA.md` para o levantamento funcional das ferramentas de referência. Planejamento cartográfico de voo, GCP, conversões, GeoTIFF, medições, compartilhamento e relatórios técnicos ainda serão construídos. Clientes e funções comerciais ficam para depois.

O servidor ODM/NodeODM ainda não existe. O painel identifica essa condição e organiza as imagens para a integração futura. Nenhum mapa ou processamento é simulado. A integração exigirá servidor separado, fila persistente e acompanhamento de tarefas; processamento pesado não rodará na Vercel.

## Segurança e validação

Sem credenciais, fotos ou arquivos de voo no repositório privado. `.env*` é ignorado, exceto `.env.example`. Contratação, cobrança ou ação irreversível exige confirmação do proprietário.

Verificados: quatro testes da geometria GSD (exemplo publicado Pix4D, escala, dois eixos e entradas inválidas), lint, build TypeScript e isolamento RLS de criação, leitura e edição por proprietário, com transação de teste revertida. O fluxo de upload no navegador autenticado requer validação com uma pequena imagem antes de enviar um voo completo.

Testes matemáticos (Node.js 22.6+): `node --experimental-strip-types --test tests/gsd.test.mjs`.

