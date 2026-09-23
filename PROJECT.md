# PROJECT.md — Life Web

## Goal
Ship Pramit's private personal operating system as a standalone web product at `life.pramitranjan.com`, replacing the `/life` application previously embedded in the portfolio deployment.

## Non-goals
- Do not fork or migrate the existing Supabase data during the application split.
- Do not add Vercel Web Analytics to this private app.
- Do not redesign shipped Life screens as part of infrastructure or route migration.
- Do not break the `/api/life/*` contract consumed by PRLifeMobile and the desk printer.

## Current state
2026-08-17 — `life.pramitranjan.com` resolves to Vercel and serves the standalone app. Browser routes are promoted from `/life/*` to root paths such as `/`, `/tasks`, `/projects`, and `/studio`; all 41 API route handlers remain under `/api/life/*`. Type checking, unit tests, dependency audit, and the Webpack production build pass. Vercel project `pramitranjann/life-web` is connected to GitHub with the Next.js preset and has a Ready production deployment. The portfolio predecessor is removed; its old browser and API paths temporarily redirect/proxy here.

Production login submissions were returning `403` before password verification. Vercel's internal forwarded hostname caused the first failure; after that fix deployed, real in-app browser form navigations still omitted the `Origin` header. The local follow-up submits login as an in-page JSON request, shows failures inside the form instead of navigating to the API route, and accepts missing `Origin` only when browser Fetch Metadata proves the request is same-origin. It is not live until this follow-up is pushed and deployed.

The app still uses the existing Supabase project, Google Calendar connection, Anthropic synthesis, Resend email, mobile bearer token, and printer device token. All 15 required Life Web variables are present in Vercel Production as of 2026-08-16, including newly restored Resend and write-capable Google Calendar OAuth credentials. The daily cron is configured in this repo but must remain disabled in production until the portfolio copy is disabled.

The ESP32 desk-printer firmware and local ignored `config.h` now live under `hardware/`; Life Web is the sole owner of that integration.

2026-09-22 — The printer worker supports personal, open/MAC-authorized, and 802.1X EAP-PEAP/MSCHAPv2 Wi-Fi. A local dual-SCAD setting scans and tries `SCAD Wireless` followed by `SCAD_Secure_Wireless`, logs the observed security mode and disconnect reason, and permits open association in Arduino ESP32 core 3.x. Enterprise mode requires a local username, password, and trusted RADIUS CA certificate in ignored config.h.

2026-09-22 — SCAD device logs confirmed that open `SCAD Wireless` connected and the printer received a job. The immediate `/complete` HTTPS call failed three times while a later `/claim` worked. The worker now releases the BLE stack before HTTPS, logs largest free heap block, and persists a pending completion report in ESP32 flash; it retries that report before claiming another job and remembers the last printed job across reboots. On-device verification of this recovery remains pending.

2026-09-22 — Phone print management now presents jobs as readable rows and receipt layouts as compact bottom-sheet choices. Project index and detail reduce empty progress metadata, keep detail tabs visible together, and group editable properties at phone widths. These changes are local only; authenticated phone rendering and interactions still need a signed-in browser check before release.

2026-09-22 — Project names and summaries now have visible, keyboard-accessible edit controls. A completely empty project opens with task, sub-project/section, and page starting actions; the task action opens its composer. Print activity is labeled as job state and explicitly avoids claiming live printer connectivity.

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
- **Login origin checks trust the public request origin first.** Vercel may set `x-forwarded-host` to a deployment hostname even when the request comes from `life.pramitranjan.com`; the guard accepts the browser-facing URL/direct Host. A missing `Origin` is accepted only with `Sec-Fetch-Site: same-origin`, while foreign and unproven requests remain rejected.
- **Login stays on the page while authenticating.** The client sends JSON to the login API, displays pending and failure states inline, and navigates to the intended root-level Life route only after the session cookie is set.

## Open threads
- Push/deploy the login follow-up and verify a real submission lands on the intended Life route without exposing the API response page.
- Verify remaining authenticated mutations against a safe environment.
- Rotate the mobile bearer token during the coordinated native/web cutover.
- Remove the temporary portfolio compatibility bridge after older browser/native clients have aged out.

## Gotchas
- Existing PRLifeMobile installations prefer their stored base URL over the bundled default; changing only `LocalAPIConfig.plist` does not migrate them.
- A bearer token bundled in a native app is extractable. Treat it as revocable app access, not a durable secret.
- Login sessions are origin-scoped. Moving domains requires a new Life login even if the same password and signing secret are used.
- Installed PWAs are origin-scoped; the old home-screen installation does not become the new subdomain app.
- Cron overlap can duplicate reports, emails, application-monitor notifications, and calendar work.
- Life styles came from interleaved sections of the portfolio `globals.css`; keep this repo's extracted stylesheet as the only Life token source.
- The default Next 16 Turbopack production build can stall during compile here; keep `next build --webpack` unless a later upgrade is explicitly verified.

## Next action
Push and deploy the login follow-up, then confirm a real login lands on the intended Life route.
