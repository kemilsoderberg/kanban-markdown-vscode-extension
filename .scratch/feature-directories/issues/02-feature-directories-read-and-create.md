# 02: Feature directories — read both layouts, create directories

**What to build:** The board works with features stored either as today's flat markdown files or as directories containing `spec.md` and an empty `issues/` directory. Creating a feature produces `structure-costs/` (slug-only name, collisions get `-2`, `-3`, …) with a `spec.md` stub — full existing frontmatter plus the title heading and empty body — and an `issues/` directory. Feature status changes on directory features are frontmatter-only edits; the feature directory never moves. Loading skips malformed directories as it skips unparseable files today. The board is fully usable with mixed flat and directory features.

**Blocked by:** 01 — Prefactor: centralize feature layout in the file layer

**Status:** done

- [x] Loading reads features from both flat `.md` files and `<slug>/spec.md` directories in the features directory, producing identical card behavior for both
- [x] Creating a feature from the board creates a slug-named directory containing `spec.md` (frontmatter + `# Title` + empty body) and an empty `issues/` directory
- [x] Duplicate titles produce `structure-costs-2`, `structure-costs-3`, … without overwriting
- [x] Moving a directory feature between columns edits frontmatter only; no files or directories are moved
- [x] Directory name is stable: renaming the feature title changes only the heading in `spec.md`
- [x] The feature header decoration decorates `spec.md` when opened
- [x] File-layer tests cover mixed-layout loading, directory creation, collision suffixing, and frontmatter-only status moves against the in-memory `FsAdapter`
