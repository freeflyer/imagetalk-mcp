#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { HttpClient } from "./http.js";
import { log } from "./logger.js";
import { registerAllTools } from "./tools/index.js";

const SERVER_INSTRUCTIONS = `ImageTalk MCP server — natural-language search over the user's local image collection.

## Mental model
There are three concepts:
- **Catalogue**: a folder the user has registered for indexing. Has a lifecycle: new → synchronizing → synchronized (with stop / failed / detach branches).
- **Image**: a single file inside a catalogue. Fully owned by the backend; only readable.
- **Search**: a natural-language query evaluated across all *synchronized* images, returning the best N matches with scores and descriptions.

## The single bottleneck
Each catalogue returns precomputed \`synchronize_allowed\` / \`stop_allowed\` / \`delete_allowed\` flags — read those for the authoritative "can I trigger this operation right now?" answer. They already account for any cross-catalogue contention and per-status restrictions, so they give you the complete answer for permission decisions. The \`status\` field stays useful for other purposes — see polling below.

## Asynchronous operations and polling
\`start_catalogue_sync\`, \`stop_catalogue_sync\`, and \`detach_catalogue\` return FAST — their success response means "accepted", not "done". The actual work runs in the background. There is NO event stream and NO webhook. To observe completion, call \`list_catalogues\` (or \`get_catalogue\`) repeatedly and watch \`status\` until it reaches a terminal state:
  - busy → \`synchronized\` (sync completed)
  - busy → \`synchronizing_failed\` / \`reconciling_failed\` (crashed — retryable)
  - busy → \`synchronizing_stopped\` / \`reconciling_stopped\` (stop took effect)
  - row disappears → detach succeeded
  - row surfaces as \`unindexing_failed\` → detach crashed, retryable

## Setup flow (one-time, when onboarding a new folder)
1. \`get_settings\` → discover root path, describe_language, search_limit.
2. \`list_folders\` → browse under root to help the user pick a folder to register.
3. \`add_catalogue\` → register it (status=new, nothing is indexed yet).
4. \`start_catalogue_sync\` → start indexing; then poll \`list_catalogues\` until \`synchronized\`.

## Search-and-display flow (every time the user asks to find images)
This is the core loop. Follow it consistently.

When the user asks to search or find images, go DIRECTLY to step 1 below. Do NOT call \`list_catalogues\`, \`get_catalogue\`, \`check_liveness\`, \`check_readiness\`, or any other status-checking tool first — catalogue lifecycle and backend health are separate flows (setup / maintenance) and are not preconditions for a search. Pre-flight checks waste a round trip and delay the user in the common case; if something is actually wrong (e.g. a sync is holding the shared worker, or no catalogues are synchronized yet), \`search_images\` itself returns a clear error and you handle it then, not before.

1. **Search wide, unless the user has explicitly asked for a specific search size:** call \`search_images\` with \`count = settings.search_limit\` (the maximum the backend allows) to get the widest candidate pool to evaluate. The number of images you'll eventually show the user is a separate, later decision — don't shrink \`count\` to match it. If the user has explicitly constrained the search itself (e.g. "search for 5 candidates", "only look at the top 10"), honor that instead. Leave the optional \`indexes\` parameter out by default — fusing all retrieval approaches is the normal mode; pass \`indexes\` only when the user has explicitly asked to skip one (e.g. "no visual matching", "keyword search only"), and see \`search_images\` for the rule.
2. **Analyze descriptions.** Each result carries a \`description\` field (a backend-generated caption of the image's contents). Read them. The backend's ranking is a useful starting point but is imperfect — the best match for the user's intent is often NOT the top-scored result. Your judgement on the descriptions is what decides which images actually answer the query.
3. **Select 1–3 finalists.** Pick the results whose descriptions best match what the user asked for. Default: 1–3. More only if the user explicitly asked for many.
4. **Fetch previews for the finalists** using \`get_image_preview\` rather than \`get_image_file\`. Previews are small JPEGs (~512px, ~20–80 KB) — light to transport (well under the response-size limits MCP clients tend to enforce) and light on context. Full-resolution images via \`get_image_file\` are typically 2–8 MB once base64-encoded and can exceed those limits, so reserve that tool for the rare case where you need to inspect an image yourself at full detail (e.g. reading small text in a photo). For displaying images to the user, prefer \`get_image_preview\`.
5. **Reply to the user.** For each chosen match, include a short description of why it fits the user's query and the result's \`path_name\`. The preview is returned as an \`image\` content block in the tool result; most MCP clients surface that to the user automatically, so you don't need to embed or restate the image in your text reply.

## Error handling
Most tool errors come back as isError=true with a human-readable backend message. These are normal business outcomes (e.g. "another catalogue is already in progress", "path is outside IMAGETALK_ROOT"), not crashes — surface them to the user and proceed accordingly.`;

async function main(): Promise<void> {
  const config = loadConfig();
  log.info(`starting imagetalk-mcp, backend=${config.backendUrl}`);

  const http = new HttpClient(config);

  const server = new McpServer(
    { name: "imagetalk-mcp", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerAllTools(server, http, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("connected over stdio");
}

main().catch((err) => {
  log.error("fatal startup error", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
