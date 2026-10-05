# Offline

O catálogo mora no IndexedDB, no banco Dexie `multivus-maps`.

Tabelas locais:

- `streets`, `places`, `neighborhoods`: cópia do seed e, quando a API responde, substituição pelos dados do servidor
- `favorites` e `recents`
- `sync_queue`: outbox
- `kv`: sessão e versão do seed

Na primeira abertura, sem API, a busca já encontra "Rua Lírios" como nome antigo de Rua Orivaldo José Pires.

Sem rede o app ainda:

- abre a interface
- busca ruas, favoritos e recentes já gravados
- empilha correção, favorito e ponto de entrega

Quando `NetworkService` volta para `ONLINE` e existe sessão, `flushSyncQueue` envia cada item. Falha aumenta `attempts` e mantém a linha. Sucesso apaga a linha. O servidor deduplica por `clientRequestId`.

O service worker, gerado pelo `vite-plugin-pwa`, guarda o app e usa:

- cache de tiles já vistos do OpenFreeMap, para uma parte do mapa de Santa Juliana funcionar depois
- NetworkFirst no catálogo
- Background Sync no `POST /api/v1/map-corrections`, como reforço da fila do Dexie

Background Sync não existe em todo navegador. A fila do Dexie é a garantia.
