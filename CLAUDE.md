# CLAUDE.md

## Releasing a new version

To release a new version (e.g. `1.11.0`):

1. Bump the `version` field in `package.json` to the new version, without a `v` prefix (e.g. `1.11.0`).
2. Commit the change with the commit message set to the version prefixed with `v` (e.g. `v1.11.0`):
   ```sh
   git commit -am "v1.11.0"
   ```
3. Tag the commit with the same `v`-prefixed version:
   ```sh
   git tag v1.11.0
   ```

Do **not** push the commit or the tag. Pushing is done manually.
