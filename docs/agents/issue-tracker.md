# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list` with appropriate state and label filters.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Edit labels or assignees**: `gh issue edit <number> ...`.
- **Close**: `gh issue close <number> --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

- **Map**: one issue labelled `wayfinder:map`, containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: create an issue with one `wayfinder:<type>` label, then link it as a GitHub sub-issue of the map using the sub-issues API.
- **Blocking**: use GitHub native issue dependencies via `gh api --method POST repos/Jumace/gaitcheck/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`.
- **Frontier**: open, unassigned child issues with no open dependency blockers, in map order.
- **Claim**: assign the selected ticket before doing any work.
- **Resolve**: comment the answer, close the issue, then append its linked gist to the map's Decisions so far.
