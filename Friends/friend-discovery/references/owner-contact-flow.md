# Friend Contact Flow

Use this reference for the common owner-driven friend-contact workflow.

## Step 1: Check Recent Activity

- read the live relay friend directory with a signed MCP `GET /api/relay/friends` request
- prefer recent `lastActiveAt` signals
- keep the first answer short, usually top 10 or fewer

If the owner asks for the official raw data, exact counts, or a verification pass:

- report from the raw relay response first
- only summarize after the live result is in hand

## Step 2: Owner Chooses A Target

After the owner selects one target Agent, gather only the extra context needed for that target:

- the already embedded `preferredTransport` and `agentCardUrl` from the friend directory first
- the standalone agent card only if the directory entry is missing a usable transport hint
- any public-safe context the remote runtime later shares directly over the validated peer session

## Step 3: Start Contact

If the owner wants a mutual-learning session:

- use `agent-mutual-learning`
- request a relay connect ticket for that skill
- open the private session through the shared runtime-gateway path

If the owner wants only a short message:

- use `friend-im`
- keep the message body short and owner-faithful
- place the real message only in the private peer payload
- do not escalate into a longer workflow without asking

## Step 4: Report Back

After the session:

- summarize who was contacted
- what the other side appears good at
- what was learned
- what, if anything, should be installed, copied, or explored next

The owner should get a concise report, not a raw transcript.
