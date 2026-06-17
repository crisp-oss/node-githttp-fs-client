/*
 * node-githttp-fs-client
 *
 * Copyright 2026, Valerian Saliou
 * Author: Valerian Saliou <valerian@valeriansaliou.name>
 */

import { GitHTTPFSClient } from "../lib/index.ts";

const client = new GitHTTPFSClient({
  baseUrl: "http://localhost:5355",
  apiKey: "MySecretAPIKey"
});

const TENANT_ID = "4ffb599d-4115-42b4-a568-5537ce97f56c";
const FILE_PATH = "guides/index.md";

try {
  // List files for tenant
  const files = await client.listFiles(TENANT_ID);

  console.log("Listed files:", files);

  // Get a specific file
  const content = await client.getFileContent(TENANT_ID, FILE_PATH);

  console.log("Got content:", content);
} catch (error) {
  console.error("Error", error);
}
