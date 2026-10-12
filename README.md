# Try A Look

**AI headshot wardrobe planner — a Child Actor 101 app.**
Production: https://tryalook.childactor101.com

Parents and actors upload a photo of the actor, build outfits layer by layer (base → second layer → outerwear → accessories) from descriptions or photos of real garments, and preview each look as a realistic headshot. Looks are organized around casting types, can be edited in plain English ("remove the jacket", "change the shirt to forest green"), compared side by side, and assembled into a session plan with a downloadable PDF and packing checklist.

Every generated image is labeled as an **AI wardrobe simulation**.

---

## Architecture

```
Browser (Next.js client)                     Server (Next.js API routes on Vercel)
───────────────────────────                  ─────────────────────────────────────
• Projects, photos, previews in IndexedDB    POST /api/generate     → Gemini / OpenAI image edit
  (private to the device, never uploaded       (builds the prompt server-side from structured fields)
  for storage)                               POST /api/edit         → iterative edit of a preview
• Photos resized + EXIF stripped before      POST /api/scan-closet  → Claude finds garments in a rack photo
  any request                                GET  /api/config       → which features are switched on
• PDF plan built client-side (jsPDF)         • API keys live only in server env vars
                                             • Rate limits + daily budget (Upstash Redis or in-memory)
                                             • Nothing about the images is persisted server-side
```

**Why not GitHub Pages?** Pages only serves static files, so it can't keep API keys secret or call image models. The app runs on **Vercel** — the same team (“cor9's projects”) that already hosts childactor101.com — with no database to run. The `CNAME` file in this repo is a leftover from a Pages setup. When the domain points at Vercel, turn off GitHub Pages for this repo (or delete `CNAME`) so the two don't fight over `tryalook.childactor101.com`.

| Piece | Choice | Why |
|---|---|---|
| App + API | Next.js 16 (App Router) on Vercel | One repo, server routes for secrets, cheap to run |
| Image model | **Gemini 3 Pro Image** (default) or OpenAI **gpt-image-2** | Both take several reference images and edit with them. Gemini accepts up to 14 refs and handles iterative edits well. Switch with `IMAGE_PROVIDER`. |
| Rack-photo scanner | Claude (`claude-opus-5-5`, structured output) | Optional. Turns one photo of a clothing rack into inventory items with crops. |
| Storage | Browser IndexedDB | Private by default; no server-side image storage to secure or purge |
| Abuse/cost | Access code, per-IP hourly/daily limits, global daily $ budget | Upstash Redis for shared counters; falls back to per-instance memory |

### Generation jobs
Each preview is one synchronous request, with up to 300 s allowed (`maxDuration`). Typical time is 20–60 s. The client runs requests in parallel for multiple versions, shows progress, and lets you retry failures without losing anything. Images are processed in memory and returned as data URLs. Payloads stay under Vercel's 4.5 MB body limit because the client downsizes photos first.

### Cost tracking
Every generation logs a structured line (`event: "tryalook.generation"`, provider, model, image count, estimated USD) that you can search in Vercel logs. The same estimate counts toward `DAILY_BUDGET_USD`. Each project also shows its running estimated spend on the Session plan step. Set `COST_PER_IMAGE_USD` to match your provider's current pricing.

---

## Run locally

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (or OPENAI_API_KEY)
npm run dev                  # http://localhost:3000
```

With no image key set, the app runs in full but shows a banner, and the API returns a clear "not configured" error. It never fakes a preview.

## Deploy (Vercel)

1. **Import the repo** in Vercel (team *cor9's projects*) → Framework: Next.js (auto-detected).
2. **Environment variables** (Project → Settings → Environment Variables):
   - `GEMINI_API_KEY` — from a **billing-enabled** Google AI Studio / Cloud project (see Privacy below). *or* `OPENAI_API_KEY`.
   - `ANTHROPIC_API_KEY` — optional, enables “Scan a rack photo”.
   - `ACCESS_CODE` — recommended during early access.
   - `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`, `DAILY_BUDGET_USD`, `RATE_LIMIT_SALT` — see `.env.example`.
3. **Shared rate limits** (recommended): add the *Upstash Redis* integration from the Vercel Marketplace. It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the app picks up automatically.
4. **Domain:** Project → Settings → Domains → add `tryalook.childactor101.com`. Then, at the DNS host for childactor101.com (currently Squarespace DNS), add a `CNAME` record: `tryalook` → `cname.vercel-dns.com`.
5. Turn off GitHub Pages for this repo so it doesn't also claim the subdomain.

## Configuration reference

See [`.env.example`](.env.example). Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `IMAGE_PROVIDER` | auto (Gemini if its key is set, else OpenAI) | Force `gemini` or `openai` |
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image` | Override if Google renames or you want Flash (`gemini-3.1-flash-image`) |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | |
| `ACCESS_CODE` | unset | Require a shared code to generate |
| `RATE_LIMIT_PER_HOUR` / `_PER_DAY` | 20 / 60 | Previews per visitor (IP hashed with `RATE_LIMIT_SALT`) |
| `DAILY_BUDGET_USD` | 25 | Hard stop for all generation per UTC day |
| `GEMINI_API_BASE` | Google endpoint | For a proxy/gateway or local testing |

---

## Privacy & safety

The in-app page is at `/privacy`. The short version:

- **Consent first.** A new project requires a parent/legal guardian (or an adult actor) to confirm rights and consent before any upload. The consent record is saved with the project.
- **Private by default.** No accounts and no galleries. Photos and previews live only in the user's browser, and users can delete a project or everything at any time.
- **No server retention.** API routes process images in memory and keep only anonymous counters (hashed IP, counts and cost) that expire within 48 h.
- **No marketing use** of uploads without separate written permission.
- **Age-appropriate by design.** Prompts lock identity, apparent age and body (no beautifying or aging). Requests for swimwear, underwear or suggestive styling are blocked server-side before reaching the model, and providers apply their own filters.
- **Clearly labeled.** Previews are badged on screen, stamped on downloads, and labeled in the PDF.

**Before launch, review provider data terms:**
- *Gemini API:* use the **paid** tier. Google's terms allow content sent to the *unpaid* tier to be used to improve its products, which isn't acceptable for photos of minors. Check current retention and abuse-monitoring terms.
- *OpenAI API:* API data isn't used for training by default. Inputs and outputs may be retained up to 30 days for abuse monitoring unless your org has zero-data-retention approval.
- *Anthropic API* (scanner only): commercial API data isn't used for training by default. Check retention terms for your org.

---

## Roadmap

**Phase 1 — shipped here:** actor profile + photo, casting types (incl. custom), 4-slot layered wardrobe builder (text, ideas, photos, inventory), color/neckline/fabric/fit/background controls, AI previews with identity preservation, iterative plain-English edits, versions, favorites, rename, compare, look board, session planner with reordering + notes + packing checklist, PDF export, consent + deletion, rate limits + budget cap.

**Phase 1 also includes these Phase 2 pieces:** wardrobe inventory with rack-photo scanning, PDF export.

**Next:** user accounts with encrypted cloud sync (e.g. Supabase Auth + private Storage buckets with signed URLs and an auto-delete retention policy), usage credits, async job queue if generation times grow, photographer accounts, Child Actor 101 integrations.

## Project layout

```
app/                 pages + API routes (generate, edit, scan-closet, config), privacy page
components/          UI: App shell, Profile, Wardrobe, Studio (rail + mirror), Board, Plan
lib/prompt.ts        prompt builder (identity rules, layering, edit prompts, content guard)
lib/presets.ts       casting types, wardrobe ideas, swatches
lib/server/          provider adapters, rate limiting/cost, Claude scanner
lib/client/          IndexedDB store, image processing, PDF export
```
