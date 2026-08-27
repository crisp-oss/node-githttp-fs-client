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

Options: `page`, `perPage`, `prefixPath`, `maximumDepth`, `includeHiddenFiles`, `fileNameStartsWith`, `includeDateFrom`, `includeDateTo`, `includeDateType`.

Lists all tracked files as a paginated tree of file and directory entries. Defaults to `page = 1` and `perPage = 100`. Pass `prefixPath` to list only files under a folder, and `maximumDepth` to limit how deep the tree goes. Hidden entries (dot-prefixed files and directories) are excluded by default; pass `includeHiddenFiles = true` to include them. Pass `fileNameStartsWith` to narrow the listing to files *and directories* whose leaf name begins with a given prefix, compared case-insensitively (a matched directory brings its whole subtree along). It accepts either a single prefix (a string) or an array of prefixes, in which case an entry matches if its leaf name begins with *any* of them. An empty string, an empty array, or an empty prefix are all rejected with a `400`.

Pass `includeDateFrom` and/or `includeDateTo` (a `Date`, or an RFC 3339 date-time string) to narrow the listing to files whose git date falls in the half-open window `[from, to)` — `from` inclusive, `to` exclusive. Each bound is independently optional; when both are given, `from` must be strictly before `to` (else `400`). `includeDateType` selects which date is compared: `"updated"` (the default, most recent commit touching the file) or `"created"` (oldest commit introducing it under its current path, renames not followed). Beware that, unlike every other listing mode, a date filter cannot be answered from git trees alone: it walks commit history, so its cost scales with history length (`"created"` always walks to the root of history). The filter is only active — and only paid for — when at least one bound is given.

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

#### `getFileContent(collectionId, tenantId, path, seek?): Promise<FileContent>`

Reads the content of a file. An optional `seek` object narrows `content` to a line window (see [Seek options](#seek-options)).

```ts
const file = await client.getFileContent("notes", "t_1", "articles/hello.md");
// { path: "articles/hello.md", content: "..." }
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

Reads several files in one request. The returned `files` array is index-aligned with `paths`: each slot is either a `{ path, content }` object, or `null` when that path does not exist. An optional `seek` object applies the same line window to every file (see [Seek options](#seek-options)). Each entry of `paths` is either a bare path string, or a `{ path, seek? }` object whose `seek` replaces the shared one for that file (no field-by-field merge).

```ts
const batch = await client.batchGetFileContents("notes", "t_1", [
  "articles/hello.md",
  "articles/missing.md",
  { path: "articles/long.md", seek: { lines_maximum: 10 } }
]);
// { files: [{ path, content }, null, { path, content }] }
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
