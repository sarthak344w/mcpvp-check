# MCPVP Check

A simple GitHub Pages website that checks `mcpvp.com` through the public mcstatus.io API.

The page reads the server MOTD from:

```text
https://api.mcstatus.io/v2/status/java/mcpvp.com
```

Rules:

- `WHITELIST ON` means `Not Open` with a red `X`.
- `WHITELIST OFF`, `Open to all`, or public wording means `Open to all` with a green check.
- Anything unclear shows an unknown state so the site does not guess.

## Notifications

The GitHub Action can send Discord updates when the whitelist state changes.

1. In Discord, create a webhook in the channel where updates should go.
2. Copy the webhook URL.
3. In GitHub, open repo settings, then Secrets and variables, then Actions.
4. Add a repository secret named `DISCORD_WEBHOOK_URL`.
5. Paste the webhook URL as the value.

The workflow already reads that secret. If it is missing, Discord notifications are skipped.
