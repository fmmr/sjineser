# Backlog

Ideas not yet planned (phases 1–4 of the spec and the history import are done).

- **Comments on sets/games** — a short text per set (or game), shown on the night page.
- **Lighter polling** — the match screen asks "anything changed?" (a version number) and fetches the full sheet only when needed.
- **Correct older results in the app** — today only undo of the latest game; older fixes are made in the sheet.
- **Merge two players** — e.g. duplicate casing: fold one player's history into another (rename can't, since the target name already exists).
- **Scheduling** — propose dates for the next night and let players confirm attendance (needs notifications; a sheet backend is a poor fit).
- **Chat** — probably better left to an existing group chat.

## Leagues (follow-ups to spec §19)

- **Listed leagues** — an optional `"listed": true` in `LEAGUE_<id>`; a small request returns id and name of the listed ones, and Mer → Ligaer offers them under "Andre ligaer" with one-tap "Legg til". Opt-in per league, off by default (listing makes the league readable with one tap). Worth building once there are 3+ leagues.
- **Remove a league from this phone** — a button on the league's row ("Fjern fra denne telefonen"), clearing its data and PIN, with a warning for unsent changes. Today a league is only forgotten implicitly when the server no longer knows it.
- **Mail from another account** — the night summary is always sent from the script owner's account; a league could send from its owner's account (needs its own script or a delegated sender).
- **More league settings** — the `Settings` tab can hold more than `name` (e.g. a test recipient, an on/off switch for the summary email), editable from Mer.
