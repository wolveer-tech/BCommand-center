# Source 2 allowed-host fix

This build fixes the case where a provider returns streams but all are rejected by allowed-host rules.

Changes:
- Allowed-host values may be bare hostnames or full HTTPS URLs.
- `www` and non-`www` forms are treated consistently.
- An allowed provider host also permits its own subdomains (for example player/CDN subdomains).
- The configured provider base host is an implicit trusted root.
- Unrelated domains are still rejected.
- The Live Sport screen now displays rejected hostnames and effective allowed roots when a rejection occurs.

After deployment, use Refresh in Live Sport to bypass the short live-content cache.
