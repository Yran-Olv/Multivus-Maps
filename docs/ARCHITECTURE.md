# Arquitetura

Multivus Maps é um monorepo pnpm. A PWA em `apps/web` e a API em `apps/api` compartilham tipos, normalização e o schema do banco.

```
apps/web          PWA React/Vite, pronta para Capacitor
apps/api          Fastify
packages/shared   Zod, papéis, rótulos
packages/map-core normalização, busca local, RoutingProvider
packages/database Drizzle, SQL e seed
packages/offline  Dexie e fila sync_queue
packages/services contratos de localização, rede, storage, share e navegação
packages/ui       mapa, busca, bottom sheet e navegação
```

## Camadas do mapa

O OpenStreetMap, via estilo OpenFreeMap, é só a cartografia de referência. A camada **Multivus Local** desenha a geometria que existir em `streets.geometry`. Nome, nome antigo, bairro, sentido, conversão e ponto de entrega vêm do PostgreSQL/PostGIS. Nada é escrito de volta no OpenStreetMap.

## Verdade local

Uma rua pode existir sem linha. `verified = false` e `geometry = null` significam que o nome foi lido de uma fonte cadastral e ainda não foi conferido em campo. Quem confirma fica em `verified_by` e `verified_at`. Cada mudança administrativa gera `audit_logs`.

## Plataforma

A interface não chama `navigator`, `window` nem `localStorage`. Isso fica em `apps/web/src/platform`. No browser entram os adapters web. Se `Capacitor.isNativePlatform()` for verdadeiro, localização e rede passam a usar os plugins. O contrato mora em `@multivus/services`.

## Rota

`RoutingProvider.calculateRoute` e `calculateMultiStopRoute` existem para encaixar Valhalla, OSRM ou GraphHopper. A implementação atual responde `not_implemented`. O botão IR centraliza o mapa quando já existe coordenada e explica quando não existe.

## Offline

O catálogo inicial é gravado no IndexedDB. Correções, favoritos e pontos de entrega entram na `sync_queue` local antes de qualquer rede. O envio usa `POST /api/v1/sync` com `clientRequestId`, então repetir não duplica.
