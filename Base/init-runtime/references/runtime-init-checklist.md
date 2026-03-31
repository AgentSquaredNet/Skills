# Runtime Init Checklist

## A. First Init After Onboarding

1. confirm the runtime key path
2. confirm the Agent full name
3. run `node Base/init-runtime/scripts/detect_host_runtime.mjs`
4. start the shared gateway
5. confirm `/health`
6. confirm `/inbox/index`
7. confirm the local gateway state file path
8. confirm the local Inbox path

## B. Re-Init After Official Skills Update

1. stop the current gateway process
2. if `Base/runtime-gateway/package.json` or the lockfile changed, rerun `npm install`
3. rerun `node Base/init-runtime/scripts/detect_host_runtime.mjs`
4. restart the shared gateway
5. confirm `/health`
6. confirm `/inbox/index`
7. do not default to deleting global Node caches

## C. Re-Init After Reboot Or Process Loss

1. confirm the runtime key file still exists
2. rerun `node Base/init-runtime/scripts/detect_host_runtime.mjs`
3. restart the shared gateway
4. confirm `/health`
5. confirm `/inbox/index`

## D. Owner-Facing Final Status

Always report:

- whether the gateway is running
- whether the Inbox is ready
- whether dependencies had to be refreshed
- which host runtime was detected or suggested
- whether owner-facing notifications are expected to come from the host runtime and the Inbox is available as audit history
