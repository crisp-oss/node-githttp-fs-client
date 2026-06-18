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
export interface FileListFile {
  name: string;
  size: number;
  type: "file";
}

export interface FileListDirectory {
  name: string;
  children: Array<FileList>;
  type: "directory";
}

export type FileList = FileListFile | FileListDirectory;

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
  message: string;
}

/** Defines the API version */
const VERSION = "v1";

/** Defines all HTTP methods */
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
    method: "GET" | "POST" | "PUT" | "DELETE",
    payload?: any,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${VERSION}/${path}`);

    // Append query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) =>
        url.searchParams.set(key, value)
      );
    }

    const options: RequestInit = {
      method,

      headers: this.headers
    };

    if (payload && method !== GET) {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(`API Error [${response.status}]: ${errorText}`);
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

  /** List all tracked files (path + size) */
  async listFiles(collectionId: string, tenantId: string): Promise<Array<FileList>> {
    return this.request(
      `${collectionId}/${tenantId}/files`, GET
    );
  }

  /** Read file content */
  async getFileContent(collectionId: string, tenantId: string, path: string): Promise<FileContent> {
    return this.request(
      `${collectionId}/${tenantId}/files/${path}`, GET
    );
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
    perPage: number = 100
  ): Promise<CommitList> {
    const params = {
      page: page.toString(),
      per_page: Math.min(perPage, 500).toString()
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
