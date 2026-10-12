# 07: Contract — remove flat layout and obsolete settings

**What to build:** The codebase speaks only the directory layout. Flat-file support, the `done/` subfolder and its move logic, the earlier migration path from old status subfolders, and the `filenamePattern` setting (schema, UI options, migration prompt, and its configuration-change handler) are deleted. Mixed-layout reading collapses to directory-only; the features-directory setting keeps its name, default, and semantics.

**Blocked by:** 03 — Auto-migration with confirm dialog; 04 — Issues: end-to-end subtask files

**Status:** done

- [x] Loading handles only directory features; flat files are no longer read as features
- [x] `done/` subfolder logic (creation, moves, path lookup) is removed
- [x] The old status-subfolder migration path is removed (superseded by ticket 03's migration)
- [x] The `filenamePattern` setting, its l10n strings, UI surface, and migration prompt are gone
- [x] `featuresDirectory` setting unchanged in name, default, and behavior
- [x] Epics, move-all-cards, and archive behaviors work with frontmatter-only writes
- [x] Test suite updated and green with the flat-layout paths deleted
