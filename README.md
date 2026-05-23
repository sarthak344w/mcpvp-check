# MCPVP Check

A simple GitHub Pages website that checks `mcpvp.com` through the public mcsrvstat.us API.

The page reads the server MOTD from:

```text
https://api.mcsrvstat.us/3/mcpvp.com
```

Rules:

- `WHITELIST ON` means `Not Open` with a red `X`.
- `WHITELIST OFF`, `Open to all`, or public wording means `Open to all` with a green check.
- Anything unclear shows an unknown state so the site does not guess.

