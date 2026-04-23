# @imagetalk/mcp

Stdio MCP server that wraps the [ImageTalk](https://github.com/freeflyer/imagetalk) backend REST API, letting Claude Desktop, Claude Code, Claude Cowork and OpenAI Codex search your local image collection with natural language.

An optional alternative to the native ImageTalk frontend for users who'd rather run searches from inside their AI chat instead of a dedicated web UI.

There is also some advantage in using this approach, in that the AI model can filter preliminary search results itself and return only the most successful matches, instead of the user having to manually review the found previews.

## What it does

Exposes the ImageTalk backend as MCP tools so the model can:

- search your images with natural language (e.g. _"a snowy mountain at sunrise"_),
- register folders as searchable catalogues and trigger their indexing,
- fetch previews or full-resolution bytes of the best matches.

Description and embedding of images are done by the backend — this package is a thin, stateless wrapper.

Note that using this MCP **makes search partly non-local**: the image search itself still runs against your local backend, but the queries and match metadata pass through the remote LLM driving (if you use remote LLM based agents like Claude or Codex) the chat, unlike the native ImageTalk frontend which stays fully on your machine (or a local LLM AI-agent if you use one).

## Quick install via your AI-agent (optional)

If you already have a Claude Code or Codex session open, you can let your agent do the setup for you instead of editing config files by hand. Copy the prompt below, paste it into your agent, and follow along:

```text
I'd like to install the @imagetalk/mcp server so I can search my local image collection with natural language through you.

Setup instructions (prerequisites, client-specific config, env vars) are in this README:
https://github.com/freeflyer/imagetalk-mcp/blob/main/README.md

Please act as my hands-on setup assistant. Guide me through each step, wait for my response before moving on, and help me fix anything that goes wrong. I may be starting from zero, so don't assume prior knowledge.

1. Read the README end-to-end so you know the full flow.
2. Detect which MCP client I'm currently using (Claude Desktop, Claude Code, Claude Cowork, or OpenAI Codex) and follow the matching "Install" subsection.
3. Walk me through the Prerequisites — try to check and set each one up yourself before asking me to act (but ask for my confirmation before making changes):
   - **Node.js 18.17+**: run `node --version` to check. If it's missing or too old, offer to install/upgrade it via my system's package manager (winget on Windows, Homebrew on macOS) and wait for my go-ahead before running it. Fall back to pointing me to https://nodejs.org/ only if you can't install it yourself.
   - **ImageTalk backend reachable at http://localhost:8766**: verify with `curl http://localhost:8766/health/live`. If it's not responding, check whether the bundle is already cloned locally and only needs starting — if so, propose to start it for me after I confirm. Otherwise point me to the bundle setup at https://github.com/freeflyer/imagetalk and don't move on until the backend is confirmed live.
4. Apply the client-specific config — edit the config file directly (after my confirmation) if you have access, otherwise show me the exact file path and snippet to paste and tell me how to reload the client afterwards. If I need to override any defaults (backend URL, timeouts), ask me up front and include them in the `env` block.
5. Confirm the install by listing the registered MCP servers or the new tools, and surface any errors with a concrete fix.
```

This step is optional — if you'd rather set things up yourself, skip it and follow the manual instructions in [Prerequisites](#prerequisites) and [Install](#install) below.

## Prerequisites

- **Node.js 18.17 or newer.**
- **The ImageTalk backend running locally.** It ships as a Docker Compose bundle. Follow the setup instructions in the bundle's README: <https://github.com/freeflyer/imagetalk>.

Once the backend is up, confirm it responds:

```sh
curl http://localhost:8766/health/live
# {"status":"ok"}
```

## Configuration

All server settings are environment variables passed through your MCP client's config (each client-specific section below shows where). Defaults match the Compose bundle, so in most cases nothing needs to be set.

| Variable | Default | Description |
| --- | --- | --- |
| `IMAGETALK_BACKEND_URL` | `http://localhost:8766` | Base URL of the ImageTalk backend. |
| `IMAGETALK_REQUEST_TIMEOUT_MS` | `15000` | Timeout for ordinary requests. |
| `IMAGETALK_SEARCH_TIMEOUT_MS` | `90000` | Timeout for search. |

## Install

Jump to the section for your MCP client:

- [Claude](#claude)
- [OpenAI Codex](#openai-codex)

---

## Claude

### Claude Desktop and Claude Cowork

Claude Cowork shares Claude Desktop's MCP configuration, so a single setup covers both — configure it once here and Cowork will pick the server up automatically (Max subscription required for Cowork itself).

Edit the Claude Desktop config file:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add (or merge) the `imagetalk` entry:

```json
{
  "mcpServers": {
    "imagetalk": {
      "command": "npx",
      "args": ["-y", "-p", "@imagetalk/mcp", "imagetalk-mcp"]
    }
  }
}
```

To override a default (see [Configuration](#configuration)), add an `env` block:

```json
{
  "mcpServers": {
    "imagetalk": {
      "command": "npx",
      "args": ["-y", "-p", "@imagetalk/mcp", "imagetalk-mcp"],
      "env": {
        "IMAGETALK_BACKEND_URL": "http://192.168.1.10:8766"
      }
    }
  }
}
```

Fully quit and relaunch Claude Desktop. The ImageTalk tools will appear in the tool picker.

### Claude Code

Register the server with the `claude` CLI:

```sh
claude mcp add imagetalk -- npx -y -p @imagetalk/mcp imagetalk-mcp
```

To override a default (see [Configuration](#configuration)), pass `-e KEY=VALUE`:

```sh
claude mcp add imagetalk \
  -e IMAGETALK_BACKEND_URL=http://192.168.1.10:8766 \
  -- npx -y -p @imagetalk/mcp imagetalk-mcp
```

Restart any running `claude` session after registration. The ImageTalk tools will appear in the tool picker.

---

## OpenAI Codex

Edit the Codex config file (TOML, not JSON):

- **Windows**: `%USERPROFILE%\.codex\config.toml`
- **macOS / Linux**: `~/.codex/config.toml`

Add an `[mcp_servers.imagetalk]` section:

```toml
[mcp_servers.imagetalk]
command = "npx"
args = ["-y", "-p", "@imagetalk/mcp", "imagetalk-mcp"]
```

To override a default (see [Configuration](#configuration)), add an `env` table:

```toml
[mcp_servers.imagetalk]
command = "npx"
args = ["-y", "-p", "@imagetalk/mcp", "imagetalk-mcp"]
env = { IMAGETALK_BACKEND_URL = "http://192.168.1.10:8766" }
```

Restart Codex. The ImageTalk tools will be available to the model.

---

## Tools

The server exposes 14 tools, grouped as:

- **Health**: `check_liveness`, `check_readiness`
- **Configuration**: `get_settings`
- **Folder browsing**: `list_folders`
- **Catalogue lifecycle**: `list_catalogues`, `get_catalogue`, `add_catalogue`, `start_catalogue_sync`, `stop_catalogue_sync`, `detach_catalogue`
- **Search**: `search_images`
- **Images**: `get_image`, `get_image_preview`, `get_image_file`

Each tool's description teaches the model when to use it; see the MCP Inspector (`npm run inspect`) for the full schemas.

## Development

```sh
git clone https://github.com/freeflyer/imagetalk-mcp
cd imagetalk-mcp
npm install
npm run build
npm run inspect   # opens the MCP Inspector against the built server
```

During development, run `npm run dev` in one terminal (TypeScript watch mode) and point your MCP client at the built entry instead of `npx` — for example, in Claude Desktop:

```json
{
  "mcpServers": {
    "imagetalk": {
      "command": "node",
      "args": ["/absolute/path/to/imagetalk-mcp/build/index.js"]
    }
  }
}
```

## Related projects

Part of the ImageTalk project family:

- [**imagetalk-backend**](https://github.com/freeflyer/imagetalk-backend) — Python REST API that does the actual indexing, description and embedding of images. This MCP server is a thin, stateless wrapper around it.
- [**imagetalk-frontend**](https://github.com/freeflyer/imagetalk-frontend) — web UI that talks to the same backend.
- [**imagetalk**](https://github.com/freeflyer/imagetalk) — end-user Docker Compose bundle that packages backend, frontend, PostgreSQL, and Qdrant into a single installable product.

## License

Apache-2.0. See [LICENSE](./LICENSE).
