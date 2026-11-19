# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/dalie07/stemcharades/security/advisories/new)
(the **Security** tab, then **Report a vulnerability**). Do not open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. You will get a reply within
seven days. Please give us a reasonable time to fix it before you talk about it publicly.

## Scope

In scope: the game server, the web client, and the deployed site.

Especially interesting:
- any way for a guesser to learn the answer before the reveal
- taking over another player's seat, or another account's decks or history
- crashing the server or exhausting its resources with little effort
- script injection through nicknames, clues, custom cards or formulas

Out of scope: rate-limited brute force that stays within the documented limits, problems that need a compromised
device, and denial of service through sheer traffic volume.

## What is already in place

The design is described in [docs/architecture.md](docs/architecture.md). In short: every message is validated
against a shared schema, views are built per player so the answer is never sent to a guesser, rejoin tokens are
stored only as hashes, sessions are HMAC-signed `HttpOnly` cookies, sign-in uses OAuth state checks, sockets refuse
other sites' pages, and every channel is rate-limited, with caps on rooms and connections.
