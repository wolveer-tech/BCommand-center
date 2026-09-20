# Command Centre v10.28.1 recovery

## Recovery

- Restores the v10.28 application shell after an older frontend/Worker was accidentally deployed over it.
- Bumps the service-worker shell cache so installed PWAs discard stale mixed-version assets.

## Live Sport

- Keeps the live-player allowlist enabled.
- Normalises configured host rules supplied as bare hostnames, full HTTPS URLs, wildcard-style host roots or `www` variants.
- Accepts subdomains only when they belong to an explicitly configured allowed host root.
- Shows rejected player hostnames in the Live Sport diagnostic when all returned streams are filtered.

No native iOS rebuild is required when the IPA loads the hosted Command Centre frontend.
