# ContentWebApp

React admin and content dashboard for SEEDS: library, creation, localization, accessibility remediation, registration and analytics.

## Requirements

- Node >=22

## Setup

```
npm ci
npm run dev
```

The app reads `window.__ENV__` from `/env.js`. In dev, Vite serves `public/env.js`. In Docker, nginx builds `/env.js` from the `REACT_APP_*` container environment variables and exits at start when `REACT_APP_API_BASE_URL` is missing.

`VITE_UMAMI_URL` and `VITE_UMAMI_WEBSITE_ID` turn on Umami analytics. They are also baked in at build time. When either is empty, the app loads no tracker and sends no events.

## Scripts

- `npm run dev` starts the Vite dev server
- `npm run build` type-checks and builds
- `npm run preview` serves the production build
- `npm run lint` runs oxlint
- `npm test` runs unit tests with coverage
- `npm run test:watch` runs unit tests in watch mode
- `npm run test:e2e` runs the Playwright e2e suite
