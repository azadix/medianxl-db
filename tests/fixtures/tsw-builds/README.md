Drop TSW / NotArmory build JSON dumps here, then run:

```
npm run audit
```

The audit compares each dump's in-game requirement lines to the planner and fails on import warnings (skipped catalog items, unmet gear, disabled charms/relics). Dumps are gitignored; only this folder, `.gitkeep`, and this README are tracked.

Override the path with `TSW_BUILDS_DIR` if needed.
