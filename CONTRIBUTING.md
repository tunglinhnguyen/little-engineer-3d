# Contributing

- Keep render, connection graph and simulation logic separated.
- Every new connector/behavior rule requires a unit test.
- New module geometry must stay performant on tablet-class GPUs.
- Do not use third-party branded model assets unless their license explicitly permits redistribution.
- Prefer child-readable Vietnamese copy: short instruction, one concept at a time.

Before a PR:

```bash
npm run check
npm run build
```
