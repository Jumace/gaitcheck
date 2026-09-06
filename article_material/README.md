# Article Material

This directory contains historical project material and source material for a
future article about Gaitcheck.

## Contents

- `ARTICLE_NOTES.md`: working notes for the future article.
- `PROJECT_PLAN.md`: the original project plan, including approaches that were
  later changed or paused.
- `research/`: source research about OpenCode, MCP, runtimes, and related
  capability questions.

## How to Use This Directory

These files preserve the reasoning that led to the current design. They are
useful when writing the article or reviewing why the project changed direction.

They are not the current implementation specification. Some documents describe
the earlier MCP-only approach or use the temporary term `broker`.

For the current project state, use:

- `CONTEXT.md` for domain language.
- `README.md` for the project introduction and file structure.
- `docs/current-state.md` for the detailed implementation state.
- `docs/beginners-guide.md` for a beginner-friendly explanation.
- `src/` and `prototypes/` for the current implementation.
- GitHub Issues for active decisions, dependencies, and next work.

## Historical Status

The material is intentionally additive. Moving a file into this directory does
not mean that its original proposal is still active. Read the current state
documents and linked issue decisions before treating an older proposal as a
current design.
