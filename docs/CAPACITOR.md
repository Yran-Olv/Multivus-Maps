# Capacitor

O mesmo frontend vira o app Android e iOS. A UI já passa por `apps/web/src/platform` e não conhece o browser.

Plugins previstos, já declarados em `apps/web`:

- `@capacitor/core`
- `@capacitor/geolocation`
- `@capacitor/network`
- `@capacitor/app`

`apps/web/capacitor.config.json` aponta `webDir` para `dist` e o `appId` é `br.com.multivus.maps`.

## Gerar os projetos nativos

Na raiz, com o build da PWA pronto:

```bash
pnpm --filter @multivus/web build
cd apps/web
npx cap add android
npx cap add ios
npx cap sync
```

Abrir no Android Studio ou no Xcode:

```bash
npx cap open android
npx cap open ios
```

`npx cap open ios` precisa de macOS.

## O que troca sozinho

`createPlatform` olha `Capacitor.isNativePlatform()`.

- localização: `navigator.geolocation` ou `@capacitor/geolocation`
- rede: `navigator.onLine` ou `@capacitor/network`

Compartilhar continua na Web Share API, que o WebView do Capacitor também expõe. Navegação, nesta etapa, só centraliza o mapa. O `RoutingProvider` é o lugar do motor de rotas, não um aplicativo de navegação de terceiro.

## API no app instalado

Na PWA, `VITE_API_URL` vazio usa o mesmo domínio (`/api`). No aplicativo, defina a URL pública antes do build:

```bash
VITE_API_URL=https://maps.multivus.com.br pnpm --filter @multivus/web build
npx cap sync
```

Depois de cada mudança web:

```bash
pnpm --filter @multivus/web build
npx cap sync
```
