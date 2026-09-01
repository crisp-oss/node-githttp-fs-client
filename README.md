# node-githttp-fs-client

[![Build and Release](https://github.com/crisp-oss/node-githttp-fs-client/workflows/Build%20and%20Release/badge.svg)](https://github.com/crisp-oss/node-githttp-fs-client/actions?query=workflow%3A%22Build+and+Release%22) [![NPM](https://img.shields.io/npm/v/githttp-fs-client.svg)](https://www.npmjs.com/package/githttp-fs-client) [![Downloads](https://img.shields.io/npm/dt/githttp-fs-client.svg)](https://www.npmjs.com/package/githttp-fs-client)

**Git HTTP FS client for Node. Used in pair with Git HTTP FS, a git-backed content management database served over HTTP.**

Git HTTP FS Client is used to manage per-tenant Git content databases, over the Git HTTP FS HTTP API. All operations supported by the Git HTTP FS HTTP API are also supported in this client.

**🇵🇹 Crafted in Lisbon, Portugal.**

## How to install?

Include `githttp-fs-client` in your `package.json` dependencies.

Alternatively, you can run `npm install githttp-fs-client --save`.

## How to use?

Then, you can import `githttp-fs-client` and start listing and committing files:

```ts
import { GitHTTPFSClient } from "../lib/index.ts";

const client = new GitHTTPFSClient({
  baseUrl: "http://localhost:5355",
  apiKey: "MySecretAPIKey"
});

const files = await client.listFiles("<collection_id>", "<tenant_id>");

console.log("Listed files:", files);
```

## Available methods

All methods are asynchronous and reject with an `Error` carrying the HTTP status code when the server returns a non-success response.

### Base operations

#### `sendPing(): Promise<PingResult>`

Pings the server, to check that it is reachable and that the API key is valid.

```ts
const pong = await client.sendPing();
// { pong: true }
```

### Count operations

#### `countFiles(collectionId, tenantId, prefixPath?, maximumDepth?, includeHiddenFiles?, restrictFileExtensions?): Promise<FileCount>`

Counts files and directories, without pagination. `prefixPath`, `maximumDepth` and `includeHiddenFiles` scope the count exactly like `listFiles()`. Pass `restrictFileExtensions` (an array of extensions, compared case-insensitively) to only count files carrying one of those extensions — directories are counted regardless.

```ts
const count = await client.countFiles("notes", "t_1", "articles/", undefined, false, ["md", "mdx"]);
// { files: 12, directories: 3 }
```

### Tenant operations

#### `deleteTenant(collectionId, tenantId): Promise<void>`

Deletes an entire tenant repository, with all its files and history. **This is irreversible.**

```ts
await client.deleteTenant("notes", "t_1");
```

### File operations

#### `listFiles(collectionId, tenantId, options?): Promise<FileList>`

Options: `page`, `perPage`, `prefixPath`, `maximumDepth`, `includeHiddenFiles`, `fileNameStartsWith`, `includeDateFrom`, `includeDateTo`, `includeDateType`, `applyOrderIndex`, `implicitOrderDefaultIndex`.

Lists all tracked files as a paginated tree of file and directory entries. Defaults to `page = 1` and `perPage = 100`. Pass `prefixPath` to list only files under a folder, and `maximumDepth` to limit how deep the tree goes. Hidden entries (dot-prefixed files and directories) are excluded by default; pass `includeHiddenFiles = true` to include them. Pass `fileNameStartsWith` to narrow the listing to files *and directories* whose leaf name begins with a given prefix, compared case-insensitively (a matched directory brings its whole subtree along). It accepts either a single prefix (a string) or an array of prefixes, in which case an entry matches if its leaf name begins with *any* of them. An empty string, an empty array, or an empty prefix are all rejected with a `400`.

Pass `includeDateFrom` and/or `includeDateTo` (a `Date`, or an RFC 3339 date-time string) to narrow the listing to files whose git date falls in the half-open window `[from, to)` — `from` inclusive, `to` exclusive. Each bound is independently optional; when both are given, `from` must be strictly before `to` (else `400`). `includeDateType` selects which date is compared: `"updated"` (the default, most recent commit touching the file) or `"created"` (oldest commit introducing it under its current path, renames not followed). Beware that, unlike every other listing mode, a date filter cannot be answered from git trees alone: it walks commit history, so its cost scales with history length (`"created"` always walks to the root of history). The filter is only active — and only paid for — when at least one bound is given.

Pass `applyOrderIndex: true` to order every level of the listing by the file order stored for the directory it belongs to (see [Order operations](#order-operations)). Ordered entries come first, in their stored order, with files and directories interleaved freely; everything the stored order does not name follows in the ordinary order (directories first, then alphabetical). It defaults to `false`, and composes with every other option. Beware that this is the only listing mode which reads file contents (one small order index per listed directory).

Pass `implicitOrderDefaultIndex` (a number, unset by default) to choose where those unnamed entries land instead: it is the position they are all treated as holding, so `0` (or any negative value, e.g. `-1`) lifts every unordered entry *above* the whole stored order, while `2` slots them between its second and third entries. Unordered entries keep their ordinary relative order among themselves either way, and a directory holding no order at all is left untouched. It is only read when `applyOrderIndex` is `true`.

```ts
const list = await client.listFiles("notes", "t_1", {
  page: 1, perPage: 100, prefixPath: "articles/", maximumDepth: 2
});
// { files: [...], page: 1, per_page: 100, has_more: false }

// Files updated since a given date:
const recent = await client.listFiles("notes", "t_1", {
  includeDateFrom: new Date("2026-06-16T10:00:00Z"),
  includeDateType: "updated"
});
```

#### `getFileContent(collectionId, tenantId, path, seek?): Promise<FileContentPositioned>`

Reads the content of a file. An optional `seek` object narrows `content` to a line window (see [Seek options](#seek-options)).

The returned `position` is the zero-based position the file holds in the file order of its parent directory (see [Order operations](#order-operations)), so one read is enough to place a file among its siblings. It is `ORDER_POSITION_UNLISTED` (`-1`) when that order does not name the file, or when the directory holds no order at all — which is also the value `reorderFile()` takes to drop a file from an order, so what is read back can be sent back.

```ts
const file = await client.getFileContent("notes", "t_1", "articles/hello.md");
// { path: "articles/hello.md", content: "...", position: 2 }
```

#### `fileExists(collectionId, tenantId, path, options?): Promise<boolean>`

Checks whether a file exists, without reading its content (cheaper than `getFileContent()`). Pass `checkPrefixPath: true` to also count a directory at that path as existing (useful before a recursive delete or move).

```ts
const exists = await client.fileExists("notes", "t_1", "articles/hello.md");

// Does anything exist at this path, file or directory?
const anyExists = await client.fileExists("notes", "t_1", "articles", {
  checkPrefixPath: true
});
```

#### `writeFile(collectionId, tenantId, path, payload): Promise<void>`

Creates or updates a file, committing the change. The payload holds the `content`, the commit `author` (`{ name, email }`) and an optional commit `message`. If the content did not change, no new commit is created.

```ts
await client.writeFile("notes", "t_1", "articles/hello.md", {
  content: "Hello world!",
  author: { name: "Jane Doe", email: "jane@doe.com" },
  message: "feat: add hello article"
});
```

#### `deleteFile(collectionId, tenantId, path, payload): Promise<void>`

Deletes a file, committing the change. The payload holds the commit `author` and an optional `message`.

```ts
await client.deleteFile("notes", "t_1", "articles/hello.md", {
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

Set `allowPrefixPathRecurse: true` to let the path name a directory instead, deleting every file beneath it in a single commit (one webhook event per file). It only permits directory semantics: a path resolving to a file still runs the ordinary single-file delete.

```ts
await client.deleteFile("notes", "t_1", "articles", {
  author: { name: "Jane Doe", email: "jane@doe.com" },
  allowPrefixPathRecurse: true
});
```

#### `moveFile(collectionId, tenantId, path, payload): Promise<void>`

Moves (or renames) a file to the payload's `destination` path, committing the change. The payload also holds the commit `author` and an optional `message`.

```ts
await client.moveFile("notes", "t_1", "articles/hello.md", {
  destination: "archives/hello.md",
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

Set `allowPrefixPathRecurse: true` to let the path name a directory instead, relocating its whole subtree in a single commit (each file keeps its own leaf name, and emits its own move event). The `destination` must not already exist, and must not sit inside the source directory.

```ts
await client.moveFile("notes", "t_1", "articles", {
  destination: "archives",
  author: { name: "Jane Doe", email: "jane@doe.com" },
  allowPrefixPathRecurse: true
});
```

#### `reorderFile(collectionId, tenantId, path, payload): Promise<void>`

Moves a single file to the payload's numerical `position` in the file order of its parent directory, committing the change. The payload also holds the commit `author` and an optional `message`. Where `writeFileOrder()` replaces a whole directory's order at once, this is the incremental spelling: the file is dropped from wherever it currently sits and re-inserted at `position`, shifting the entries at and after it down by one.

`position` is zero-based, so `0` puts the file first, and it counts against the *whole parent directory* rather than against the entries the order happens to name: the order is materialized over every entry the directory holds before the move, so `position` means the row the caller was looking at. A position past the end is clamped to the tail rather than rejected. A directory holding no order yet gets one covering it — unlike the implicit upkeep that only ever edits an existing order, asking for a position is explicit, so the first reorder in a directory pins all of its entries, which is what makes the next one land where the caller expects. A request whose result matches the stored order creates no commit.

Pass `implicitOrderDefaultIndex` (a number, unset by default) to say where the siblings the order does not name yet are folded in when it is materialized. It is the same number, with the same meaning, as [the `listFiles()` option of that name](#listfilescollectionid-tenantid-options-promisefilelist): unset leaves them behind everything the order names, `0` (or any negative value) lifts them above it, `2` slots them between its second and third entries. A caller reordering inside a rendered listing passes back whatever it rendered with, and the order it gets is the sequence it was showing. It is inert with `position: ORDER_POSITION_UNLISTED`, which materializes nothing.

```ts
await client.reorderFile("notes", "t_1", "articles/hello.md", {
  position: 0,
  implicitOrderDefaultIndex: 0,
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

Pass `position: ORDER_POSITION_UNLISTED` (`-1`, the only accepted negative value, and the value `getFileContent()` reports for an unordered file) for the inverse operation: the file is dropped from the order and left implicitly ordered again, the file itself untouched, and the order is *not* materialized (unpinning one entry is no reason to pin every other one). When it was the order's last entry, the order is dropped entirely.

```ts
import { ORDER_POSITION_UNLISTED } from "githttp-fs-client";

await client.reorderFile("notes", "t_1", "articles/hello.md", {
  position: ORDER_POSITION_UNLISTED,
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

Set `allowPrefixPath: true` to let the path name a directory instead, positioning **that directory itself** among its siblings (an order interleaves files and directories freely). Nothing recurses — hence no `_recurse` suffix, unlike on `deleteFile()` and `moveFile()`: the directory's contents are untouched, and orders stored inside it keep ordering their own directory. Like its siblings the flag only permits: a path resolving to a file behaves identically with it on, while a directory path without it is simply "not a file" and rejects with a `404`.

```ts
await client.reorderFile("notes", "t_1", "articles/getting-started", {
  position: 1,
  author: { name: "Jane Doe", email: "jane@doe.com" },
  allowPrefixPath: true
});
```

### Order operations

A directory may pin the presentation order of its own entries. The order is stored per directory, holds leaf names only (a directory entry carrying a trailing slash, a file none), and may be sparse: entries it does not name simply follow in the ordinary listing order. It is a resource of its own, never a file — it never shows up in `listFiles()`, `countFiles()` or `getFileContent()`, whatever `includeHiddenFiles` says. Pass `applyOrderIndex: true` to `listFiles()` to have it applied.

Every method takes the directory as a repo-relative path, with an empty string (or, on `getFileOrder()`, no argument at all) meaning the repository root. These methods address a whole directory's order at once; to move a single entry within one, see [`reorderFile()`](#reorderfilecollectionid-tenantid-path-payload-promisevoid).

#### `getFileOrder(collectionId, tenantId, directory?): Promise<FileOrder>`

Reads the file order stored for a directory. Entries come back in the canonical spelling the server stores: directories with a trailing slash, files without. A directory holding no order rejects with a `404` error — not an empty `order` array — so "unordered" and "ordered as nothing" cannot be confused.

```ts
const order = await client.getFileOrder("notes", "t_1", "articles");
// { directory: "articles", order: ["intro.md", "getting-started/", "advanced.mdx"] }
```

#### `writeFileOrder(collectionId, tenantId, directory, payload): Promise<void>`

Replaces a directory's file order, committing the change. The payload holds the `order` entries, the commit `author` and an optional `message`.

`order` must hold at least one entry (an empty order is a `400` — that is what `deleteFileOrder()` is for), and each entry must be a leaf name existing in that directory: a nested path, a duplicate, or a name pointing at nothing all reject with a `400`. A trailing slash marking a directory is accepted and normalized. Writing the order the directory already holds creates no commit.

```ts
await client.writeFileOrder("notes", "t_1", "articles", {
  order: ["intro.md", "getting-started/", "advanced.mdx"],
  author: { name: "Jane Doe", email: "jane@doe.com" },
  message: "chore: order articles"
});
```

#### `deleteFileOrder(collectionId, tenantId, directory, payload): Promise<void>`

Drops a directory's file order, reverting it to the default listing order, committing the change. The payload holds the commit `author` and an optional `message`. A directory holding no order rejects with a `404` error.

```ts
await client.deleteFileOrder("notes", "t_1", "articles", {
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

Note that an order stays honest on its own: deleting or moving a file updates the orders naming it, in the very same commit (a rename within one directory keeps its position, a move out drops it).

### Commit operations

#### `listCommits(collectionId, tenantId, page?, perPage?, filePath?): Promise<CommitList>`

Lists commits, most recent first, with pagination. Defaults to `page = 1` and `perPage = 100`. Pass `filePath` to only list commits that touched a given file. Pass `includeStatistics: true` to add a `statistics` (`{ insertions, deletions, files_changed }`) object to each commit.

```ts
const commits = await client.listCommits("notes", "t_1", { page: 1, perPage: 10 });
// { commits: [{ sha, message, author, committed_at }, ...], ... }
```

#### `getCommitDetail(collectionId, tenantId, sha): Promise<CommitDetail>`

Returns the details of a commit, with per-file diffs, content snapshots, and aggregate `statistics` (`{ insertions, deletions, files_changed }`).

```ts
const detail = await client.getCommitDetail("notes", "t_1", "9b924c1d...");
// { sha, message, author, committed_at, files: [{ path, change, content, diff }], statistics: { insertions, deletions, files_changed } }
```

#### `revertCommit(collectionId, tenantId, sha, payload): Promise<void>`

Reverts a commit, as a new commit. The payload holds the commit `author` and an optional `message`.

```ts
await client.revertCommit("notes", "t_1", "9b924c1d...", {
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

#### `rollbackCommit(collectionId, tenantId, sha, payload): Promise<void>`

Rolls every file the commit touched back to the exact state it had **at** that commit, as a new commit. Where `revertCommit()` undoes what the commit did, this discards every later change to those same paths: a file deleted since comes back, and a file that commit deleted is deleted again. Files the commit never touched are left alone. The payload is the same as for a revert: the commit `author` and an optional `message` (no paths, they are read from the commit itself).

```ts
await client.rollbackCommit("notes", "t_1", "9b924c1d...", {
  author: { name: "Jane Doe", email: "jane@doe.com" }
});
```

### Batch operations

#### `batchGetFileContents(collectionId, tenantId, paths, seek?): Promise<FileContentBatch>`

Reads several files in one request. The returned `files` array is index-aligned with `paths`: each slot is either a `{ path, content }` object, or `null` when that path does not exist. An optional `seek` object applies the same line window to every file (see [Seek options](#seek-options)). Each entry of `paths` is either a bare path string, or a `{ path, seek? }` object whose `seek` replaces the shared one for that file (no field-by-field merge). Unlike `getFileContent()`, the slots carry no `position`: a batch spans arbitrary directories, so ordering information would cost one order read per distinct parent — when order matters, `listFiles()` with `applyOrderIndex: true` answers it for a whole tree in one pass.

```ts
const batch = await client.batchGetFileContents("notes", "t_1", [
  "articles/hello.md",
  "articles/missing.md",
  { path: "articles/long.md", seek: { lines_maximum: 10 } }
]);
// { files: [{ path, content }, null, { path, content }] }
```

#### `batchReplayHook(collectionId, tenantId, direction, options?): Promise<HookReplay>`

Options: `files`, `prefixPath`, `includeHiddenFiles`, `delayMs`.

Replays file webhooks, so a downstream mirror that drifted out of sync can converge again. Webhook delivery is only durable in memory, so a receiver that was down past its retry budget (or that mis-applied an event) ends up holding a state the server never agreed to. This repairs it **in place**, rather than by wiping and re-pushing everything. Nothing is committed: no commit is created and no file is touched, the call only enqueues hook work.

Pass `files` as the list of paths the **mirror** currently holds — never a list of things to act on. The server intersects it with what it holds itself, and `direction` picks which side of that intersection gets replayed:

| `direction` | Replays | Which files | Repairs |
|-------------|---------|-------------|---------|
| `"delete"` | `file.deleted` | Everything **outside** the intersection — the mirror holds them, the server does not | Orphaned rows the mirror kept after a missed deletion |
| `"create"` | `file.created` | Everything **inside** it — the server holds them, so the mirror should too | Rows the mirror is missing, or whose content went stale |

`files` is optional, and omitting it defaults it to every file the server holds in scope. The two directions then fall out differently: `"create"` covers the whole scope (the common "push everything you have at me" re-sync), while `"delete"` replays nothing at all, since the server cannot be missing what it just listed. Passing an empty array is a `400` — leave the option out instead. Paths are repo-root-relative, must be unique, and must not name an order index (a `400`, since orders are a separate resource that never leaves through the file routes).

Pass `prefixPath` to scope the server-side snapshot to one folder, with the same semantics as `listFiles()`. Paths in `files` stay repo-root-relative, so it acts as a guard rail rather than a join: an entry that does not sit under it is a `400`. `includeHiddenFiles` (default `false`) is only meaningful **when `files` is omitted**, where it shapes the default set exactly as on `listFiles()` — when `files` is given, the snapshot always includes hidden files, or a hidden file would fall outside the intersection and replay a deletion for a file that is still there.

Pass `delayMs` to pause that many milliseconds *between* consecutive deliveries (never after the last one), capped at `60000`. It is a throttle to spare a receiver from a sustained burst, not an ordering device: delivery is already strictly sequential per repository. Its cost is that a replay holds that repository's hook queue for `delayMs × files`, so every commit accepted after it waits behind it — to go slower, replay in several `prefixPath`-scoped passes rather than raising the delay.

The returned `files` is how many files the batch affected, and `commit_sha` is the HEAD the snapshot was computed against (no commit was created). The call returns as soon as the job is enqueued, so it means "scheduled", not "delivered". Replayed payloads carry an extra `"replayed": true` field and keep their ordinary event name, so an existing receiver handler runs again unmodified — which means a `"create"` receiver must treat `file.created` as insert-or-replace rather than a bare insert. The server rejects the call with a `400` when it has no webhook receiver configured at all.

```ts
// Repair orphans: the mirror holds these three, drop whichever the server does not
const orphans = await client.batchReplayHook("notes", "t_1", "delete", {
  files: ["articles/hello.md", "articles/removed.md", "articles/stale.md"]
});
// { commit_sha: "a3f9c1d...", files: 2 }

// Full re-sync of one folder, throttled to 10 hooks per second
const resync = await client.batchReplayHook("notes", "t_1", "create", {
  prefixPath: "articles/",
  delayMs: 100
});
```

### Seek options

`getFileContent()` and `batchGetFileContents()` accept an optional `seek` object, which narrows the returned `content` to a line window instead of the whole file. All fields are optional and combinable:

- `from_line_starts_with` — array of prefixes: the window starts at the first line starting with any of them (that line included). When no line matches, the window is empty. Omitted: the window starts at the first line.
- `to_line_starts_with` — array of prefixes: the window stops at the first line (after the window's first line) starting with any of them, that line included. When no line matches, the window runs to the end of the file. The exported `SEEK_TO_FROM_LINE_STARTS_WITH` meta value can be used (bare, or inside prefixes) as a placeholder for whichever `from` prefix actually matched.
- `lines_maximum` — caps the window to this many lines.

```ts
import { SEEK_TO_FROM_LINE_STARTS_WITH } from "githttp-fs-client";

// Select a whole front-matter block (both "---" markers included)
const frontMatter = await client.getFileContent("notes", "t_1", "articles/hello.md", {
  from_line_starts_with: ["---"],
  to_line_starts_with: SEEK_TO_FROM_LINE_STARTS_WITH
});

// Read at most the first 10 lines of each file
const previews = await client.batchGetFileContents("notes", "t_1", paths, {
  lines_maximum: 10
});
```

## What is Git HTTP FS?

ℹ️ **Wondering what Git HTTP FS is?** Check out **[crisp-oss/githttp-fs](https://github.com/crisp-oss/githttp-fs)**.
