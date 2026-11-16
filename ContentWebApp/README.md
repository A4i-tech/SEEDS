# ContentWebApp

React admin and content dashboard for SEEDS: library, creation, localization, accessibility remediation, registration and analytics.

## Requirements

- Node >=22

## Setup

```
cp env.example .env
npm ci
npm run dev
```

`VITE_API_BASE_URL` is required. It is baked in at build time (the Docker image maps it from `REACT_APP_API_BASE_URL`), and the app throws at startup when it is unset.

## Scripts

- `npm run dev` starts the Vite dev server
- `npm run build` type-checks and builds
- `npm run preview` serves the production build
- `npm run lint` runs oxlint
- `npm test` runs unit tests with coverage
- `npm run test:watch` runs unit tests in watch mode
- `npm run test:e2e` runs the Playwright e2e suite
