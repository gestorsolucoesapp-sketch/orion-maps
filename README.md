# Orion Maps

Plataforma própria de fotogrametria e gestão de levantamentos com drone.

## Estado atual

Base mínima com Next.js (App Router), TypeScript, Tailwind CSS e ESLint. A página inicial apresenta o produto e as etapas previstas. Ainda não há autenticação, banco, upload, mapas ou processamento implementados. Nenhum serviço de Supabase ou Vercel foi criado.

## Executar localmente

Requer Node.js 20.9 ou superior e npm.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000.

Verificação e execução em produção:
```sh
npm run lint
npm run build
npm start
```

## Próximas etapas

1. Orientar a configuração do Supabase: região, plano, autenticação, modelo de clientes/projetos e políticas de acesso por usuário.
2. Implementar login, clientes e projetos com persistência e isolamento de dados.
3. Definir armazenamento, limites e upload de fotos antes de aceitar arquivos reais.
4. Integrar OpenDroneMap/NodeODM em infraestrutura separada, com fila e acompanhamento de processamento.
5. Exibir ortomosaicos em mapa, adicionar medições e relatórios.
6. Orientar a publicação na Vercel após validar as integrações.

Supabase, MapLibre e NodeODM são decisões planejadas, não integrações já instaladas. O processamento fotogramétrico pesado ficará separado da aplicação web. MDS/MDT, nuvem de pontos, 3D, volumetria, GCP e comparação temporal ficam para fases posteriores.

## Segurança e custos

Repositório privado. Não adicionar credenciais, arquivos de voo ou fotos ao Git. Arquivos `.env*` são ignorados. Qualquer contratação, cobrança ou ação irreversível exige confirmação do proprietário.
