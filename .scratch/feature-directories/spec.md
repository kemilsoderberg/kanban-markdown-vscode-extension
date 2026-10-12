---
Status: ready-for-agent
Created: 2026-10-12
---

# Feature: Feature directories with linked issue subtasks

## Problem Statement

Every feature on the kanban board is a single flat markdown file in the features directory (default `.devtool/features`, in the user's workspace set to `.scratch`). There is no place to put the spec, notes, or sub-work that belongs to a feature: the file *is* the feature, so breaking a feature down into smaller steps means either cluttering the main board with more cards or keeping loose text outside the tracker. The user wants each feature to be a self-contained directory holding its spec and its own set of issues, with those issues visible and manageable as subtasks on the board.

## Solution

A feature becomes a directory named after its slug (e.g. `structure-costs/`). The directory contains:

- `spec.md` — the feature's full record: the existing frontmatter (unchanged fields) plus the feature content.
- `issues/` — a subdirectory of markdown files, one per subtask, each with minimal frontmatter. These are the feature's issues and are surfaced on the board as a subtask checklist for the feature and as a small todo/doing/done board inside the feature's detail view.

Features themselves keep all five kanban statuses (backlog / todo / in-progress / review / done) in frontmatter only — files never move between columns. Issues use only `todo` / `doing` / `done`. The extension migrates existing flat feature files into this layout once, and hand-created files inside a feature directory are picked up automatically by the existing recursive watcher.

## User Stories

1. As a board user, I want creating a feature to produce a directory containing a `spec.md` stub and an empty `issues/` directory, so that the feature has a dedicated home on disk from the moment it exists.
2. As a board user, I want the feature's directory name to be a slug of its title (`Structure Costs` → `structure-costs`), so that directory names are readable and predictable.
3. As a board user, I want duplicate titles to produce `structure-costs-2`, `structure-costs-3`, …, so that two features with the same name never collide on disk.
4. As a board user, I want the feature directory name to never change when I rename the feature, so that links from agents, notes, and tooling to the directory stay stable.
5. As a board user, I want the feature title to come from the first `#` heading in `spec.md`, so that renaming a feature is just editing the heading.
6. As a board user, I want the feature's kanban status to live in `spec.md` frontmatter rather than in a folder location, so that moving a card between columns never moves files.
7. As a board user, I want the `done` subfolder abolished so that all features live as sibling directories regardless of status.
8. As a board user, I want a new feature's `spec.md` to contain just frontmatter plus the title heading and an empty body, so that I write the spec myself without template noise.
9. As a board user, I want a feature to keep every frontmatter field it has today (priority, assignee, epic, dueDate, labels, order, created, modified, completedAt), so that nothing about the card model changes — only the file layout.
10. As a board user, I want an `issues/` directory created with each feature, so that subtasks have a place to live even before the first issue exists.
11. As a board user, I want to add an issue to a feature from the feature card on the board, so that I can break work down without opening the detail view.
12. As a board user, I want to add an issue to a feature from the feature detail view, so that I can queue up several subtasks in one sitting.
13. As a board user, I want issue files named `001-setup-db.md`, `002-write-tests.md`, …, so that issues sort stably and alphabetically in file listings.
14. As a board user, I want the issue numbering counter to find the next free number in that feature's `issues/` directory, so that numbers never collide even after deletions.
15. As a board user, I want to hand-create or hand-edit issue files inside `issues/` with my editor, so that the board picks them up without any import step.
16. As a board user, I want issue frontmatter to be minimal — `id`, `status`, `created`, `modified` — so that writing an issue file by hand is trivial.
17. As a board user, I want an issue's id to be its filename base and its title to be its first `#` heading, so that the file, the id, and the card all agree without extra metadata.
18. As a board user, I want issue membership determined purely by which feature directory the file sits in, so that no parent field has to be maintained by hand or tooling.
19. As a board user, I want issues to have exactly three statuses (`todo`, `doing`, `done`), so that subtask tracking stays simple.
20. As a board user, I want the feature card on the main board to show a done-counter (e.g. `3/5`), so that I can see subtask progress at a glance.
21. As a board user, I want to expand the feature card to see its issue list, so that I can inspect subtasks without leaving the board.
22. As a board user, I want the feature detail view to show the feature's issues as a small three-column (todo / doing / done) board, so that I can manage subtasks with drag-and-drop like the main board.
23. As a board user, I want to drag or move an issue between todo / doing / done in the mini-board, so that updating progress is one gesture.
24. As a board user, I want issues never to appear as cards on the main five-column board, so that the main board stays at feature granularity.
25. As a board user, I want clicking an issue to open it in the normal markdown editor, so that issue editing works exactly like feature editing does today.
26. As a board user, I want saving an issue in the editor to write back through the extension, so that frontmatter (`status`, `modified`) stays consistent.
27. As a board user, I want deleting an issue to delete its file but be covered by the existing undo toast, so that accidental deletions are recoverable.
28. As a board user, I want deleting a feature to delete its entire directory including all issues, so that no orphan files remain.
29. As a board user, I want the undo toast to also cover feature deletion (directory restore), so that destructive actions stay reversible.
30. As a board user, I want the feature card preview to keep showing title and body from `spec.md` only, so that issue text never clutters the main board.
31. As a board user, I want the "Build with AI" action on a feature to prompt the agent with the path to `spec.md` and a mention of the `issues/` directory, so that the agent reads the spec and picks up its subtasks itself.
32. As a board user, I want each issue to also have a "Build with AI" action whose prompt points at that issue file (with the spec for context), so that I can dispatch a single subtask to an agent.
33. As a board user, I want epics and swimlanes to keep working exactly as today at the feature level, so that the epic board is unaffected by the directory change.
34. As a board user, I want existing flat feature files to be migrated into directories automatically, so that upgrading does not require manual file surgery.
35. As a board user, I want the migration to be confirmed with a single dialog ("N features will be converted") before it runs, so that I am never surprised by a bulk file move.
36. As a board user, I want migration to convert `done/` subfolder files into directories with `status: done` frontmatter, so that completed history is preserved in the new layout.
37. As a board user, I want the migration to preserve all frontmatter values and body content exactly, so that no data is lost or altered in the move.
38. As a board user, I want the obsolete filename-pattern setting and its migration prompt removed, so that settings stay meaningful.
39. As a board user, I want the features-directory setting to keep its name, default, and my custom value (`.scratch`), so that my workspace keeps working unchanged.
40. As a board user, I want the recursive file watcher to pick up issue files and directories created outside the extension, so that the board always reflects what is on disk.
41. As a board user, I want the feature header decoration to keep decorating the feature's file (now `spec.md`) when opened, so that the in-editor experience is unchanged.
42. As a board user, I want "move all cards" and archive behaviors to keep working with frontmatter-only writes, so that bulk board actions do not shuffle files.

## Implementation Decisions

- **Directory layout**: one feature per directory under the configured features directory. Directory name = slugified title, no date suffix, immutable after creation. Collision suffix `-2`, `-3`, … (same counter strategy as the existing filename collision logic).
- **spec.md**: full existing frontmatter schema unchanged (id, status, priority, assignee, epic, dueDate, created, modified, completedAt, labels, order) plus markdown body. Feature id = directory name. Status transitions are frontmatter edits only; the `done/` subfolder and its move logic are removed.
- **Issues**: files inside `<feature>/issues/`, named `<NNN>-<slug>.md` with a zero-padded per-feature counter. Minimal frontmatter: `id` (= filename base), `status` (`todo` | `doing` | `done`), `created`, `modified`. Title parsed from the first `#` heading. Membership by location only — no parent field. Ordering alphabetical by filename.
- **Types and contracts**: a new issue type alongside the existing feature type in the shared types module; extension-to-webview messages extended so a feature carries (or can request) its issues, and the mini-board speaks the three issue statuses while the main board keeps the five feature statuses.
- **Loading**: the features-directory scan changes from "flat .md files plus done/" to "one directory per feature, read its spec.md and issues/". Unparseable or malformed entries are skipped as today.
- **Creation and deletion**: feature creation writes the directory, spec.md stub, and issues/; deletion removes the whole directory tree (both remain covered by the undo toast mechanism, which now snapshots/restores directories).
- **AI dispatch**: the Build-with-AI prompt builder changes from pointing at the feature file to pointing at `spec.md` and mentioning the issues directory; a second entry point builds an issue-scoped prompt referencing the issue file with the spec as context.
- **Header provider**: the feature header decoration repoints from the feature file to `spec.md`; issue files get no decoration.
- **Watcher**: the existing recursive `**/*.md` watcher over the features directory already covers the new layout; no new watcher is introduced. Debounce and "skip while migrating" behavior carry over.
- **Settings**: `featuresDirectory` unchanged (name, default, semantics). The `filenamePattern` setting, its UI, and its migration prompt are removed.
- **Migration**: on load, if flat feature `.md` files (or a `done/` folder) are detected, show one confirmation dialog, then convert each file into `<slug>/spec.md` (preserving frontmatter and body; `done/` files get `status: done`). Runs once; guarded by the existing migrating flag. Old empty status folders are cleaned up.
- **i18n**: all new user-facing strings go through the existing l10n bundle pattern (en/es/pt).

## Testing Decisions

- Good tests here assert external behavior: given a features directory shape on disk (or its in-memory equivalent), what does loading produce; given a board action, what files/frontmatter result. No test reaches into private parsing internals or DOM structure.
- **Primary seam: the extension-side file layer** (the module that owns reading/writing/moving feature and issue files, behind the existing `FsAdapter` abstraction). This is the highest existing seam below the VS Code API and covers layout, migration, collision handling, issue numbering, and status changes. The ideal is one seam, and the existing one extends to cover the new layout rather than adding new ones.
- **Secondary seam (existing): the shared frontmatter parse/serialize round-trip** — feature frontmatter is unchanged; issue frontmatter is new and tested at the same level.
- **Webview store tests** (existing seam) cover mini-board state transitions for issues (add/move counts) without rendering components.
- Prior art: `tests/extension/featureFileUtils.test.ts` (in-memory `FsAdapter` stub factory) is the direct model for directory-layout and migration tests; `tests/shared/featureFrontmatter.test.ts` for frontmatter round-trips; `tests/webview/store.test.ts` for store behavior.
- Migration is tested by constructing a flat-layout directory in the stub and asserting the resulting directory tree and frontmatter, including the `done/` case and the confirm-dialog gate.

## Out of Scope

- Any external issue tracker integration (GitHub issues etc.) — "issues" here are the extension's own subtask files.
- Per-issue frontmatter fields beyond id/status/created/modified (no priority, assignee, epic, dueDate, labels, order on issues).
- Issues appearing on the main board or epic board.
- Renaming feature directories when a feature is renamed.
- Nested issues (issues with their own subtasks).
- Any editor decoration or special UI for issue files beyond what the mini-board and plain markdown editing provide.
- Changing the packaged default features directory or the settings key names (beyond removing `filenamePattern`).

## Further Notes

- The local issue-tracker convention for this repo (markdown specs + numbered issue files under a feature directory) mirrors the product feature itself, so the spec for this work lives in the same shape it describes.
- Git does not track empty directories; the `issues/` directory is created on demand by the extension. Whether to drop a `.gitkeep` is left to the implementer's judgment against repo conventions — the extension itself must not depend on it.
- The existing `_loadFeatures` already contains an earlier generation of migration logic (old status subfolders → root/done); the new migration supersedes and must compose with that path during one upgrade.
- The user's workspace sets `featuresDirectory` to `.scratch`; all examples above use slugs like `structure-costs` relative to that directory.
