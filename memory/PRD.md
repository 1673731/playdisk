# Mi Colección — Product Requirements Document

## Vision
A dark, neon-accented mobile app (React Native / Expo) for tracking a personal video game collection. Users browse their collection, filter by platform, rank favorites, keep a wishlist, search their library, chat with an AI assistant, and add games via barcode scan with a full condition-assessment flow. Freemium monetization with a Premium subscription and rewarded-ad temporary unlocks.

## Users
Single-user collector, no auth. Local per-installation collection stored in MongoDB.

## Key Features
### v1
1. **Home dashboard** with total counter, platform chips filter, "Últimos añadidos" list, plus top badges for Premium status and coins (G).
2. **Library** — 2-column grid with platform filter chips.
3. **Ranking personal** — sorted by 0–10 rating with #1 as a gold hero card.
4. **Wishlist** — list with "Tengo" quick-move to collection.
5. **Buscador** — bottom tab that expands into an inline search input (other tabs hidden). Results appear on the screen above.
6. **Shake to open Buscador** — accelerometer; toggle in Settings.
7. **Ajustes** — shake toggle, Premium entry, app info.
8. **Asistente IA** — Claude Sonnet 4.6 chat modal; knows user's collection stats.

### v2 (previous iteration)
9. **Multi-step Add Game flow** — method picker (Escanear/Manual), barcode scan (expo-camera) with backend lookup, "¿Es este juego?" confirm popup, condition questions ¿Cómo está la caja/manual/disco? (Excelente/Bien/Normal/Mal/Horrible/Sin), price step with "Regalo" toggle, optional description Sí/No, animated success screen. +50 coins per game.
10. **Premium (paywall)** — Monthly (€4,99) / Annual (€39,99, save 33%) plans, feature list (IA ilimitada, escaneos ilimitados, estadísticas, exportar, sin anuncios, temas), "Watch ad → 24h Premium" rewarded unlock. Currently mocked backend (`/api/premium/*`), ready to swap in RevenueCat.
11. **Free-tier limits** — 5 AI messages/day and 3 barcode scans/day for free users; 402 response routes user to /premium.

### v3 (this iteration)
12. **Game Detail** — `/game/[id]` screen (opens by tapping any game card in Home/Library/Ranking/Wishlist). Hero with blurred cover, editable rating stars (0-10), condition chips (caja/manual/disco), inline notes, wishlist toggle, delete with confirmation modal.
13. **Premium Stats** — `/stats` with KPI cards (gasto total, precio medio, total juegos, regalos), plataforma favorita, gráfica mensual (últimos 6 meses), breakdown por plataforma y por estado de caja. Free users see a locked banner + Premium CTA.
14. **Export Colección** — `/export` with CSV (backend `/api/export/csv`) and PDF (backend `/api/export/html` + expo-print/window.print). Uses expo-sharing on native, blob download on web. Premium-gated.
15. **Barcode online lookup** — Backend now falls back to UPCitemdb trial API when the EAN is not in the local seed. Results cached in Mongo. Auto-detects platform from title/category keywords.

## Tech Stack
- Frontend: Expo SDK 54, expo-router, expo-sensors, expo-camera, expo-image, expo-linear-gradient, expo-blur, @expo/vector-icons, expo-haptics, date-fns.
- Backend: FastAPI + Motor (MongoDB async).
- AI: emergentintegrations LlmChat with anthropic/claude-sonnet-4-6.

## Backend Endpoints (/api)
- GET /platforms
- GET /games, GET /games/stats (with total_spent), GET /games/search, GET /games/ranking, GET /games/{id}
- POST /games (extended with box/manual/disc/price/is_gift/description/barcode; awards coins)
- PUT /games/{id}, DELETE /games/{id}
- GET /wishlist
- GET/PUT /settings (includes is_premium, premium_active, coins, daily counters)
- POST /premium/subscribe, /premium/cancel, /premium/reward-unlock
- POST /games/lookup-barcode
- POST /assistant/chat (rate-limited for free users)

## Design
Dark navy (#050614) with indigo/purple glow (#6366F1) and gold Premium accent (#FBBF24). Compact game cards (44×58 covers). Platform chips 42pt logo / 74pt row / horizontal scroll only. Bottom tab bar shows 5 icons except when Buscador is active — then it becomes a full text input. Condition grid is 3×2, auto-advances on tap.

## Monetization
- **Free**: 5 IA msgs/día, 3 escaneos/día, con anuncios (placeholder).
- **Premium**: Todo ilimitado, sin anuncios, temas, exportación.
- **Rewarded ad**: 24h Premium temporal por ver un anuncio (simulado).
- Integración real de pagos (RevenueCat / AdMob) pendiente hasta que el usuario conecte su cuenta y haga native build.
