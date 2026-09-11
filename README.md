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

Every timestamp returned by the API is an **RFC 3339 date-time in UTC** (eg. `"2026-06-16T10:00:00Z"`), whatever the route — `committed_at` on the commit routes, and every `*_at` field on the health ones. Pass one through `new Date(...)` when a `Date` is what you need.

### Base operations

#### `sendPing(): Promise<PingResult>`

Pings the server, to check that it is reachable and that the API key is valid.

A master and a standalone server answer with `pong` alone. A **read-only replica** also carries a `replica` object describing its own following: `state` (`"ready"` once it holds content worth serving, else `"bootstrapping"`), `sync` (one word on whether it is keeping up: `"synced"`, `"lagging"`, `"stalled"` or `"halted"`), `stream_connected` (whether its live notification stream to the master is up, where `false` only means it is converging on its poll interval instead), `last_reconcile_at` (when it last compared its whole repository set against the master, `null` before the first pass) and `pending_repositories`. That is what lets a client failing over between nodes tell a node that is current from one that is still bootstrapping or cut off from its master.

Unlike the health routes below, this one **is** authenticated, which is what makes it the probe to use to verify an API key.

```ts
const pong = await client.sendPing();
// { pong: true }

// On a replica:
// {
//   pong: true,
//   replica: {
//     state: "ready",
//     sync: "synced",
//     stream_connected: true,
//     last_reconcile_at: "2026-06-16T10:00:00Z",
//     pending_repositories: 0
//   }
// }
```

### Health operations

The two health routes below are the **only unauthenticated routes on the API**: this client sends them no API key at all. They exist to answer questions asked before a credential is held, or when the credential is exactly what is in doubt — a load balancer picking a node, a rollout probe, a dashboard covering a whole deployment — so requiring the key there would turn a health probe into a secret-distribution problem. Neither opens a repository or names a tenant. Use `sendPing()`, not these, to verify that an API key works.

#### `getHealthStatus(): Promise<HealthStatus>`

Reads what this process is, in the smallest honest terms: `status` (`"healthy"`, or `"bootstrapping"` on a replica that holds no content yet), the `name` and `version` of the build running, its `role` (`"master"`, `"replica"` or `"standalone"`), whether it is `writable`, and `started_at` (RFC 3339) with the `uptime_secs` since.

It is free of I/O — every field is read from the config or from memory — so an anonymous caller cannot make the node do work by asking, and it may be polled at whatever interval a monitor likes. It always answers `200`, including while a replica is bootstrapping: the status code says the process is alive enough to answer, and the body says what it can serve. Read `writable` to pick the node to send writes to, instead of discovering it from a rejection.

```ts
const health = await client.getHealthStatus();
// {
//   status: "healthy",
//   name: "githttp-fs",
//   version: "1.10.2",
//   role: "master",
//   writable: true,
//   started_at: "2026-06-16T10:00:00Z",
//   uptime_secs: 3600
// }
```

#### `getReplicationStatus(): Promise<ReplicationStatus>`

Reads the replication picture as the server sees it. Every node answers it, whatever its role — including one with no replication configured at all, which reports `role: "standalone"` — so a single probe works against a whole deployment without the caller knowing which node is which.

- `status` — **the one field to alert on**, present on every role: `"healthy"`, `"degraded"` (converging on its own) or `"halted"` (something needs a human). A master folds in what its replicas report, so one probe against the master covers the set.
- `issues` — what is halted, and why. Each entry is tagged with a `kind` (`"replica_ahead"`, `"history_diverged"`, `"identity_mismatch"`, `"deletion_refused"`, `"identity_file_missing"`, `"identity_file_changed"`, `"node_id_collision"`), carries the fields that kind needs, and is stamped `since`, so a fresh problem is distinguishable from one ignored for a week. Empty unless `status` is `"halted"`. The type is a discriminated union, so switching on `kind` narrows the rest.
- `node` — the answering node: its `node_id`, its `role`, the data-set `identity` it serves (`null` on a standalone node, and on a replica that has not paired yet), and how many `repositories` it holds right now.
- `master` — the write node of the set, as far as the answering node knows: `node_id`, the `url` it follows (`null` on the master itself and on a standalone node), whether it is `reachable`, `last_contact_at`, and `last_error` when the last attempt failed.
- `replicas` — every replica known to follow the master. Each row separates what the master *observed* (`stream_connected`, `connected_at`, `last_contact_at`, `packs_delivered`) from what the replica *reported* (`repositories`, `pending_repositories`, `sync`, as of `reported_at`) — only a replica can know how far behind it is. Rows are kept after a replica disconnects, flagged `stream_connected: false`.
- `replica` — present on a replica only, and a superset of the `replica` field of `sendPing()`: it adds `last_success_at` (when a pass last ended with nothing failed), `locked_repositories` (held and served, but not synced, pending an operator — one `issues` entry each) and `consecutive_failures`.
- `observed_at` and `replicas_observed_at` — when this answer was built, and when `replicas` was last true. They match on a master (it watches those connections itself); on a replica, `replicas_observed_at` is when the master last said so, so a roster served while the master is down reads as visibly stale rather than quietly wrong (`null` when the replica never reached its master).

This body names peer node ids and the master's URL, so it describes a deployment's topology to anyone who can reach the port. None of it is a credential, but an operator who treats internal hostnames as sensitive should keep the port off the public internet.

```ts
const replication = await client.getReplicationStatus();
// {
//   protocol: 1,
//   status: "healthy",
//   issues: [],
//   node: { node_id: "replica-eu", role: "replica", identity: "b0c1...", repositories: 128 },
//   master: {
//     node_id: "master-1",
//     url: "http://master-1:5356",
//     reachable: true,
//     last_contact_at: "2026-06-16T10:03:09Z",
//     last_error: null
//   },
//   replicas: [{ node_id: "replica-eu", stream_connected: true, packs_delivered: 42, sync: "synced", ... }],
//   replica: {
//     state: "ready",
//     sync: "synced",
//     stream_connected: true,
//     last_reconcile_at: "2026-06-16T10:03:09Z",
//     last_success_at: "2026-06-16T10:03:09Z",
//     pending_repositories: 0,
//     locked_repositories: 0,
//     consecutive_failures: 0
//   },
//   observed_at: "2026-06-16T10:03:19Z",
//   replicas_observed_at: "2026-06-16T10:03:09Z"
// }

// Alerting, in one field:
if (replication.status === "halted") {
  for (const issue of replication.issues) {
    console.error(`githttp-fs needs an operator: ${issue.kind} since ${issue.since}`);
  }
}
```

Note that **writes sent to a replica reject with a `423` error** — a replica is not a server missing those endpoints, it is the wrong node for them, and it will still be the wrong node once it has caught up, so the answer carries no retry hint: send the write to the master instead. A replica that holds no content at all (still bootstrapping) separately refuses *reads* with a `503` and a `Retry-After` header, since an empty repository is not stale but wrong. `sendPing()` and both health routes stay answerable throughout, so a node refusing everything else can still explain itself.

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

Pass `implicitAllowHiddenFiles: true` to fold hidden (dot-prefixed) siblings into the materialized order as well. It defaults to `false`, which keeps them out — the same judgement `includeHiddenFiles: false` makes on a listing, and the right default for an order the server generates from a directory rather than one the caller dictates entry by entry. A hidden entry the order *already* names is kept regardless: it was pinned deliberately, and positioning an unrelated file is no occasion to unpin it. The flag is **required** (as `true`, else a `400`) when the file being positioned is itself hidden, since pinning a dot-file has to be asked for. Like `implicitOrderDefaultIndex` it is inert with `position: ORDER_POSITION_UNLISTED`, which materializes nothing and only ever unpins — so a hidden entry pinned earlier can always be dropped without the flag.

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

Hidden (dot-prefixed) entries stay out of an order unless asked for, since an order is a presentation order and a dot-file is by convention not presented: `writeFileOrder()` rejects one without `allowHiddenFiles: true`, and `reorderFile()` leaves hidden siblings out of the order it materializes without `implicitAllowHiddenFiles: true`. Neither traps them: an order that already names a hidden entry keeps it, and `reorderFile()` can always unpin one.

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

A hidden (dot-prefixed) entry rejects with a `400` unless the payload sets `allowHiddenFiles: true`: an order is a presentation order, and a dot-file is by convention not presented, so pinning one has to be asked for. It rejects rather than being silently dropped — the caller sent that name and that position, and storing a different order than the one they wrote would be worse than the error. With the flag on, hidden entries are ordinary entries, subject to every other rule unchanged.

```ts
await client.writeFileOrder("notes", "t_1", "articles", {
  order: ["intro.md", "getting-started/", "advanced.mdx"],
  allowHiddenFiles: false,
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
