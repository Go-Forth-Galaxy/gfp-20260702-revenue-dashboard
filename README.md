# Go-Forth Pest Control — 2026 Revenue Dashboard

Static dashboard of 2026 monthly revenue with trendlines, gated behind Google
Workspace sign-in (`@go-forth.com` only) with the revenue data **encrypted at rest**.

**Live:** https://go-forth-galaxy.github.io/gfp-20260702-revenue-dashboard/

## What it shows
- **KPI cards:** total 2026 revenue, best month, worst month, average month-over-month growth.
- **Chart:** monthly revenue bars (Jan–Jun booked, Jul–Dec forecast shown lighter) with a
  **3-month moving average** and a **linear regression** line of best fit.
- **Detail table:** per-month revenue, days, 3-mo average and MoM %.

Data source: `CCPC reforecast AOP - 6-30.xlsx`, tab **“2026 Revenue”** (365 daily rows rolled
up to 12 monthly totals; grand total **$367,800**). Because the file is an AOP *reforecast*,
months after June 2026 are forward-looking forecast and are labeled as such throughout.

## Security model (Option B)
1. **Google Sign-In (real):** Google Identity Services; the signed ID token's verified
   `hd`/`email` claim must be `go-forth.com` or access is refused.
2. **Encryption at rest:** `docs/data.enc.json` is **AES-256-GCM** ciphertext. A direct fetch
   of that file returns no numbers. It is decrypted **in the browser** (WebCrypto) only after a
   successful, domain-verified sign-in, using a PBKDF2-SHA256 (150k iterations) derived key.

> Honest limitation: on a static host the decryption key material lives in client-side JS, so a
> determined developer who reverse-engineers the bundle could extract it. This defeats casual
> access and public scraping (the raw data file is ciphertext), but it is **not** per-user
> server-enforced auth. For hard per-user guarantees + audit logs, front the site with
> **Cloudflare Access + go-forth.com Google Workspace** (Option A).

## One-time setup: Google OAuth Client ID (required to sign in)
The Google button needs an OAuth Client ID issued for this site's origin. A `go-forth.com`
Google Cloud/Workspace admin creates it once:

1. Google Cloud Console → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID → Web application**.
3. **Authorized JavaScript origins →** add `https://go-forth-galaxy.github.io`.
4. Copy the client ID (ends in `.apps.googleusercontent.com`).
5. Paste it into `docs/config.js` → `GOOGLE_CLIENT_ID` and commit.

Until that ID is set, the sign-in screen shows a setup notice (the gate stays closed).

## Updating the numbers
Re-run the encryption step against a fresh `CCPC reforecast AOP - 6-30.xlsx` to regenerate
`docs/data.enc.json`, then commit. The passphrase in `config.js` must match the one used to encrypt.

## Deploy
GitHub Pages, **main / `/docs`** (legacy mode). No build step — it's static HTML/CSS/JS with
Chart.js from CDN.
