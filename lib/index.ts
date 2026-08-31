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
 * Types for sendPing()
 */
export interface PingResult {
  pong: boolean;
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
  type: "file";
}

export interface FileListEntityDirectory {
  name: string;
  children: Array<FileListFile>;
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

  constructor(config: ClientConfig) {
    // Remove trailing slash (if any)
    this.baseUrl = config.baseUrl.replace(/\/$/, "");

    this.headers = {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
  }

  /**
   * Helper to handle requests and parse JSON responses.
   */
  private async request<T>(
    path: string = "",
    method: "HEAD" | "GET" | "POST" | "PUT" | "DELETE" = GET,
    payload?: any,
    params?: Record<string, string|undefined>
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

      headers: this.headers
    };

    if (payload) {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const errorText = method !== HEAD ? await response.text() : "";

      // Error bodies may be JSON ({ error }) or plain text, depending on \
      //   where the server failed
      let errorMessage;

      try {
        errorMessage = JSON.parse(errorText)?.error;
      } catch {
        errorMessage = errorText;
      }

      const error = new Error(`githttp-fs [${response.status}]: ${errorMessage || "<unknown>"}`);

      // @ts-ignore
      error.__statusCode = response.status;

      throw error;
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

  // --- Base Operations ---

  /** Ping server */
  async sendPing(): Promise<PingResult> {
    return this.request();
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
      includeDateFrom, includeDateTo, includeDateType, applyOrderIndex, implicitOrderDefaultIndex
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
      // @ts-ignore
      if (error instanceof Error && error.__statusCode === 404) {
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
        the file itself alone). With 'allowPrefixPath' enabled in the payload, \
        the path may name a directory, which gets positioned among its \
        siblings */
  async reorderFile(collectionId: string, tenantId: string, path: string, payload: FileReorderPayload): Promise<void> {
    const { allowPrefixPath, ...basePayload } = payload;

    return this.request(
      `${collectionId}/${tenantId}/files/${path}/reorder`, POST, {
        ...basePayload,

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
        optional 'message' */
  async writeFileOrder(collectionId: string, tenantId: string, directory: string, payload: FileOrderWritePayload): Promise<void> {
    return this.request(
      this.orderPath(collectionId, tenantId, directory), PUT, payload
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
