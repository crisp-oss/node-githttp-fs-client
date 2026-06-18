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

## What is Git HTTP FS?

ℹ️ **Wondering what Git HTTP FS is?** Check out **[crisp-oss/githttp-fs](https://github.com/crisp-oss/githttp-fs)**.
