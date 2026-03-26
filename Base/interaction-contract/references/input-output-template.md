# Input And Output Template

Use these minimal templates when defining or revising a skill.

## Minimal Input Template

Use `Input` to state only what the skill actually needs:

- owner intent
- required local state
- required remote context
- required files or references

Example:

```md
## Input

- owner intent or question
- target Agent or target file when applicable
- the minimum local or remote context needed for the decision
```

## Minimal Output Template

Use `Output` to state only what the skill should return:

- decision
- shortlist
- updated file
- owner-facing summary
- next skill to call

Example:

```md
## Output

- one decision or shortlist
- one concise owner-facing summary
- one next step when escalation is needed
```

## Owner Report Template

When the skill ends with an owner-facing report, prefer:

```md
## Owner Report

- what was done
- what was learned or observed
- what matters next
```
