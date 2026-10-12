# 03: Auto-migration with confirm dialog

**What to build:** On load, if flat feature files (or a `done/` subfolder) are detected in the features directory, the user sees one confirmation dialog ("N features will be converted to directories"), then the extension converts each flat file into `<slug>/spec.md` preserving all frontmatter values and body content exactly; files in `done/` become directories with `status: done` frontmatter and the `done/` folder is cleaned up when empty. Runs once per legacy layout; the board reflects the migrated directories afterward with no data loss.

**Blocked by:** 02 — Feature directories: read both layouts, create directories

**Status:** done

- [x] Detecting flat feature files triggers exactly one confirmation dialog showing the feature count before any file moves
- [x] Declining the dialog leaves the disk untouched and the board keeps working with the mixed layout
- [x] Accepting converts every flat file to `<slug>/spec.md` with frontmatter and body preserved byte-for-byte (modulo layout), including `created`/`modified`/`order`
- [x] Files under `done/` migrate to directories carrying `status: done`; empty legacy status folders are removed
- [x] Migration is guarded so it does not re-run or fight the watcher (existing migrating flag honored)
- [x] File-layer tests drive migration through the in-memory `FsAdapter`: flat input tree → directory output tree, the `done/` case, and the dialog-gate behavior
