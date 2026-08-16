# PROJECT.md — Life Web

## Goal
Ship Pramit's private personal operating system as a standalone web product at `life.pramitranjan.com`, replacing the `/life` application previously embedded in the portfolio deployment.

## Non-goals
- Do not fork or migrate the existing Supabase data during the application split.
- Do not add Vercel Web Analytics to this private app.
- Do not redesign shipped Life screens as part of infrastructure or route migration.
- Do not break the `/api/life/*` contract consumed by PRLifeMobile and the desk printer.

## Current state
2026-08-17 — `life.pramitranjan.com` resolves to Vercel and serves the standalone app. Browser routes are promoted from `/life/*` to root paths such as `/`, `/tasks`, `/projects`, and `/studio`; all 41 API route handlers remain under `/api/life/*`. Type checking, unit tests, dependency audit, and the Webpack production build pass. Vercel project `pramitranjann/life-web` is connected to GitHub with the Next.js preset and has a Ready production deployment. The portfolio predecessor is being removed while its old browser and API paths temporarily redirect/proxy here.

The app still uses the existing Supabase project, Google Calendar connection, Anthropic synthesis, Resend email, mobile bearer token, and printer device token. All 15 required Life Web variables are present in Vercel Production as of 2026-08-16, including newly restored Resend and write-capable Google Calendar OAuth credentials. The daily cron is configured in this repo but must remain disabled in production until the portfolio copy is disabled.

The ESP32 desk-printer firmware and local ignored `config.h` now live under `hardware/`; Life Web is the sole owner of that integration.

## Decisions
- **Standalone repo and Vercel project.** This creates a real analytics and deployment boundary; a subdomain on the portfolio project would only add a hostname filter.
- **No Web Analytics.** Life is private and its page views should not affect public portfolio metrics.
- **UI routes live at the domain root.** `life.pramitranjan.com/projects` is the product-native route; retaining `/life/projects` would duplicate the product name in the URL.
- **API routes keep `/api/life/*` during migration.** Native clients already append this prefix, so the server move only requires a base-URL migration.
- **Data stays shared initially.** This is an application/deployment split, not a database migration; the existing Supabase project remains authoritative.
- **Design is carried over, not refreshed.** Existing Life tokens, density, square geometry, component primitives, and mobile behavior are migration invariants.
- **Local fonts replace Google font fetching.** DM Mono, Clash Display, and Cabinet Grotesk ship with the app so production builds do not depend on a font CDN.
- **One Life app icon.** Browser favicons, Apple touch icons, and installed-app icons use black `PR` lettering on an edge-to-edge signal-red background.
- **Next builds use Webpack.** Turbopack stalled during the first standalone compile before emitting route artifacts; Webpack is the verified production path for this checkout.

## Open threads
- Verify all root browser routes and authenticated mutations against a safe environment.
- Trigger and verify a new standalone production deployment so it consumes the restored Resend and Google Calendar OAuth credentials.
- Rotate the mobile bearer token during the coordinated native/web cutover.
- Disable the portfolio cron before enabling this project's cron.
- Redirect old `/life/*` browser routes and temporarily proxy old `/api/life/*` requests.
- Remove Life source and dependencies from the portfolio only after the compatibility window closes.

## Gotchas
- Existing PRLifeMobile installations prefer their stored base URL over the bundled default; changing only `LocalAPIConfig.plist` does not migrate them.
- A bearer token bundled in a native app is extractable. Treat it as revocable app access, not a durable secret.
- Login sessions are origin-scoped. Moving domains requires a new Life login even if the same password and signing secret are used.
- Installed PWAs are origin-scoped; the old home-screen installation does not become the new subdomain app.
- Cron overlap can duplicate reports, emails, application-monitor notifications, and calendar work.
- Life styles came from interleaved sections of the portfolio `globals.css`; keep this repo's extracted stylesheet as the only Life token source.
- The default Next 16 Turbopack production build can stall during compile here; keep `next build --webpack` unless a later upgrade is explicitly verified.

## Next action
Set and verify the custom-domain A record, restore calendar/email credentials, then test PRLifeMobile build 25 against the live hostname before domain, cron, and portfolio compatibility cutover.
