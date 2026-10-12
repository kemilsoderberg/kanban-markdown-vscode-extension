# 01: Prefactor — centralize feature layout in the file layer

**What to build:** No user-visible change. All decisions about where feature files live (flat files at the features-directory root, the `done/` subfolder, path computation for read/write/move/create) become owned by the extension-side file layer behind the existing `FsAdapter` seam, instead of being scattered across loading, creation, status moves, and the header provider. This is the prefactor that makes the directory-layout change land in one place.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] All feature path/layout decisions (where to read features from, where a new feature file goes, what happens on status change) route through the file-layer module; no other module computes feature paths itself
- [x] Existing flat-file behavior is byte-for-byte unchanged: board loads, creates, moves, and deletes features exactly as before
- [x] The existing file-layer tests still pass without modification to their assertions about behavior
