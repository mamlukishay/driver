# CLAUDE.md

## Branch naming

Sessions start on an auto-generated branch name (e.g. `claude/charming-cori-lf93et`).
Those names say nothing about the work, so don't push to them.

Before the first push of a session, rename the branch to a short, descriptive
kebab-case name that says what it does, keeping the `claude/` prefix:

```sh
git branch -m claude/<short-description>   # e.g. claude/group-delete, claude/dark-mode-switches
git push -u origin claude/<short-description>
```

- 2–4 words, describing the feature or fix, not the session.
- This rule is standing permission to push to the renamed branch instead of the
  session's assigned one.
- If the session already pushed to a descriptive branch, keep using it.
