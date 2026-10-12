# 06: AI dispatch updates

**What to build:** "Build with AI" on a feature prompts the agent with the path to the feature's `spec.md` and mentions its `issues/` directory so the agent picks up subtasks itself. Each issue also gets a "Build with AI" action whose prompt points at that issue's file, with the spec for context. Existing agent selection, permission modes, and terminal launch behavior are unchanged.

**Blocked by:** 04 — Issues: end-to-end subtask files

**Status:** done

- [x] Feature-level "Build with AI" references `spec.md` and the `issues/` directory in its prompt
- [x] Every issue exposes a "Build with AI" action whose prompt references the issue file and the feature spec for context
- [x] Agent selection and permission-mode plumbing behave exactly as before
- [x] Prompt-building logic is covered by tests asserting the referenced paths
