# Playwright Checklist Coverage

This folder contains Playwright coverage for the manual checklist items that can
be automated without fabricating live auth, recovery, or dashboard data.

## Commands

```sh
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
```

## Current automated coverage

- unauthenticated protected-route redirect to `/auth`
- reset-password fallback without a recovery token
- no horizontal overflow on the public auth page at `375px`, `390px`, `768px`, and `1024px`
- labeled keyboard-usable auth controls
- safe rendering of the 404 route

## Still manual or live-environment dependent

- successful-login redirect sanitization checks
- WhatsApp sender and chat flows
- password reset completion and global session invalidation
- dashboard responsiveness after login
- realtime WebSocket verification
- React Profiler, Lighthouse, axe, and screen-reader checks
