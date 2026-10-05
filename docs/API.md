# API

Base: `/api/v1`

## Público

| Método | Caminho | Uso |
| --- | --- | --- |
| GET | `/health` | processo no ar |
| GET | `/ready` | banco responde |
| POST | `/auth/login` | JWT de acesso e refresh |
| POST | `/auth/refresh` | gira o refresh token |
| POST | `/auth/logout` | revoga o refresh token |
| GET | `/cities` | Santa Juliana |
| GET | `/neighborhoods` | bairros |
| GET | `/places` | praças e equipamentos |
| GET | `/streets` | ruas e aliases |
| GET | `/streets/:id` | detalhe, com GeoJSON |
| GET | `/search?q=` | resolve nome atual ou antigo para a mesma rua |

A busca ignora acento, maiúsculas, pontuação, tipo (`Rua`, `R.`, `Av.`) e qualificadores como `antiga`. O número da casa é separado antes da comparação. `pg_trgm` aceita erro pequeno. O resultado traz `warning`, `usedOldName`, `oldNames` e `confidence`. Favorito e ponto de entrega podem guardar `customerInput` e `matchedAlias` junto do nome oficial.

## Conta

| Método | Caminho | Papel |
| --- | --- | --- |
| GET | `/auth/me` | autenticado |
| POST | `/map-corrections` | cria `PENDING` |
| POST | `/sync` | drena a fila offline |
| GET/POST | `/favorites` | favoritos |
| DELETE | `/favorites/:id` | remove favorito |
| GET/POST | `/recent-searches` | histórico |
| GET/POST | `/delivery-locations` | ponto de entrega do entregador |

## Edição

Exige `EDITOR` ou `ADMIN`, conforme a ação.

| Método | Caminho |
| --- | --- |
| POST | `/streets` |
| PATCH | `/streets/:id` |
| DELETE | `/streets/:id` |
| POST | `/street-aliases` |
| POST | `/street-segments` |
| POST | `/turn-restrictions` |
| POST | `/neighborhoods` |
| POST | `/places` |
| GET | `/admin/stats` |
| GET | `/admin/map-corrections` |
| POST | `/admin/map-corrections/:id/approve` |
| POST | `/admin/map-corrections/:id/reject` |
| GET | `/admin/audit-logs` |
| POST | `/admin/users` |

Aprovar uma correção muda o status e grava auditoria. Não reescreve a rua sozinho: o editor aplica o dado no `/admin/mapa`.

Senha com Argon2id. Access token de 15 minutos. Refresh token de 30 dias, guardado só como hash, e trocado a cada uso. Limite de taxa global e um limite menor no login.
