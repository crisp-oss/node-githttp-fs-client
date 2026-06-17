# node-flavio-client

**Flavio Client for Node. Used in pair with Flavio, a git-backed content management database served over HTTP.**

Flavio Client is used to manage per-tenant Git content databases, over the Flavio HTTP API. All operations supported by the Flavio HTTP API are also supported in this client.

**🇵🇹 Crafted in Lisbon, Portugal.**

## How to install?

Include `flavio-client` in your `package.json` dependencies.

Alternatively, you can run `npm install flavio-client --save`.

## How to use?

Then, you can import `flavio-client` and start listing and committing files:

```ts
import { FlavioClient } from "../lib/index.ts";

const client = new FlavioClient({
  baseUrl: "http://localhost:5355",
  apiKey: "MySecretAPIKey"
});

const files = await client.listFiles("<your_tenant_id_here>");

console.log("Listed files:", files);
```

## What is Flavio?

ℹ️ **Wondering what Flavio is?** Check out **[crisp-oss/flavio](https://github.com/crisp-oss/flavio)**.
