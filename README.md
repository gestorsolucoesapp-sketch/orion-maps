# Orion Maps

Plataforma própria de fotogrametria e gestão de levantamentos com drone.

## Estado atual

Base com Next.js (App Router), TypeScript e Tailwind CSS conectada ao Supabase. O MVP já inclui cadastro por e-mail, login, logout, renovação de sessão, rota protegida e leitura do perfil com RLS. Clientes, projetos, upload, mapas e processamento ainda serão implementados. Nenhum serviço da Vercel foi criado.

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

1. Modelar clientes e projetos com persistência e políticas de acesso por proprietário.
2. Construir as telas para cadastrar e acompanhar clientes e projetos.
3. Definir armazenamento, limites e upload de fotos antes de aceitar arquivos reais.
4. Integrar OpenDroneMap/NodeODM em infraestrutura separada, com fila e acompanhamento de processamento.
5. Exibir ortomosaicos em mapa, adicionar medições e relatórios.
6. Orientar a publicação na Vercel após validar as integrações.

Supabase, MapLibre e NodeODM são decisões planejadas, não integrações já instaladas. O processamento fotogramétrico pesado ficará separado da aplicação web. MDS/MDT, nuvem de pontos, 3D, volumetria, GCP e comparação temporal ficam para fases posteriores.

## Segurança e custos

Repositório privado. Não adicionar credenciais, arquivos de voo ou fotos ao Git. Arquivos `.env*` são ignorados. Qualquer contratação, cobrança ou ação irreversível exige confirmação do proprietário.
