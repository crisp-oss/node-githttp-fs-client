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
 * Types for writeFile()
 */
export interface FileWritePayload {
  author: CommitAuthor;
  content: string;
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
    path: string,
    method: "HEAD" | "GET" | "POST" | "PUT" | "DELETE",
    payload?: any,
    params?: Record<string, string|undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${VERSION}/${path}`);

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
      const errorData = method !== HEAD ? await response.json() : null;

      throw new Error(`API Error [${response.status}]: ${errorData?.error || "<unknown>"}`);
    }

    if (method === HEAD) {
      return undefined as T;
    }

    return response.json();
  }

  // --- Tenant Operations ---

  /** Delete entire tenant repository */
  async deleteTenant(collectionId: string, tenantId: string): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}`, DELETE
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

  /** Read file content */
  async getFileContent(collectionId: string, tenantId: string, path: string): Promise<FileContent> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, GET
    );
  }

  /** Check if a file exists in HEAD without reading its content */
  async fileExists(collectionId: string, tenantId: string, path: string): Promise<boolean> {
    try {
      await this.request(`${collectionId}/${tenantId}/files/${path}`, HEAD);

      return true;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("API Error [404]")) {
        return false;
      }

      throw e;
    }
  }

  /** Create or update a file */
  async writeFile(collectionId: string, tenantId: string, path: string, payload: FileWritePayload): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, PUT, payload
    );
  }

  /** Delete a file */
  async deleteFile(collectionId: string, tenantId: string, path: string): Promise<void> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, DELETE
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
}
