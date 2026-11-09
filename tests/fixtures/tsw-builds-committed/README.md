# Committed build fixtures

`tests/fixtures/tsw-builds/` is the local, git-ignored drop zone for TSW build dumps.
This folder is the **committed** subset: the few builds that CI and every contributor
needs to run the fixture-backed tests (`character-stat-oracles`,
`noctule-damage-fixture`, the source-parity suites, the stats audits, …).

Local files take precedence when both folders contain the same name.

## Add a build

```bash
npm run fixture:add -- "Miss_Peeled_04_11_2026_10_45.json"
```

The script copies the file from `tests/fixtures/tsw-builds/` here, validates the JSON,
and prints the `git add` command. Add `--remove` to delete it from this folder again.

Keep this folder small: only builds that a test names explicitly (or that the audits
need) should be committed. Everything else stays local.
