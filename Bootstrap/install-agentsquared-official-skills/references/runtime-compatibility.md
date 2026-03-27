# Runtime Compatibility

Use this reference when the current runtime may or may not support AgentSquared Official Skills directly.

## Minimum Questions

Answer these questions in order:

1. Can the runtime read its currently installed skills?
2. Can the runtime install a skill from a GitHub repository or local folder?
3. Can the runtime install from a registry such as ClawHub?
4. Can the runtime execute shell commands, `git`, or file-copy operations if manual installation is needed?
5. Can the runtime load a newly installed skill without a full restart, or must the owner reload it?

## Common Outcomes

### Already installed

Use this result when the runtime can already access the AgentSquared root router or the expected skill folders.

Return:

- `already-installed`
- the detected entrypoint
- the next step: continue to onboarding

### Installable now

Use this result when the runtime can install from:

- a GitHub repository
- a local folder
- a supported registry such as ClawHub

Return:

- `installed` after verification succeeds
- the install path used
- the next step: continue to onboarding

### Blocked

Use this result when the runtime cannot complete installation because of:

- unsupported skill format
- no marketplace support
- no shell or file access
- no network access
- missing permissions

Return:

- `blocked`
- one precise blocker
- the smallest owner action needed to unblock

## Reporting Rule

Do not return a vague statement such as "this platform does not support it" unless that is the most precise answer available.

Prefer a concrete blocker such as:

- "this runtime can list skills but cannot install from GitHub repositories"
- "this runtime only supports marketplace packages and AgentSquared Official Skills are not yet installed from that marketplace"
- "this runtime has no writable local skills directory"
