# Turnside

A conversation-first trip and day planner. The NYC demo includes an animated neighborhood density map, visual place cards with sources, an editable itinerary, and a coherent white, Apple-blue, coral and mint brand system.

## Open the prototype

On this Mac, double-click `start.command`, then open **http://localhost:4173**. This workspace already has dependencies and a production build.

On another computer, install Node.js 22.12+ or 24+, then run:

```sh
npm install
npm run build
npm start
```

Copy `.env.example` to `.env.local`; `PORT=4173` keeps the same URL. Without a port setting the server uses 3000. `npm run dev` starts development. Internet access is needed for map tiles, public datasets, weather and Google Maps.

## A two-minute walkthrough

1. Start in **Plan with AI**. Choose “Coffee & quiet corners” or describe an afternoon. Without keys, this is a clearly labeled sample conversation; with a configured Gemini key, it uses live grounded recommendations.
2. Explore the visual recommendation cards and their sources. Choose places, then select **Make this my day**. The itinerary uses those exact places rather than substituting unrelated venues.
3. Open **My itinerary**. Select a stop for details and directions, mark it visited, or try **Running a little late?** to adjust the remaining day.
4. Open **Hot areas**. The glows animate gently. Compare Food scene, Culture and Outdoors; select SoHo, Greenwich Village or another area. Its panel shows coffee, shops and cultural detours as cards, with venue evidence and clearly labeled photos. Expand **Why this pick & sources** to inspect provenance.
5. Add a detour to the day. Without an active stop it appends after the existing itinerary. **What’s worth a detour here?** starts a neighborhood-focused conversation. **Find a good detour** lets you ask for a spontaneous change.
6. Export the day to a calendar or continue to an official ticket provider. Purchases and reservations are never simulated. Settings expose connection status, reset the sample, and open the brand kit.

## Connect Gemini and Google

Open **http://localhost:4173/setup.html** for the connection guide. Keep all private keys in `.env.local`, then restart the server. Never paste a private key into this browser app or use a `VITE_*` variable.

- `GEMINI_API_KEY` enables grounded typed conversation and **Talk with Gemini**, the real Gemini Live voice session with captions, mute, interruption, reconnect, and discovery/planning tools. Adding the key enables live conversation by default; Settings can switch typed planning back to Demo.
- Recorded microphone input is transcribed with **Gemini 3.8 Flash**. The transcript can be reviewed before sending. **Listen** generates WAV speech through **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`). Live conversation uses `gemini-3.8-live`. Voice requires a real key and uses provider credits even while typed planning is in Demo.
- Private `GOOGLE_MAPS_SERVER_KEY` (or separate Places/Routes keys) provides authoritative place coordinates, reviews, hours and street routes. Grounded citations without resolved locations remain explorable but cannot be scheduled.
- Optional, restricted `GOOGLE_MAPS_BROWSER_KEY` enables the full custom Google basemap and overlays. The intentionally public browser key is separate from private server keys.

No provider account was configured during delivery, so real Gemini/Places/Routes sessions remain unverified. The app does not substitute browser speech or pretend a sample response is Gemini.

## Maps and trustworthy signals

The keyless local map uses Stadia Alidade Smooth over OpenStreetMap data, with attribution and an OSM fallback. Stadia's keyless allowance applies to localhost; on another host the prototype uses OSM unless an appropriate provider is configured. The **Google Maps** button opens an actual embedded Google map without an application key. A Google-derived itinerary without a custom Google browser key uses the Google viewer; Google route geometry stays on Google maps.

NYC hot areas measure **mapped place density**, using official DOHMH restaurant records and Department of City Planning facilities. IDs are deduplicated and counts normalized by each geographic window's area. The app exposes source links, retrieval dates, inventory dates, category counts and transparent fallbacks. This is not live crowds, Google's Popular Times, TikTok rankings or Google search volume.

The neighborhood panels contain 14 editorial picks checked against first-party venue/location sources. Two images are venue imagery; the rest are labeled representative photos. TikTok links are external searches, not retrieved social evidence. Optional live Google review lookups accept only matching venue identities/branches and never invent missing ratings. Gemini Search grounding can surface cited recommendations, but a search result is not a measured trend signal. Google Trends requires separate approved access.

## Brand assets

Open **http://localhost:4173/brand-kit/index.html**. The kit includes primary/reversed wordmarks, blue/monochrome symbols, a cover, typography, colors, spacing, components, voice guidance, and reusable JSON/CSS tokens. The app and kit share the same core palette.

## Verification and teammate integration

```sh
npm run lint
npm test
npm run build
```

The delivered version passes **43 automated checks**, TypeScript validation and a production build. Browser QA covered conversation → selected places → itinerary, hot-area cards/evidence → add a detour, the keyless Google viewer, and desktop/400px phone layouts. The initial app bundle is split from map code. Mocked provider tests verify contracts and cleanup, not account connectivity.

The supplied Sidequest project informed the grounded recommendations → Places → Routes architecture and secure Live voice flow. These fit the existing React/Express app; its separate database/worker stack was not imported. See `INTEGRATIONS.md` for contracts and official references.

## Scope before a public launch

This is a high-fidelity local prototype with a production build, not a deployed booking service. A public release still needs account authentication, user-scoped storage, provider/account verification, deployment controls and licensed production map access. Automatic ticket inventory, purchase/refund handling and payment processing are not integrated; current ticket actions hand off to the official provider.

The archive includes source, tests, brand assets and the built app. It excludes private environment files, installed dependencies and temporary verification artifacts. Install dependencies before launching an extracted copy.
