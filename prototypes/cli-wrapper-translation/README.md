# CLI Wrapper Translation Prototype

This is throwaway code for issue 13. It tests whether a PATH-based adapter can
translate the shared `command.execute` policy into ordinary CLI invocations.

## Run

From the repository root:

```bash
PATH="$PWD/prototypes/cli-wrapper-translation/bin:$PATH" git status
GAITCHECK_APPROVAL=deny PATH="$PWD/prototypes/cli-wrapper-translation/bin:$PATH" git commit -m test
PATH="$PWD/prototypes/cli-wrapper-translation/bin:$PATH" git reset --hard
```

Use `GAITCHECK_APPROVAL=allow` for non-interactive approval. Set
`GAITCHECK_AUDIT_FILE=/tmp/gaitcheck-audit.jsonl` to collect JSONL audit events.

## Findings

- `git status` forwards without approval.
- `git commit`, `git push`, `gh pr create`, `terraform apply`, and
  `kubectl delete` ask in the wrapper's terminal. A non-interactive caller must
  explicitly provide an approval environment value or the request is denied.
- `git reset --hard` is denied before the real executable runs.
- The event includes the shared correlation identity, raw command, decision,
  explanation, approval result, and child exit result when forwarded.
- This is not inline harness approval. The prompt belongs to the wrapper's
  controlling terminal and has no session or scope semantics.
- `sh -c 'git reset --hard'`, an absolute `/usr/bin/git`, another executable
  such as `make publish`, or a direct API bypasses this target. PATH wrappers
  therefore remain a compatibility and visibility adapter, not an enforcement
  boundary.
