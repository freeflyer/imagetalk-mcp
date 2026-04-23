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

## The single bottleneck (read this)
The backend has ONE vision/embedding worker. At any moment, at most one of {catalogue sync, search} can run. Starting a sync while another sync or a search is running will be rejected; likewise for searches. Each catalogue returns precomputed \`synchronize_allowed\` / \`stop_allowed\` / \`delete_allowed\` flags — treat those as the authoritative "can I do this now?" signal. Do NOT re-implement the state machine.

## Asynchronous operations and polling
\`synchronize_catalogue\`, \`stop_catalogue_sync\`, and \`detach_catalogue\` return FAST — their success response means "accepted", not "done". The actual work runs in the background. There is NO event stream and NO webhook. To observe completion, call \`list_catalogues\` (or \`get_catalogue\`) repeatedly and watch \`status\` until it reaches a terminal state:
  - busy → \`synchronized\` (sync completed)
  - busy → \`synchronizing_failed\` / \`reconciling_failed\` (crashed — retryable)
  - busy → \`synchronizing_stopped\` / \`reconciling_stopped\` (stop took effect)
  - row disappears → detach succeeded
  - row surfaces as \`unindexing_failed\` → detach crashed, retryable

## Setup flow (one-time, when onboarding a new folder)
1. \`get_settings\` → discover root path, describe_language, search_limit.
2. \`list_folders\` → browse under root to help the user pick a folder to register.
3. \`add_catalogue\` → register it (status=new, nothing is indexed yet).
4. \`synchronize_catalogue\` → start indexing; then poll \`list_catalogues\` until \`synchronized\`.

## Search-and-display flow (every time the user asks to find images)
This is the core loop. Follow it consistently.

When the user asks to search or find images, go DIRECTLY to step 1 below. Do NOT call \`list_catalogues\`, \`get_catalogue\`, \`health_live\`, \`health_ready\`, or any other status-checking tool first — catalogue lifecycle and backend health are separate flows (setup / maintenance) and are not preconditions for a search. Pre-flight checks waste a round trip and delay the user in the common case; if something is actually wrong (e.g. a sync is holding the shared worker, or no catalogues are synchronized yet), \`search_images\` itself returns a clear error and you handle it then, not before.

1. **Search wide.** Call \`search_images\` with \`count = settings.search_limit\` — always the maximum the backend allows. This gives you the largest candidate pool to evaluate. Do NOT shrink \`count\` to match how many images you plan to show the user.
2. **Analyze descriptions.** Each result carries a \`description\` field (a backend-generated caption of the image's contents). Read them. The backend's ranking is a useful starting point but is imperfect — the best match for the user's intent is often NOT the top-scored result. Your judgement on the descriptions is what decides which images actually answer the query.
3. **Select 1–3 finalists.** Pick the results whose descriptions best match what the user asked for. Default: 1–3. More only if the user explicitly asked for many.
4. **Fetch PREVIEWS for the finalists** using \`get_image_preview\` — NOT \`get_image_file\`. Previews are small JPEGs (~512px, ~20–80 KB) that stay well under the MCP response-size limit and render reliably in chat. Full-resolution files frequently exceed the ~1 MB size ceiling in Claude Desktop and can be dropped or truncated. Use \`get_image_file\` ONLY when you need to visually analyze an image yourself at full detail (rare — e.g. reading small text inside a photo). For normal display to the user, always use \`get_image_preview\`.
5. **Reply to the user.** For each chosen match, include a short description of why it fits the user's query and the result's \`path_name\`. The fetched preview renders automatically in the \`get_image_preview\` tool-result card above your message.

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
