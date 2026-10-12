# 04: Issues — end-to-end subtask files

**What to build:** Each feature's `issues/` directory becomes a working subtask list. An issue is a markdown file named `001-setup-db.md` (zero-padded per-feature counter; next free number found in the directory) with minimal frontmatter — `id` (filename base), `status` (`todo` | `doing` | `done`), `created`, `modified` — and a title parsed from its first `#` heading. Membership is by location only. The feature card on the main board shows a done-counter (e.g. `3/5`) and an expandable issue list; issues can be added from both the card and the feature detail view; clicking an issue opens it in the normal markdown editor with save-back through the extension; deleting an issue deletes its file but is covered by the undo toast. Hand-created or hand-edited issue files appear on the board automatically via the existing recursive watcher.

**Blocked by:** 02 — Feature directories: read both layouts, create directories

**Status:** done

- [x] An issue type with the minimal frontmatter schema exists in the shared types module, with parse/serialize round-trip tests
- [x] Loading a feature directory picks up all files in `issues/`, location-linked, ordered alphabetically by filename
- [x] Adding an issue from the card or the detail view writes `NNN-<slug>.md` with the next free counter and `status: todo`
- [x] The feature card shows a done-counter and an expandable list of its issues; the card preview still shows only `spec.md` content
- [x] Clicking an issue opens it in the markdown editor; saving updates frontmatter (`status`, `modified`) through the extension
- [x] Deleting an issue removes the file and is reversible via the undo toast
- [x] A file created by hand in `issues/` appears on the board via the existing watcher without a reload
- [x] Issues never render as cards on the main five-column board
- [x] File-layer and store tests cover numbering, frontmatter round-trip, add/delete, and counter-after-deletion behavior
