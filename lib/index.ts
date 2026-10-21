/*
 * node-githttp-fs-client
 *
 * Copyright 2026, Valerian Saliou
 * Author: Valerian Saliou <valerian@valeriansaliou.name>
 */

/**
 * Configuration for the Git HTTP FS API client.
 */
export interface ClientConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Common types
 */
export interface CommitAuthor {
  email: string;
  name: string;
}

/**
 * Types shared by sendPing() and getReplicationStatus()
 *
 * Note: every timestamp on this API is an RFC 3339 date-time in UTC (eg. \
 *   "2026-06-16T10:00:00Z"), the same spelling as 'committed_at' on the \
 *   commit routes. Pass one through 'new Date(...)' to get a Date back.
 */
export type ReplicaState = "ready" | "bootstrapping";

/**
 * Whether a replica is keeping up, and whether it will on its own: \
 *   "synced" (the last pass succeeded, nothing pending or locked), \
 *   "lagging" (work pending, but passes are landing), "stalled" (several \
 *   passes in a row failed) or "halted" (something needs an operator, see \
 *   the 'issues' of getReplicationStatus()). Alert on "halted", warn on \
 *   "stalled".
 */
export type ReplicaSyncStatus = "synced" | "lagging" | "stalled" | "halted";

/**
 * Types for sendPing()
 */
export interface PingReplica {
  state: ReplicaState;
  sync: ReplicaSyncStatus;
  stream_connected: boolean;
  last_reconcile_at: string | null;
  pending_repositories: number;
}

export interface PingResult {
  pong: boolean;

  // Only present when the answering node is a read-only replica (a master \
  //   and a standalone server answer with 'pong' alone)
  replica?: PingReplica;
}

/**
 * Types shared by getHealthStatus() and getReplicationStatus()
 */
export type ReplicationRole = "master" | "replica" | "standalone";

/**
 * Types for getHealthStatus()
 */
export type HealthState = "healthy" | "bootstrapping";

export interface HealthStatus {
  status: HealthState;
  name: string;
  version: string;
  role: ReplicationRole;
  writable: boolean;
  started_at: string;
  uptime_secs: number;
}

/**
 * Types for getReplicationStatus()
 */
export type ReplicationNodeStatus = "healthy" | "degraded" | "halted";

export interface ReplicationNode {
  node_id: string;
  role: ReplicationRole;

  // The data-set identity this node serves (null on a standalone node, and \
  //   on a replica that has not paired with its master yet)
  identity: string | null;

  repositories: number;
}

export interface ReplicationMaster {
  node_id: string | null;
  url: string | null;
  reachable: boolean;
  last_contact_at: string | null;
  last_error: string | null;
}

/**
 * One replica, as the master sees it. The field names say who witnessed \
 *   what: 'stream_connected', 'connected_at', 'last_contact_at' and \
 *   'packs_delivered' are facts the master observed, while 'repositories', \
 *   'pending_repositories' and 'sync' are what the replica volunteered as \
 *   of 'reported_at'.
 */
export interface ReplicationReplica {
  node_id: string;
  stream_connected: boolean;
  connected_at: string | null;
  last_contact_at: string | null;
  packs_delivered: number;
  repositories: number | null;
  pending_repositories: number | null;
  sync: ReplicaSyncStatus | null;
  reported_at: string | null;
}

/**
 * How a replica sees its own following. Reported by the replica itself, since \
 *   it is the only node that can know how far behind its disk is.
 */
export interface ReplicationFollower {
  state: ReplicaState;
  sync: ReplicaSyncStatus;
  stream_connected: boolean;
  last_reconcile_at: string | null;
  last_success_at: string | null;
  pending_repositories: number;

  // Repositories this replica holds but refuses to sync until an operator \
  //   looks at them (one 'replica_ahead' or 'history_diverged' issue each)
  locked_repositories: number;

  consecutive_failures: number;
}

/**
 * Something a node stopped doing on its own and is waiting on an operator \
 *   for. Tagged with 'kind' so an alert can match on it, and stamped with \
 *   'since' so a fresh problem is distinguishable from one ignored for a \
 *   week.
 */
export interface ReplicationIssueRepository {
  // The replica holds more history than its master announced \
  //   ('replica_ahead'), or neither head descends from the other \
  //   ('history_diverged'). The local copy is kept and still served, and \
  //   that one repository stops syncing until an operator decides
  kind: "replica_ahead" | "history_diverged";
  collection_id: string;
  tenant_id: string;
  local: string;
  remote: string;
  since: string;
}

export interface ReplicationIssueIdentityMismatch {
  // The master states a data-set identity other than the one this replica \
  //   pinned: it is following the wrong set, so nothing is pulled
  kind: "identity_mismatch";
  pinned: string;
  stated: string;
  since: string;
}

export interface ReplicationIssueDeletionRefused {
  // Applying the master's listing would delete more than half of what this \
  //   replica holds, so the deletions were refused (updates keep flowing)
  kind: "deletion_refused";
  would_delete: number;
  held: number;
  since: string;
}

export interface ReplicationIssueIdentityFile {
  // This node's own '.replication.json' went missing or changed under it, \
  //   so its listing is served as incomplete and no follower infers \
  //   deletions from it
  kind: "identity_file_missing" | "identity_file_changed";
  path: string;
  expected?: string;
  found?: string;
  since: string;
}

export interface ReplicationIssueNodeIdCollision {
  // Two processes present the same 'node_id' (on a master: the second \
  //   stream was refused; on a replica: its own stream is being refused)
  kind: "node_id_collision";
  node_id: string;
  since: string;
}

export type ReplicationIssue =
  ReplicationIssueRepository |
  ReplicationIssueIdentityMismatch |
  ReplicationIssueDeletionRefused |
  ReplicationIssueIdentityFile |
  ReplicationIssueNodeIdCollision;

export interface ReplicationStatus {
  protocol: number;

  // The one field to alert on, present on every role. A master folds in \
  //   what its replicas report, so one probe against it covers the set
  status: ReplicationNodeStatus;

  issues: Array<ReplicationIssue>;

  node: ReplicationNode;
  master: ReplicationMaster;
  replicas: Array<ReplicationReplica>;

  // Only present when the answering node is a replica
  replica?: ReplicationFollower;

  observed_at: string;

  // When 'replicas' was last true: the answer time on a master, and the last \
  //   time the master said so on a replica (null when a replica never \
  //   reached its master)
  replicas_observed_at: string | null;
}

/**
 * Types for countFiles()
 */
export interface FileCount {
  files: number;
  directories: number;
}

export interface CountFilesOptions {
  prefixPath?: string;
  maximumDepth?: number;
  includeHiddenFiles?: boolean;
  restrictFileExtensions?: Array<string>;
}

/**
 * Types for listFiles()
 */
export interface FileListEntityFile {
  name: string;
  position?: number;
  type: "file";
}

export interface FileListEntityDirectory {
  name: string;
  children: Array<FileListFile>;
  position?: number;
  type: "directory";
}

export type FileListFile = FileListEntityFile | FileListEntityDirectory;

export interface FileList {
  files: Array<FileListFile>;
  page: number;
  per_page: number;
  has_more: boolean;
}

export type ListFilesDateType = "updated" | "created";

export interface ListFilesOptions {
  page?: number;
  perPage?: number;
  prefixPath?: string;
  maximumDepth?: number;
  includeHiddenFiles?: boolean;
  fileNameStartsWith?: string | Array<string>;
  filePaths?: string | Array<string>;
  includeDateFrom?: string | Date;
  includeDateTo?: string | Date;
  includeDateType?: ListFilesDateType;
  applyOrderIndex?: boolean;
  implicitOrderDefaultIndex?: number;
}

/**
 * Types for getFileContent()
 */
export interface FileContent {
  content: string;
  path: string;
}

export interface FileContentPositioned extends FileContent {
  position: number;
}

export interface GetFileContentOptions {
  seek?: FileSeekOptions;
}

/**
 * Types for seek options (getFileContent() and batchGetFileContents())
 */
export const SEEK_TO_FROM_LINE_STARTS_WITH = "$seek_from_line_starts_with";

/**
 * Position of an entry that the file order index of its parent directory does \
 *   not name (or whose directory holds no order at all). Reported by \
 *   getFileContent(), and accepted by reorderFile() to drop an entry from the \
 *   index again.
 */
export const ORDER_POSITION_UNLISTED = -1;

export interface FileSeekOptions {
  from_line_starts_with?: Array<string>;
  to_line_starts_with?: Array<string> | typeof SEEK_TO_FROM_LINE_STARTS_WITH;
  lines_maximum?: number;
}

/**
 * Types for writeFile()
 */
export interface FileWritePayload {
  author: CommitAuthor;
  content: string;
  message?: string;
}

/**
 * Types for fileExists()
 */
export interface FileExistsOptions {
  checkPrefixPath?: boolean;
}

/**
 * Types for deleteFile()
 */
export interface FileDeletePayload {
  author: CommitAuthor;
  message?: string;
  allowPrefixPathRecurse?: boolean;
}

/**
 * Types for moveFile()
 */
export interface FileMovePayload {
  author: CommitAuthor;
  destination: string;
  message?: string;
  allowPrefixPathRecurse?: boolean;
}

/**
 * Types for reorderFile()
 */
export interface FileReorderPayload {
  author: CommitAuthor;
  position: number;
  implicitOrderDefaultIndex?: number;
  implicitAllowHiddenFiles?: boolean;
  message?: string;
  allowPrefixPath?: boolean;
}

/**
 * Types for getFileOrder()
 */
export interface FileOrder {
  directory: string;
  order: Array<string>;
}

/**
 * Types for writeFileOrder()
 */
export interface FileOrderWritePayload {
  author: CommitAuthor;
  order: Array<string>;
  message?: string;
  allowHiddenFiles?: boolean;
}

/**
 * Types for deleteFileOrder()
 */
export interface FileOrderDeletePayload {
  author: CommitAuthor;
  message?: string;
}

/**
 * Types shared by listCommits() and getCommitDetail()
 */
export interface CommitStatistics {
  insertions: number;
  deletions: number;
  files_changed: number;
}

/**
 * Types for listCommits()
 */
export interface CommitListCommit {
  author: CommitAuthor;
  committed_at: string;
  message: string;
  sha: string;
  statistics?: CommitStatistics;
}

export interface CommitList {
  commits: Array<CommitListCommit>;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface ListCommitsOptions {
  page?: number;
  perPage?: number;
  filePath?: string;
  includeStatistics?: boolean;
}

/**
 * Types for getCommitDetail()
 */
export interface CommitDetailFile {
  path: string;
  change: string;
  content: string;
  diff: string;
}

export interface CommitDetail {
  sha: string;
  message: string;
  author: CommitAuthor;
  committed_at: string;
  files: Array<CommitDetailFile>;
  statistics: CommitStatistics;
}

/**
 * Types for revertCommit()
 */
export interface CommitRevertPayload {
  author: CommitAuthor;
  message?: string;
}

/**
 * Types for rollbackCommit()
 */
export type CommitRollbackPayload = CommitRevertPayload;

/**
 * Types for batchGetFileContents()
 */
export type FileContentBatchPath = string | {
  path: string;
  seek?: FileSeekOptions;
};

export interface FileContentBatch {
  files: Array<FileContent | null>;
}

export interface BatchGetFileContentsOptions {
  seek?: FileSeekOptions;
}

/**
 * Types for batchReplayHook()
 */
export type HookReplayDirection = "delete" | "create";

export interface HookReplay {
  commit_sha: string;
  files: number;
}

export interface BatchReplayHookOptions {
  files?: Array<string>;
  prefixPath?: string;
  includeHiddenFiles?: boolean;
  delayMs?: number;
}

/**
 * Error types
 *
 * Note: every method rejects with a 'GitHTTPFSError' (or one of its \
 *   subclasses, one per HTTP status family), so a caller can pick what it \
 *   considers normal (eg. a missing file) from what it considers abnormal \
 *   (eg. a server failure) with either 'instanceof' or the finer 'code'.
 */
export type GitHTTPFSErrorCode =
  // 404
  "file_not_found" |
  "commit_not_found" |
  "order_not_found" |
  "tenant_not_found" |
  "not_found" |

  // 400
  "invalid_tenant" |
  "invalid_path" |
  "invalid_operation" |
  "bad_request" |

  // 401
  "unauthorized" |

  // 422
  "invalid_utf8" |
  "unprocessable" |

  // 423
  "read_only_replica" |

  // 503
  "replica_bootstrapping" |
  "unavailable" |

  // 5xx
  "git_error" |
  "io_error" |
  "task_failed" |
  "server_error" |

  // No response at all (eg. connection refused, DNS failure)
  "network_error" |

  // Any other status
  "unknown";

export interface GitHTTPFSErrorDetails {
  code: GitHTTPFSErrorCode;
  method: string;
  url: string;
  status?: number | null;
  serverMessage?: string | null;
  detail?: string | null;
  retryAfter?: number | null;
  cause?: unknown;
}

/**
 * Base error for everything the client rejects with.
 */
export class GitHTTPFSError extends Error {
  override name = "GitHTTPFSError";

  /** Machine-readable error kind (stable, safe to switch on) */
  readonly code: GitHTTPFSErrorCode;

  /** HTTP status code ('null' when no response was received) */
  readonly status: number | null;

  /** HTTP method of the failed request */
  readonly method: string;

  /** Full URL of the failed request */
  readonly url: string;

  /** Raw error message as sent by the server ('null' when none) */
  readonly serverMessage: string | null;

  /** Subject of the error when the server names one, ie. the file path, \
        commit SHA, directory or tenant ID that was not found or invalid \
        ('null' otherwise) */
  readonly detail: string | null;

  /** Seconds to wait before retrying, from the 'Retry-After' header \
        ('null' when absent) */
  readonly retryAfter: number | null;

  constructor(message: string, details: GitHTTPFSErrorDetails) {
    super(message, { cause: details.cause });

    this.code = details.code;
    this.status = details.status ?? null;
    this.method = details.method;
    this.url = details.url;
    this.serverMessage = details.serverMessage ?? null;
    this.detail = details.detail ?? null;
    this.retryAfter = details.retryAfter ?? null;
  }
}

/** The server could not be reached, or the connection dropped */
export class GitHTTPFSNetworkError extends GitHTTPFSError {
  override name = "GitHTTPFSNetworkError";
}

/** 400: the request was invalid (bad tenant ID, path or operation) */
export class GitHTTPFSBadRequestError extends GitHTTPFSError {
  override name = "GitHTTPFSBadRequestError";
}

/** 401: the API key is missing or invalid */
export class GitHTTPFSUnauthorizedError extends GitHTTPFSError {
  override name = "GitHTTPFSUnauthorizedError";
}

/** 404: the file, commit, order index or tenant does not exist */
export class GitHTTPFSNotFoundError extends GitHTTPFSError {
  override name = "GitHTTPFSNotFoundError";
}

/** 422: the stored content cannot be served (eg. not valid UTF-8) */
export class GitHTTPFSUnprocessableError extends GitHTTPFSError {
  override name = "GitHTTPFSUnprocessableError";
}

/** 423: a write was sent to a read-only replica (send it to the master) */
export class GitHTTPFSReadOnlyError extends GitHTTPFSError {
  override name = "GitHTTPFSReadOnlyError";
}

/** 5xx: the server failed */
export class GitHTTPFSServerError extends GitHTTPFSError {
  override name = "GitHTTPFSServerError";
}

/** 503: the node cannot serve yet (eg. a bootstrapping replica), retry \
      after 'retryAfter' seconds */
export class GitHTTPFSUnavailableError extends GitHTTPFSServerError {
  override name = "GitHTTPFSUnavailableError";
}

/**
 * Tells whether an error was raised by this client, optionally narrowed to \
 *   one or more error codes (works even when 'instanceof' does not, eg. with \
 *   several copies of this package installed).
 */
export function isGitHTTPFSError(
  error: unknown, code?: GitHTTPFSErrorCode | Array<GitHTTPFSErrorCode>
): error is GitHTTPFSError {
  const isClientError = (
    error instanceof GitHTTPFSError ||

    (
      error instanceof Error &&
        error.name.startsWith("GitHTTPFS") &&
        typeof (error as GitHTTPFSError).code === "string"
    )
  );

  if (!isClientError || code === undefined) {
    return isClientError;
  }

  const codes = Array.isArray(code) ? code : [code];

  return codes.includes((error as GitHTTPFSError).code);
}

/**
 * Maps the server error message prefixes to their error code (these mirror \
 *   the server 'AppError' variants and middleware refusals).
 */
const ERROR_MESSAGE_PREFIXES: Array<[string, GitHTTPFSErrorCode]> = [
  ["file not found:", "file_not_found"],
  ["commit not found:", "commit_not_found"],
  ["order index not found for directory:", "order_not_found"],
  ["tenant not found:", "tenant_not_found"],
  ["invalid tenant id:", "invalid_tenant"],
  ["invalid path:", "invalid_path"],
  ["invalid operation:", "invalid_operation"],
  ["file content is not valid UTF-8 at path:", "invalid_utf8"],
  ["git error:", "git_error"],
  ["io error:", "io_error"],
  ["background task failed:", "task_failed"],
  ["this node is a read-only replica", "read_only_replica"],
  ["replica is bootstrapping", "replica_bootstrapping"]
];

/**
 * Resolves the error code for a status, when no message prefix matched.
 */
function errorCodeForStatus(status: number): GitHTTPFSErrorCode {
  switch (status) {
    case 400: {
      return "bad_request";
    }

    case 401: {
      return "unauthorized";
    }

    case 404: {
      return "not_found";
    }

    case 422: {
      return "unprocessable";
    }

    case 423: {
      return "read_only_replica";
    }

    case 503: {
      return "unavailable";
    }

    default: {
      return (status >= 500) ? "server_error" : "unknown";
    }
  }
}

/**
 * Picks the error class for a status.
 */
function errorClassForStatus(status: number): typeof GitHTTPFSError {
  switch (status) {
    case 400: {
      return GitHTTPFSBadRequestError;
    }

    case 401: {
      return GitHTTPFSUnauthorizedError;
    }

    case 404: {
      return GitHTTPFSNotFoundError;
    }

    case 422: {
      return GitHTTPFSUnprocessableError;
    }

    case 423: {
      return GitHTTPFSReadOnlyError;
    }

    case 503: {
      return GitHTTPFSUnavailableError;
    }

    default: {
      return (status >= 500) ? GitHTTPFSServerError : GitHTTPFSError;
    }
  }
}

/**
 * Parses a 'Retry-After' header (delay in seconds, or HTTP date) to seconds.
 */
function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds);
  }

  const date = Date.parse(value);

  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** Defines the API version */
const VERSION = "v1";

/** Defines all HTTP methods */
const HEAD = "HEAD";
const GET = "GET";
const POST = "POST";
const PUT = "PUT";
const DELETE = "DELETE";

/**
 * Serializes an optional date bound to its RFC 3339 wire spelling (a Date is \
 *   converted, a string is trusted as-is).
 */
function toRFC3339(date?: string | Date): string | undefined {
  if (date === undefined) {
    return undefined;
  }

  return (date instanceof Date) ? date.toISOString() : date;
}

/**
 * Git HTTP FS client, manages files and commits over the Git HTTP FS HTTP API.
 */
export class GitHTTPFSClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private headersPublic: Record<string, string>;

  constructor(config: ClientConfig) {
    // Remove trailing slash (if any)
    this.baseUrl = config.baseUrl.replace(/\/$/, "");

    // The health routes take no credential, so they get headers of their own, \
    //   holding no API key (see getHealthStatus())
    this.headersPublic = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    this.headers = {
      "Authorization": `Bearer ${config.apiKey}`,

      ...this.headersPublic
    };
  }

  /**
   * Helper to handle requests and parse JSON responses.
   */
  private async request<T>(
    path: string = "",
    method: "HEAD" | "GET" | "POST" | "PUT" | "DELETE" = GET,
    payload?: any,
    params?: Record<string, string|undefined>,
    unauthenticated: boolean = false
  ): Promise<T> {
    const url = new URL(
      `${this.baseUrl}/${VERSION}` + (path ? `/${path}` : "")
    );

    // Append query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      });
    }

    const options: RequestInit = {
      method,

      // Unauthenticated routes are sent no API key at all, rather than one \
      //   the server would ignore
      headers: unauthenticated ? this.headersPublic : this.headers
    };

    if (payload) {
      options.body = JSON.stringify(payload);
    }

    let response: Response;

    try {
      response = await fetch(url.toString(), options);
    } catch (error) {
      const reason = (error instanceof Error) ? error.message : String(error);

      throw new GitHTTPFSNetworkError(`githttp-fs [network]: ${reason}`, {
        code: "network_error",
        method,
        url: url.toString(),
        cause: error
      });
    }

    if (!response.ok) {
      throw await this.errorFromResponse(response, method, url.toString());
    }

    if (method === HEAD) {
      return undefined as T;
    }

    // Some success responses have no body (eg. 204 on DELETE)
    const bodyText = await response.text();

    if (!bodyText) {
      return undefined as T;
    }

    return JSON.parse(bodyText);
  }

  /**
   * Builds the typed error for a non-success response.
   */
  private async errorFromResponse(
    response: Response, method: string, url: string
  ): Promise<GitHTTPFSError> {
    let errorText = "";

    if (method !== HEAD) {
      try {
        errorText = await response.text();
      } catch {
        // The body could not be read (the status alone is still meaningful)
      }
    }

    // Error bodies may be JSON ({ error }) or plain text, depending on \
    //   where the server failed
    let serverMessage: string | null = null;

    try {
      const errorBody = JSON.parse(errorText)?.error;

      serverMessage = (typeof errorBody === "string") ? errorBody : null;
    } catch {
      serverMessage = errorText.trim() || null;
    }

    let code = errorCodeForStatus(response.status);
    let detail: string | null = null;

    if (serverMessage) {
      const match = ERROR_MESSAGE_PREFIXES.find(([prefix]) => {
        return serverMessage!.startsWith(prefix);
      });

      if (match) {
        const [prefix, prefixCode] = match;

        code = prefixCode;

        // Only prefixes ending with a colon carry a subject after them
        if (prefix.endsWith(":")) {
          detail = serverMessage.slice(prefix.length).trim() || null;
        }
      }
    }

    const ErrorClass = errorClassForStatus(response.status);

    return new ErrorClass(
      `githttp-fs [${response.status}]: ${serverMessage || "<unknown>"}`,

      {
        code,
        method,
        url,
        status: response.status,
        serverMessage,
        detail,
        retryAfter: parseRetryAfter(response.headers.get("Retry-After"))
      }
    );
  }

  // --- Base Operations ---

  /** Ping server (a read-only replica also reports its own follower state in \
        the 'replica' field, which is how a client failing over between nodes \
        tells a node that is current from one still bootstrapping or cut off \
        from its master) */
  async sendPing(): Promise<PingResult> {
    return this.request();
  }

  // --- Health Operations ---

  // Note: the health routes are the only unauthenticated routes on the API, \
  //   so no API key is sent to them (they answer questions asked before a \
  //   credential is held, or when the credential is exactly what is in \
  //   doubt). Use sendPing() to verify an API key, never these.

  /** Read what this process is: its build, the role it plays in a replicated \
        set, whether it accepts writes, and how long it has been up. Needs no \
        authentication, and touches no repository, so it stays answerable at \
        any polling interval — and answers on a replica that is still \
        bootstrapping, which is the state it exists to report */
  async getHealthStatus(): Promise<HealthStatus> {
    return this.request(
      "_health/status", GET, undefined, undefined, true
    );
  }

  /** Read the replication picture as the server sees it: its own role, the \
        reachability of the master, and every replica known to follow it. \
        Answered by every node, including a standalone one (as \
        'role: "standalone"'), so a single probe covers a whole deployment. \
        Needs no authentication */
  async getReplicationStatus(): Promise<ReplicationStatus> {
    return this.request(
      "_health/replication", GET, undefined, undefined, true
    );
  }

  // --- Count Operations ---

  /** Count files and directories (an optional list of file extensions \
        narrows the file count to files carrying one of them) */
  async countFiles(collectionId: string, tenantId: string, options: CountFilesOptions = {}): Promise<FileCount> {
    const { prefixPath, maximumDepth, includeHiddenFiles, restrictFileExtensions } = options;

    // Extension lists travel as JSON-array strings in query parameters, \
    //   same wire spelling as the seek prefix lists
    const params = {
      prefix_path: prefixPath || "",
      maximum_depth: maximumDepth !== undefined ? maximumDepth.toString() : undefined,
      include_hidden_files: includeHiddenFiles !== undefined ? includeHiddenFiles.toString() : undefined,
      restrict_file_extensions: restrictFileExtensions !== undefined ? JSON.stringify(restrictFileExtensions) : undefined
    };

    return this.request(
      `${collectionId}/${tenantId}/count/files`, GET, undefined, params
    );
  }

  // --- Tenant Operations ---

  /** Delete entire tenant repository */
  async deleteTenant(collectionId: string, tenantId: string): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}`, DELETE, {}
    );
  }

  /** List all tracked files (paths) */
  async listFiles(collectionId: string, tenantId: string, options: ListFilesOptions = {}): Promise<FileList> {
    const {
      page = 1, perPage = 100, prefixPath, maximumDepth, includeHiddenFiles, fileNameStartsWith,
      filePaths, includeDateFrom, includeDateTo, includeDateType, applyOrderIndex, implicitOrderDefaultIndex
    } = options;

    const params = {
      page: page.toString(),
      per_page: perPage.toString(),
      prefix_path: prefixPath || "",
      maximum_depth: maximumDepth !== undefined ? maximumDepth.toString() : undefined,
      include_hidden_files: includeHiddenFiles !== undefined ? includeHiddenFiles.toString() : undefined,
      // A single prefix travels as-is; a list of prefixes travels as a \
      //   JSON-array string, same wire spelling as the seek prefix lists
      file_name_starts_with: (fileNameStartsWith !== undefined)
        ? (Array.isArray(fileNameStartsWith)
          ? JSON.stringify(fileNameStartsWith)
          : fileNameStartsWith)
        : undefined,
      // Exact paths to select (relative to the prefix path), with the same \
      //   wire spelling as the name prefixes
      file_paths: (filePaths !== undefined)
        ? (Array.isArray(filePaths)
          ? JSON.stringify(filePaths)
          : filePaths)
        : undefined,
      // Date bounds travel as RFC 3339 date-times; a Date object is \
      //   serialized, a string is passed verbatim (already RFC 3339)
      include_date_from: toRFC3339(includeDateFrom),
      include_date_to: toRFC3339(includeDateTo),
      include_date_type: includeDateType,
      // Every level of the listing gets ordered by the file order stored for \
      //   the directory it belongs to (see getFileOrder())
      apply_order_index: applyOrderIndex !== undefined ? applyOrderIndex.toString() : undefined,
      // Entries that no file order names are treated as holding this index, \
      //   which lifts them out of the tail they land in by default (only read \
      //   when the order index is applied)
      implicit_order_default_index: implicitOrderDefaultIndex !== undefined
        ? implicitOrderDefaultIndex.toString()
        : undefined
    };

    return this.request(
      `${collectionId}/${tenantId}/files`, GET, undefined, params
    );
  }

  /** Read file content, plus the position the file holds in the file order of \
        its parent directory (optionally narrowed to a line window with seek) */
  async getFileContent(collectionId: string, tenantId: string, path: string, options: GetFileContentOptions = {}): Promise<FileContentPositioned> {
    const { seek } = options;

    // Prefix lists travel as JSON-array strings in query parameters, \
    //   except the bare meta value which is passed as-is
    const params = {
      seek_from_line_starts_with: (seek?.from_line_starts_with !== undefined)
        ? JSON.stringify(seek.from_line_starts_with)
        : undefined,
      seek_to_line_starts_with: (seek?.to_line_starts_with !== undefined)
        ? (typeof seek.to_line_starts_with === "string")
          ? seek.to_line_starts_with
          : JSON.stringify(seek.to_line_starts_with)
        : undefined,
      seek_lines_maximum: (seek?.lines_maximum !== undefined)
        ? seek.lines_maximum.toString()
        : undefined
    };

    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, GET, undefined, params
    );
  }

  /** Check if a file exists in HEAD without reading its content (with \
        'checkPrefixPath' enabled, a directory at that path counts as \
        existing too) */
  async fileExists(collectionId: string, tenantId: string, path: string, options: FileExistsOptions = {}): Promise<boolean> {
    const { checkPrefixPath } = options;

    const params = {
      check_prefix_path: checkPrefixPath !== undefined ? checkPrefixPath.toString() : undefined
    };

    try {
      await this.request(`${collectionId}/${tenantId}/files/${path}`, HEAD, undefined, params);

      return true;
    } catch (error) {
      if (error instanceof GitHTTPFSNotFoundError) {
        return false;
      }

      throw error;
    }
  }

  /** Create or update a file */
  async writeFile(collectionId: string, tenantId: string, path: string, payload: FileWritePayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, PUT, payload
    );
  }

  /** Delete a file (with 'allowPrefixPathRecurse' enabled in the payload, \
        the path may name a directory, whose files are all deleted in a \
        single commit) */
  async deleteFile(collectionId: string, tenantId: string, path: string, payload: FileDeletePayload): Promise<void> {
    const { allowPrefixPathRecurse, ...basePayload } = payload;

    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, DELETE, {
        ...basePayload,

        allow_prefix_path_recurse: allowPrefixPathRecurse
      }
    );
  }

  /** Move / rename a file (with 'allowPrefixPathRecurse' enabled in the \
        payload, the path may name a directory, whose whole subtree is \
        relocated in a single commit) */
  async moveFile(collectionId: string, tenantId: string, path: string, payload: FileMovePayload): Promise<void> {
    const { allowPrefixPathRecurse, ...basePayload } = payload;

    return this.request(
      `${collectionId}/${tenantId}/files/${path}/move`, POST, {
        ...basePayload,

        allow_prefix_path_recurse: allowPrefixPathRecurse
      }
    );
  }

  /** Give the file the numerical 'position' from the payload in the file order \
        of its parent directory, shifting the entries at and after it down by \
        one (a position past the end of the order is clamped to its tail, and \
        ORDER_POSITION_UNLISTED drops the file from the order instead, leaving \
        the file itself alone). The order is first materialized over every \
        entry the directory holds, so the position counts against what the \
        caller sees, with 'implicitOrderDefaultIndex' saying where the \
        not-yet-ordered siblings are folded in (same meaning as on \
        listFiles(), and inert with ORDER_POSITION_UNLISTED) and \
        'implicitAllowHiddenFiles' deciding whether hidden siblings are \
        folded in at all (defaults to false, and required when the positioned \
        entry is itself hidden). With 'allowPrefixPath' enabled in the \
        payload, the path may name a directory, which gets positioned among \
        its siblings */
  async reorderFile(collectionId: string, tenantId: string, path: string, payload: FileReorderPayload): Promise<void> {
    const {
      allowPrefixPath, implicitOrderDefaultIndex, implicitAllowHiddenFiles, ...basePayload
    } = payload;

    return this.request(
      `${collectionId}/${tenantId}/files/${path}/reorder`, POST, {
        ...basePayload,

        implicit_order_default_index: implicitOrderDefaultIndex,
        implicit_allow_hidden_files: implicitAllowHiddenFiles,
        allow_prefix_path: allowPrefixPath
      }
    );
  }

  // --- Order Operations ---

  /** Read the file order stored for a directory (an empty directory means \
        the repository root; rejects with a 404 error when that directory \
        holds no order) */
  async getFileOrder(collectionId: string, tenantId: string, directory: string = ""): Promise<FileOrder> {
    return this.request(
      this.orderPath(collectionId, tenantId, directory), GET
    );
  }

  /** Replace the file order of a directory (an empty directory means the \
        repository root). The payload holds the 'order' entries (leaf names, \
        which must all exist in that directory), the commit 'author' and an \
        optional 'message'. A hidden (dot-prefixed) entry is rejected unless \
        'allowHiddenFiles' is enabled in the payload */
  async writeFileOrder(collectionId: string, tenantId: string, directory: string, payload: FileOrderWritePayload): Promise<void> {
    const { allowHiddenFiles, ...basePayload } = payload;

    return this.request(
      this.orderPath(collectionId, tenantId, directory), PUT, {
        ...basePayload,

        allow_hidden_files: allowHiddenFiles
      }
    );
  }

  /** Drop the file order of a directory, reverting it to the default \
        listing order (rejects with a 404 error when that directory holds no \
        order) */
  async deleteFileOrder(collectionId: string, tenantId: string, directory: string, payload: FileOrderDeletePayload): Promise<void> {
    return this.request(
      this.orderPath(collectionId, tenantId, directory), DELETE, payload
    );
  }

  /**
   * Builds an order route path, where the repository root is addressed \
   *   without any path segment.
   */
  private orderPath(collectionId: string, tenantId: string, directory: string): string {
    const basePath = `${collectionId}/${tenantId}/order`;

    return directory ? `${basePath}/${directory}` : basePath;
  }

  // --- Commit Operations ---

  /** List commits with pagination */
  async listCommits(collectionId: string, tenantId: string, options: ListCommitsOptions = {}): Promise<CommitList> {
    const { page = 1, perPage = 100, filePath, includeStatistics } = options;

    const params = {
      page: page.toString(),
      per_page: perPage.toString(),
      file_path: filePath || undefined,
      include_statistics: includeStatistics ? "true" : undefined
    };

    return this.request(
      `${collectionId}/${tenantId}/commits`, GET, undefined, params
    );
  }

  /** Commit detail with per-file diffs and snapshots */
  async getCommitDetail(collectionId: string, tenantId: string, sha: string): Promise<CommitDetail> {
    return this.request(
      `${collectionId}/${tenantId}/commits/${sha}`, GET
    );
  }

  /** Revert a commit */
  async revertCommit(collectionId: string, tenantId: string, sha: string, payload: CommitRevertPayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/commits/${sha}/revert`, POST, payload
    );
  }

  /** Roll the files a commit touched back to the state they had at it \
        (point-in-time rollback, as a new commit) */
  async rollbackCommit(collectionId: string, tenantId: string, sha: string, payload: CommitRollbackPayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/commits/${sha}/rollback`, POST, payload
    );
  }

  // --- Batch Operations ---

  /** Read multiple file contents in one request (a null slot means the \
        path does not exist; an optional seek window applies to every file, \
        overridable per file with a { path, seek } entry) */
  async batchGetFileContents(collectionId: string, tenantId: string, paths: Array<FileContentBatchPath>, options: BatchGetFileContentsOptions = {}): Promise<FileContentBatch> {
    const { seek } = options;

    return this.request(
      `${collectionId}/${tenantId}/batch/files/read`, POST, {
        files: paths,
        seek
      }
    );
  }

  /** Replay file webhooks, so a downstream mirror that drifted out of sync \
        can converge again (nothing is committed: this only enqueues hook \
        work). The 'files' option holds the paths the mirror currently holds, \
        which the server intersects with what it holds itself, and \
        'direction' picks which side of that intersection is replayed: \
        "delete" fires a 'file.deleted' for everything outside it (the \
        mirror's orphans), "create" a 'file.created' for everything inside it \
        (rows the mirror is missing, or whose content went stale). Omitting \
        'files' defaults it to every file the server holds in scope, which \
        makes "create" a whole-scope re-sync and "delete" a no-op */
  async batchReplayHook(collectionId: string, tenantId: string, direction: HookReplayDirection, options: BatchReplayHookOptions = {}): Promise<HookReplay> {
    const { files, prefixPath, includeHiddenFiles, delayMs } = options;

    return this.request(
      `${collectionId}/${tenantId}/batch/replay/hook`, POST, {
        direction,

        // Omitted entirely when unset (an empty list is rejected by the \
        //   server, where omitting defaults to every file it holds)
        files,

        prefix_path: prefixPath,
        include_hidden_files: includeHiddenFiles,
        delay_ms: delayMs
      }
    );
  }
}
