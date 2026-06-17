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
    body?: any,
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

    if (body && method !== GET) {
      options.body = JSON.stringify(body);
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
  async deleteTenant(tenantId: string) {
    return this.request(
      `${tenantId}`, DELETE
    );
  }

  /** List all tracked files (path + size) */
  async listFiles(tenantId: string) {
    return this.request(
      `${tenantId}/files`, GET
    );
  }

  /** Read file content */
  async getFileContent(tenantId: string, path: string) {
    return this.request(
      `${tenantId}/files/${path}`, GET
    );
  }

  /** Create or update a file */
  async putFile(tenantId: string, path: string, body: any) {
    return this.request(
      `${tenantId}/files/${path}`, PUT, body
    );
  }

  /** Delete a file */
  async deleteFile(tenantId: string, path: string) {
    return this.request(
      `${tenantId}/files/${path}`, DELETE
    );
  }

  /** Move / rename a file */
  async moveFile(tenantId: string, path: string, body: any) {
    return this.request(
      `${tenantId}/files/${path}/move`, POST, body
    );
  }

  // --- Commit Operations ---

  /** List commits with pagination */
  async listCommits(
    tenantId: string,
    page: number = 1,
    perPage: number = 100
  ) {
    const params = {
      page: page.toString(),
      per_page: Math.min(perPage, 500).toString()
    };

    return this.request(
      `${tenantId}/commits`, GET, undefined, params
    );
  }

  /** Commit detail with per-file diffs and snapshots */
  async getCommitDetail(tenantId: string, sha: string) {
    return this.request(
      `${tenantId}/commits/${sha}`, GET
    );
  }

  /** Revert a commit */
  async revertCommit(tenantId: string, sha: string, body: any) {
    return this.request(
      `${tenantId}/commits/${sha}/revert`, POST, body
    );
  }
}
