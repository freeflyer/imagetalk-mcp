# CLAUDE.md

## Build & Development Commands

- `npm install` — install dependencies
- `npm run build` — compile TypeScript to `build/`
- `npm run dev` — TypeScript watch mode for incremental rebuilds
- `npm run start` — run the built server (reads stdin/stdout as JSON-RPC)
- `npm run inspect` — launch MCP Inspector against `build/index.js`

## Dev Scripts (`devscripts/`)

Local-workflow helpers. Each script is provided in two variants — `.bat` for Windows and `.sh` for macOS/Linux — that must stay behaviourally identical:

- `build` — runs `npm run build` (TypeScript → `build/`).
- `inspect` — builds, then launches the MCP Inspector against the local build for manual tool testing.
- `version-patch` — bumps the patch number in `package.json` only; no git commit, no tag.
- `version-tag-release` — bumps the patch number in `package.json`, creates a release commit, and a matching version tag.
- `publish [OTP]` — publishes the current `package.json` version to npm as `@imagetalk/mcp`. Pass a 6-digit one-time password as the first argument if your npm account uses authenticator-app 2FA; omit it if you've set up a passkey.

**Keep both sets in sync.** When you change the logic of any script in this folder, update both the `.bat` and the `.sh` variant in the same change so Windows and macOS/Linux users stay on parity. The `.sh` files are stored with mode `100755` in the git index so the executable bit survives checkout on macOS/Linux — preserve this when adding new shell scripts (`git update-index --chmod=+x devscripts/<name>.sh`).

## Release workflows

### Main flow — tagged releases

Each release gets its own commit and a matching git tag. Use this by default.

1. Commit your source changes.
2. Bump the version and create the release commit + tag: `devscripts/version-tag-release.bat` (or `.sh`).
3. Log in to npm if your session has expired: `npm login`.
4. Publish: `devscripts/publish.bat [OTP]` (or `.sh`) — rebuilds automatically via `prepublishOnly`.
5. Push with tags: `git push --follow-tags`.

### Alternative flow — no release tag

Use this when you want to manage git history yourself instead of letting npm create release commits and tags.

1. Bump the version: `devscripts/version-patch.bat` (or `.sh`).
2. Commit your source changes.
3. Log in to npm if your session has expired: `npm login`.
4. Publish: `devscripts/publish.bat [OTP]` (or `.sh`) — rebuilds automatically via `prepublishOnly`.
5. Push: `git push`.

## Related projects

This repo is part of the ImageTalk project family:

- **imagetalk-backend** — Python REST API that does the actual indexing, description and embedding of images. This MCP server is a thin, stateless wrapper around it.
- **imagetalk-frontend** — web UI that talks to the same backend.
- **imagetalk** — end-user Docker Compose bundle that packages backend, frontend, PostgreSQL, and Qdrant into a single installable product.

### Working across related projects

Some tasks require looking at one of the sibling projects above — e.g. "synchronize this with the backend", "check whether this matches the frontend", "fix this based on recent changes in the bundle repo". When that comes up:

1. **If you don't know where the related project lives locally** — or the path you remembered no longer resolves — **stop and ask the user** for its current location before doing anything else. Once the user answers, verify the path exists, then save it to **project-scope memory** so future sessions can reuse it. Do **not** write that path into files that are committed to the repo (CLAUDE.md, docs, configs, etc.); local checkout paths are developer-specific and must not be shared across contributors via git.

2. **Never make silent changes in a related project.** If, while investigating one to complete a task in *this* repo, you think a change over there would help, **describe the proposed change and wait for approval** before touching anything. The only exception is when the user has explicitly asked you to modify that other project as part of the task.

In short: a request to change *this* project is not permission to change *another* project — even if the cross-project change seems necessary or obviously correct. Propose it and confirm first.
