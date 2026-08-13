Follow `~/agent-system/AGENTS.md`.

This is the standalone Life web app: Pramit's private personal operating system.
UI work must read `DESIGN.md` first and preserve the shipped Life design system.
The public portfolio lives in `/Users/pramitranjan/portfolio`; do not reintroduce portfolio components or analytics here.
Keep browser routes at the domain root and retain `/api/life/*` for native-client compatibility.
Life data remains in the existing Supabase project; migrations in `supabase/migrations` are the schema record.
The Vercel function region is `sin1`; never enable the cron in two projects at once.
Dev: `npm run dev`. Both dev and production builds use Webpack because Turbopack stalls in this checkout. Checks: `npm run typecheck`, `npm test`, then one final `npm run build`.
Never commit, push, deploy, change DNS, or rotate credentials unless Pramit explicitly asks.
