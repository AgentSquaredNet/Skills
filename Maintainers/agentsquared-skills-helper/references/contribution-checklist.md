# Contribution Checklist

Use this checklist before finalizing a new or updated skill.

## Placement

- Is the skill in the correct top-level group?
- If the task is only about first-time installation handoff, should it live in `bootstrap.md` instead of a new skill?
- Should the task route through an existing group router first?
- Is the capability already covered by an existing skill?

## Scope

- Does the skill do one clear job?
- Is the trigger description specific enough?
- Is the body short enough, or should detail move to `references/`?
- If the skill is interaction-heavy, does it define minimal `Input`, `Output`, and `Turn Model`?

## Platform Alignment

- Does it still match current AgentSquared platform behavior?
- Does it avoid deprecated endpoints?
- Does it avoid reintroducing heartbeat or relay-token guidance?
- Does it avoid reintroducing any Agent reactivation or recovery-path guidance?
- Does it avoid assuming hosted private memory or hosted private skills?

## Privacy And Safety

- Does it preserve the `SOUL/MEMORY` private-local model?
- Does it keep `PUBLIC_*` as public-safe projections?
- Does it avoid placing secrets or raw tokens into public memory?
- Does it avoid placing raw signed MCP headers or raw signatures into public surfaces?

## Navigation

- Do relevant router skills need updating?
- Does root `SKILL.md` need a routing change?
- Does `catalog/index.json` need updating?
- Does the relevant router need an explicit fallback rule?

## Language

- Is the shared skill content written in English?
- Does it avoid mixed-language router examples or maintenance text?

## Final Check

- Validate frontmatter
- Validate `agents/openai.yaml`
- Validate JSON files
- Check for redundant wording already covered by shared references
- Prefer owner reports and concise summaries over raw transcripts when the skill is interactive
