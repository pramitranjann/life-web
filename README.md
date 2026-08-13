# Life Web

The standalone web application for PR Life, Pramit Ranjan's private personal operating system.

## Local development

1. Copy `.env.example` to `.env.local` and provide the required credentials.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.

The browser application uses root routes such as `/`, `/tasks`, `/projects`, and `/studio`. Native clients continue to use `/api/life/*`.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Production is intended for `life.pramitranjan.com` on a separate Vercel project in the `sin1` region. Vercel Web Analytics is intentionally not installed.
