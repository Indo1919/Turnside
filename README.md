# Turnside

A conversation-first trip and day planner. The NYC demo includes an animated neighborhood density map, visual place cards with sources, an editable itinerary, and a coherent white, Apple-blue, coral and mint brand system.

## Hosting support

The app is on GitHub and has not been published as a hosted website. The prepared hosting build supports the same conversation, neighborhood discovery, itinerary and calendar flows in a browser on another computer. Once published, viewers do not install Node.js or supply API keys. The public demo uses editorial recommendations, public NYC inventory data, Open-Meteo weather and keyless maps. Live Gemini planning and voice require the owner to configure private runtime credentials; public hosted AI also requires native ChatGPT sign-in.

The hosting build serves the client and API together. It does not turn the app into a static site with missing backend routes. A deployment URL is supplied after a successful publish.

## Run locally

On this Mac, double-click `start.command`, then open **http://localhost:4173**. This workspace already has dependencies and a production build.

On another computer, install Node.js 22.12+ or 24+, then run:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Copy `.env.example` to `.env.local`; `PORT=4173` keeps the same URL. Without a port setting the server uses 3000. `pnpm dev` starts development. Internet access is needed for map tiles, public datasets, weather and Google Maps. The local server remains available independently of hosting.

## A two-minute walkthrough

1. Start in **Plan with AI**. Choose “Coffee & quiet corners” or describe an afternoon. Without keys, this is a clearly labeled sample conversation; with a configured Gemini key, it uses live grounded recommendations.
2. Explore the visual recommendation cards and their sources. Choose places, then select **Make this my day**. The itinerary uses those exact places rather than substituting unrelated venues.
3. Open **My itinerary**. Select a stop for details and directions, mark it visited, or try **Running a little late?** to adjust the remaining day.
4. Open **Hot areas**. The glows animate gently. Compare Food scene, Culture and Outdoors; select SoHo, Greenwich Village or another area. Its panel shows coffee, shops and cultural detours as cards, with venue evidence and clearly labeled photos. Expand **Why this pick & sources** to inspect provenance.
5. Add a detour to the day. Without an active stop it appends after the existing itinerary. With an active stop it fits into the remaining schedule; confirmed reservations and visited/skipped history stay fixed, and collisions are explained before changing anything. **What’s worth a detour here?** starts a neighborhood-focused conversation. **Find a good detour** lets you ask for a spontaneous change.
6. Export the day to a calendar or continue to an official ticket provider. For a destination without a resolved timezone, choose its timezone before exporting. Purchases and reservations are never simulated. Settings expose connection status, reset the sample, and open the brand kit.

## Connect Gemini and Google

Open **/setup.html** on the app's origin for the connection guide. Locally, keep private keys in `.env.local` and restart the server. For hosting, the site owner adds private keys as runtime secrets, never to frontend build variables or the source archive. Never paste a private key into this browser app or use a `VITE_*` variable.

- `GEMINI_API_KEY` enables grounded typed conversation and **Talk with Gemini**, the real Gemini Live voice session with captions, mute, interruption, reconnect, and discovery/planning tools. Select **Live AI** in Connections for typed planning, or set `AI_MODE=live` as the default. Voice uses the connected provider independently of the typed-planning mode.
- Recorded microphone input is transcribed with **Gemini 3.8 Flash**. The transcript can be reviewed before sending. **Listen** generates WAV speech through **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`). Live conversation uses `gemini-3.8-live`. Voice requires a real key and uses provider credits even while typed planning is in Demo.
- Private `GOOGLE_MAPS_SERVER_KEY` (or separate Places/Routes keys) provides authoritative place coordinates, reviews, hours and street routes. Grounded citations without resolved locations remain explorable but cannot be scheduled.
- Optional, restricted `GOOGLE_MAPS_BROWSER_KEY` enables the full custom Google basemap and overlays. The intentionally public browser key is separate from private server keys.
- Hosted live Gemini requests require ChatGPT sign-in before using provider credits. The native **Sign in to use Gemini** link handles this; Turnside does not collect account passwords.
- `RECOMMENDATION_SIGNING_SECRET` signs short-lived selections so a chosen recommendation can be validated by a different hosted server instance. Use a private random value of at least 32 characters. It is configured as a hosted runtime secret; local setup can omit it.

Provider keys have not been configured during delivery, so real Gemini/Places/Routes sessions remain unverified. The app does not substitute browser speech or pretend a sample response is Gemini.

## Maps and trustworthy signals

The keyless local map uses Stadia Alidade Smooth over OpenStreetMap data, with attribution and an OSM fallback. Stadia's keyless allowance applies to localhost; on another host the prototype uses OSM unless an appropriate provider is configured. The **Google Maps** button opens an actual embedded Google map without an application key. A Google-derived itinerary without a custom Google browser key uses the Google viewer; Google route geometry stays on Google maps.

NYC hot areas measure **mapped place density**, using official DOHMH restaurant records and Department of City Planning facilities. IDs are deduplicated and counts normalized by each geographic window's area. The app exposes source links, retrieval dates, inventory dates, category counts and transparent fallbacks. This is not live crowds, Google's Popular Times, TikTok rankings or Google search volume.

The neighborhood panels contain 14 editorial picks checked against first-party venue/location sources. Two images are venue imagery; the rest are labeled representative photos. TikTok links are external searches, not retrieved social evidence. Optional live Google review lookups accept only matching venue identities/branches and never invent missing ratings. Gemini Search grounding can surface cited recommendations, but a search result is not a measured trend signal. Google Trends requires separate approved access.

## Brand assets

Open **/brand-kit/index.html** on the app's origin. The kit includes primary/reversed wordmarks, blue/monochrome symbols, a cover, typography, colors, spacing, components, voice guidance, and reusable JSON/CSS tokens. The app and kit share the same core palette.

## Verification and teammate integration

```sh
pnpm lint
pnpm test
pnpm build
pnpm verify:site
```

`pnpm build` produces the client in `dist/` and a portable Fetch-based server in `dist/server/index.js`. `pnpm build:client` builds only the client for local development. `pnpm verify:site` checks the combined hosting artifact, assets and API behavior. Private environment values are runtime bindings and are excluded from the hosted bundle.

GitHub Actions runs the checks on pushes and pull requests, using the committed dependency lockfile. Browser QA covered conversation → selected places → itinerary, hot-area cards/evidence → add a detour, the keyless Google viewer, and desktop/400px phone layouts. The initial app bundle is split from map code. Mocked provider tests verify contracts and cleanup, not account connectivity.

The supplied Sidequest project informed the grounded recommendations → Places → Routes architecture and secure Live voice flow. These fit the existing React/Express app; its separate database/worker stack was not imported. See `INTEGRATIONS.md` for contracts and official references.

## Scope before a public launch

This is a high-fidelity prototype with a deployable client and API. Hosted paid AI has an identity gate; user-scoped cloud storage, provider/account verification and licensed production map access still need work before a commercial launch. Automatic ticket inventory, purchase/refund handling and payment processing are not integrated; current ticket actions hand off to the official provider.

The archive includes source, tests, brand assets and the built app. It excludes private environment files, installed dependencies and temporary verification artifacts. Install dependencies before launching an extracted copy.
