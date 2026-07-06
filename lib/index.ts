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
 * Types for listFiles()
 */
export interface FileListEntityFile {
  name: string;
  type: "file";
}

export interface FileListEntityDirectory {
  name: string;
  children: Array<FileList>;
  type: "directory";
}

export type FileListFile = FileListEntityFile | FileListEntityDirectory;

export interface FileList {
  files: Array<FileListFile>;
  page: number;
  per_page: number;
  has_more: boolean;
}

/**
 * Types for getFileContent()
 */
export interface FileContent {
  content: string;
  path: string;
}

/**
 * Types for seek options (getFileContent() and batchGetFileContents())
 */
export const SEEK_TO_FROM_LINE_STARTS_WITH = "$seek_from_line_starts_with";

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
 * Types for deleteFile()
 */
export interface FileDeletePayload {
  author: CommitAuthor;
  message?: string;
}

/**
 * Types for moveFile()
 */
export interface FileMovePayload {
  author: CommitAuthor;
  destination: string;
  message?: string;
}

/**
 * Types for listCommits()
 */
export interface CommitListCommit {
  author: CommitAuthor;
  committed_at: string;
  message: string;
  sha: string;
}

export interface CommitList {
  commits: Array<CommitListCommit>;
  page: number;
  per_page: number;
  has_more: boolean;
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
}

/**
 * Types for revertCommit()
 */
export interface CommitRevertPayload {
  author: CommitAuthor;
  message?: string;
}

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

/** Defines the API version */
const VERSION = "v1";

/** Defines all HTTP methods */
const HEAD = "HEAD";
const GET = "GET";
const POST = "POST";
const PUT = "PUT";
const DELETE = "DELETE";

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

  // --- Tenant Operations ---

  /** Delete entire tenant repository */
  async deleteTenant(collectionId: string, tenantId: string): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}`, DELETE, {}
    );
  }

  /** List all tracked files (paths) */
  async listFiles(collectionId: string, tenantId: string, page: number = 1, perPage: number = 100, prefixPath?: string, maximumDepth?: number): Promise<FileList> {
    const params = {
      page: page.toString(),
      per_page: perPage.toString(),
      prefix_path: prefixPath || "",
      maximum_depth: maximumDepth !== undefined ? maximumDepth.toString() : undefined
    };

    return this.request(
      `${collectionId}/${tenantId}/files`, GET, undefined, params
    );
  }

  /** Read file content (optionally narrowed to a line window with seek) */
  async getFileContent(collectionId: string, tenantId: string, path: string, seek?: FileSeekOptions): Promise<FileContent> {
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

  /** Check if a file exists in HEAD without reading its content */
  async fileExists(collectionId: string, tenantId: string, path: string): Promise<boolean> {
    try {
      await this.request(`${collectionId}/${tenantId}/files/${path}`, HEAD);

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

  /** Delete a file */
  async deleteFile(collectionId: string, tenantId: string, path: string, payload: FileDeletePayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, DELETE, payload
    );
  }

  /** Move / rename a file */
  async moveFile(collectionId: string, tenantId: string, path: string, payload: FileMovePayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}/move`, POST, payload
    );
  }

  // --- Commit Operations ---

  /** List commits with pagination */
  async listCommits(
    collectionId: string,
    tenantId: string,
    page: number = 1,
    perPage: number = 100,
    filePath?: string
  ): Promise<CommitList> {
    const params = {
      page: page.toString(),
      per_page: perPage.toString(),
      file_path: filePath || undefined
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

  // --- Batch Operations ---

  /** Read multiple file contents in one request (a null slot means the \
        path does not exist; an optional seek window applies to every file, \
        overridable per file with a { path, seek } entry) */
  async batchGetFileContents(collectionId: string, tenantId: string, paths: Array<FileContentBatchPath>, seek?: FileSeekOptions): Promise<FileContentBatch> {
    return this.request(
      `${collectionId}/${tenantId}/batch/files/read`, POST, {
        files: paths,
        seek
      }
    );
  }
}
