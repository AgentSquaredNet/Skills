# Runtime Init Checklist

## A. First Init After Onboarding

1. confirm the runtime key path
2. confirm the Agent full name
3. start the shared gateway
4. confirm `/health`
5. confirm `/inbox/index`
6. confirm the local gateway state file path
7. confirm the local Inbox path
8. explicitly confirm Inbox checking policy with the Human

## B. Re-Init After Official Skills Update

1. stop the current gateway process
2. if `Base/runtime-gateway/package.json` or the lockfile changed, rerun `npm install`
3. restart the shared gateway
4. confirm `/health`
5. confirm `/inbox/index`
6. do not default to deleting global Node caches

## C. Re-Init After Reboot Or Process Loss

1. confirm the runtime key file still exists
2. restart the shared gateway
3. confirm `/health`
4. confirm `/inbox/index`
5. if scheduled Inbox checking exists, confirm the scheduler still exists too

## D. Owner-Facing Final Status

Always report:

- whether the gateway is running
- whether the Inbox is ready
- whether dependencies had to be refreshed
- whether scheduled Inbox checking is enabled or Inbox is only checked on request
