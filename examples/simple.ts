/*
 * node-githttp-fs-client
 *
 * Copyright 2026, Valerian Saliou
 * Author: Valerian Saliou <valerian@valeriansaliou.name>
 */

import { GitHTTPFSClient, ORDER_POSITION_UNLISTED } from "../lib/index.ts";

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
  // Ping server
  const pingResult = await client.sendPing();

  console.log("Got pong from server:", pingResult);

  // Write file
  const writeResult = await client.writeFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    content: "---\ntitle: Hello World\n---\n\nThis is an example file.",
    author: AUTHOR,
    message: "chore: add example file"
  });

  console.log("Wrote file: " + FILE_PATH, writeResult);

  // Count files
  const counts = await client.countFiles(COLLECTION_ID, TENANT_ID);

  console.log("Got file counts:", counts);

  // List files for tenant
  const files = await client.listFiles(COLLECTION_ID, TENANT_ID);

  console.log("Listed files:", files);

  // Pin the file order of the directory holding the example file
  const writeOrderResult = await client.writeFileOrder(COLLECTION_ID, TENANT_ID, "hello-world", {
    order: ["index.md"],
    author: AUTHOR,
    message: "chore: order example directory"
  });

  console.log("Wrote file order for: hello-world", writeOrderResult);

  // Get the file order back
  const order = await client.getFileOrder(COLLECTION_ID, TENANT_ID, "hello-world");

  console.log("Got file order:", order);

  // List files, ordered by the stored file orders (unordered entries on top)
  const orderedFiles = await client.listFiles(COLLECTION_ID, TENANT_ID, {
    applyOrderIndex: true,
    implicitOrderDefaultIndex: 0
  });

  console.log("Listed ordered files:", orderedFiles);

  // Drop the file order again
  const deleteOrderResult = await client.deleteFileOrder(COLLECTION_ID, TENANT_ID, "hello-world", {
    author: AUTHOR
  });

  console.log("Deleted file order for: hello-world", deleteOrderResult);

  // Pin the example file to the first position of its file order (which \
  //   creates the order of its directory again, holding just this file)
  const reorderResult = await client.reorderFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    position: 0,
    author: AUTHOR,
    message: "chore: reorder example file"
  });

  console.log("Reordered file: " + FILE_PATH, reorderResult);

  // Pull the example file out of its file order again (the file itself stays)
  const unorderResult = await client.reorderFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    position: ORDER_POSITION_UNLISTED,
    author: AUTHOR
  });

  console.log("Unordered file: " + FILE_PATH, unorderResult);

  // List commits for tenant
  const commits = await client.listCommits(COLLECTION_ID, TENANT_ID, { page: 1, perPage: 3 });

  console.log("Listed latest commits:", commits);

  // Get file
  const content = await client.getFileContent(COLLECTION_ID, TENANT_ID, FILE_PATH);

  console.log("Got content:", content);

  // Get file (seek to the first line only)
  const seekContent = await client.getFileContent(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    seek: { lines_maximum: 1 }
  });

  console.log("Got seek content:", seekContent);

  // Get multiple files in one request (missing paths come back as null)
  const batchContents = await client.batchGetFileContents(COLLECTION_ID, TENANT_ID, [
    FILE_PATH,
    "hello-world/does-not-exist.md"
  ], {
    seek: {
      from_line_starts_with: ["---"],
      to_line_starts_with: "$seek_from_line_starts_with"
    }
  });

  console.log("Got batch contents (headers only):", batchContents);

  // Delete file
  const deleteResult = await client.deleteFile(COLLECTION_ID, TENANT_ID, FILE_PATH, {
    author: AUTHOR
  });

  console.log("Deleted file: " + FILE_PATH, deleteResult);
} catch (error) {
  console.error("Error", error);
}
