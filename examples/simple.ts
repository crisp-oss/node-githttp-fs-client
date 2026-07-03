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

const COLLECTION_ID = "example-simple";
const TENANT_ID = "t_1";
const FILE_PATH = "hello-world/index.md";

const AUTHOR = {
  name: "Valerian Saliou",
  email: "valerian@valeriansaliou.name"
};

try {
  // Write file
  const writeResult = await client.writeFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    content: "This is an example file.",
    author: AUTHOR,
    message: "chore: add example file"
  });

  console.log("Wrote file: " + FILE_PATH, writeResult);

  // List files for tenant
  const files = await client.listFiles(COLLECTION_ID, TENANT_ID);

  console.log("Listed files:", files);

  // List commits for tenant
  const commits = await client.listCommits(COLLECTION_ID, TENANT_ID, 1, 3);

  console.log("Listed latest commits:", commits);

  // Get file
  const content = await client.getFileContent(COLLECTION_ID, TENANT_ID, FILE_PATH);

  console.log("Got content:", content);

  // Delete file
  const deleteResult = await client.deleteFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    author: AUTHOR
  });

  console.log("Deleted file: " + FILE_PATH, deleteResult);
} catch (error) {
  console.error("Error", error);
}
