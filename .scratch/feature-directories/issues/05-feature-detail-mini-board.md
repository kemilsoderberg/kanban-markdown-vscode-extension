# 05: Feature detail mini-board

**What to build:** Opening a feature's detail view shows its issues as a three-column mini-board — todo / doing / done — where issues can be moved between columns (drag or equivalent gesture) with the change written to the issue's frontmatter. The mini-board is scoped to that feature only; the main board and epic board remain feature-granular.

**Blocked by:** 04 — Issues: end-to-end subtask files

**Status:** done

- [x] The feature detail view renders the feature's issues in three columns labeled todo / doing / done
- [x] Moving an issue between columns updates its frontmatter status and re-renders in the new column
- [x] Add-issue works from within the mini-board as well
- [x] Issues are ordered alphabetically by filename within each column
- [x] The main board and epic board show no issue cards
- [x] Store tests cover mini-board column state and move transitions
