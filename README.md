# Multivus Maps

Mapa de Santa Juliana/MG feito para entregadores. O cliente fala a rua de um jeito e o mapa oficial conhece de outro. O Multivus Maps resolve os dois nomes para a mesma via, mostra o nome atual e abre o caminho.

Site: [maps.multivus.com.br](https://maps.multivus.com.br)

## O problema

Um morador ainda pede entrega na **Rua Lírios, 120**. O nome atual da via é **Rua Orivaldo José Pires**. O entregador não precisa saber qual dos dois está certo. Ele pesquisa ou cola a mensagem, e o aplicativo identifica a rua.

```text
Qualquer nome que o morador conheça
        ↓
Normalização
        ↓
A mesma rua
        ↓
Nome oficial atual
        ↓
Mapa do celular
```

Cada via tem uma identidade só. Nome antigo é alias, não uma segunda rua.

## O que o entregador usa

- Pesquisa por nome atual, nome antigo, abreviação ou erro pequeno de digitação.
- Aviso quando o texto usa o nome antigo, sem impedir a navegação.
- **Entender endereço**: cola a mensagem do WhatsApp e separa rua, número e referência.
- Favorito guarda o nome oficial e o texto que o cliente escreveu.
- Compartilhamento sai com o nome atual e a linha do nome antigo.
- **IR PARA O LOCAL** abre o mapa do celular. Sem ponto conferido, a busca usa o nome oficial, o número e Santa Juliana.

A troca registrada no mapa da prefeitura de julho de 2021 entra com confiança 70. Ela só vira confirmação local quando um editor marca a rua como verificada.

## Stack

Monorepo pnpm. A PWA é React, Vite, Tailwind e MapLibre. A API é Fastify. O banco é PostgreSQL com PostGIS e `pg_trgm`. O mesmo frontend está isolado do browser para o Capacitor.

| Parte | Onde |
| --- | --- |
| PWA | `apps/web` |
| API | `apps/api` |
| Busca e resolução de endereço | `packages/map-core` |
| Schema e seed | `packages/database` |
| Contratos | `packages/shared` |

O OpenStreetMap é só a geometria de referência. A camada local do Multivus é a fonte do nome, do alias e do ponto de entrega. Nada é escrito de volta no OSM.

## Desenvolvimento

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- PWA: http://localhost:5173
- API: http://localhost:3333/api/v1/health

O `.env.example` vale só na máquina local. Troque senha e segredo antes de qualquer outro ambiente. O administrador do seed só é criado se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos.

```bash
pnpm lint
pnpm test
pnpm build
```

## Produção

O site público é servido em [maps.multivus.com.br](https://maps.multivus.com.br). Postgres e Redis não ficam expostos na internet. O Nginx do servidor encaminha o domínio para o container web, que por sua vez encaminha `/api/` para a API.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Segredos ficam apenas no `.env` do servidor. Esse arquivo não entra no Git.

## Dados

O seed vem de `MAPA SantaJuliana.pdf`, planta do perímetro urbano atualizada em 07/2021. O PDF informa nome oficial, nome antigo, bairro e equipamento. Ele não é georreferenciado, então o seed não inventa latitude nem longitude. Rua sem desenho conferido fica com geometria nula e `verified = false`.

O mapa abre no centro publicado pela Câmara Municipal: 19°18′32″S, 47°31′27″W.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Dados do mapa](docs/MAP_DATA.md)
- [API](docs/API.md)
- [Offline](docs/OFFLINE.md)
- [Capacitor](docs/CAPACITOR.md)
