# telltale-releases

## Page hardening

- `docs/_headers` sets the security headers (strict CSP, nosniff, referrer policy, frame denial, permissions policy). The CSP allows no inline script, so the page's code lives in `docs/page.js`, and the baked release is a JSON block (`<script type="application/json" id="baked-release">`) that `scripts/update-latest.mjs` rewrites on every release.
- Download and release-notes links are only used when they point into this repo; otherwise the page falls back to the releases page.
- The page shows a SHA-256 line per zip when the release data carries GitHub's asset `digest`; with no digest, the line is hidden.
- `/api/hit` counts only same-origin beacons, at most once per IP per key per hour (Cache API, hashed key, no IP stored).
- Tests: `node --test functions/_lib/core.test.mjs scripts/update-latest.test.mjs`
