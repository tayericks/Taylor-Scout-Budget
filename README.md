# Taylor Scout Budget v20 — Shared Connected

This build uses the shared `.taylorscout.com` Supabase session, opens the show selected in the Hub, reads Calendar-published locations from `production_locations`, creates linked budget drafts, and saves Budget state to `tool_documents` using `tool_key = budget`.

Required Vercel variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

Open from the Hub with `?show=<show uuid>&showName=<name>`.

## v22 shared-auth fix
Budget now uses the exact same shared-cookie key format as the Taylor Scout Hub (`__chunks` / `__0`, etc.). This fixes the false “Not signed in” state on budget.taylorscout.com.
