# Telltale

Telltale is a Mac app for Salesforce developers and QAs: it turns on debug logging for you, reads each log as it arrives, and explains what failed and why.

- **Download:** https://telltale-app.pages.dev/
- **Releases:** the Releases page of this repository holds each build.
- **Free beta, provided as is.**
- **Feedback:** the form on the download page, or an issue here. Both are public, so leave out org names, customer data and anything private.

Telltale masks the personal details and secrets it recognises before text goes to a model. It can miss a value, and pictures are sent as they are.

Telltale is an independent tool. It is not affiliated with or endorsed by Salesforce or any other company named here; product names belong to their owners.

## For maintainers

### Page hardening

- `docs/_headers` sets the security headers (strict CSP, nosniff, referrer policy, frame denial, permissions policy). The CSP allows no inline script, so the page's code lives in `docs/page.js`, and the baked release is a JSON block (`<script type="application/json" id="baked-release">`) that `scripts/update-latest.mjs` rewrites on every release.
- Download and release-notes links are only used when they point into this repo; otherwise the page falls back to the releases page.
- The page shows a SHA-256 line per zip when the release data carries GitHub's asset `digest`; with no digest, the line is hidden.
- `/api/hit` counts only same-origin beacons, at most once per IP per key per hour (Cache API, hashed key, no IP stored).
- Tests: `node --test functions/_lib/core.test.mjs scripts/update-latest.test.mjs`
