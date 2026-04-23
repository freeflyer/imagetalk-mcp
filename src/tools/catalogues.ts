import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient } from "../http.js";
import { catalogueSchema } from "./schemas.js";
import { jsonResult, tryTool } from "./shared.js";

const UUID_SCHEMA = z
  .string()
  .uuid()
  .describe("Catalogue id as a canonical UUID (8-4-4-4-12). Obtained from list_catalogues or add_catalogue.");

export function registerCatalogueTools(server: McpServer, http: HttpClient): void {
  server.registerTool(
    "list_catalogues",
    {
      title: "List catalogues (poll target)",
      description:
        "Returns every registered catalogue with its current lifecycle status, progress metrics, and precomputed permission flags. This is the PRIMARY POLLING ENDPOINT — the backend never pushes events, so you observe the progress and completion of any asynchronous operation (synchronize, stop, detach) by calling this repeatedly.\n\n" +
        "Each entry includes:\n" +
        "- status: one of new, synchronizing, synchronized, synchronizing_failed, synchronizing_stopping, synchronizing_stopped, reconciling, reconciling_failed, reconciling_stopping, reconciling_stopped, unindexing, unindexing_failed. Only 'synchronized' catalogues contribute to search.\n" +
        "- synchronize_allowed, stop_allowed, delete_allowed: precomputed permission flags answering \"can I trigger this operation on this catalogue right now?\". For permission decisions, read these flags directly — they already account for the single-bottleneck rule (only one of {catalogue sync, search} runs at a time across the backend) and any per-status restrictions, so they give you the complete answer. The `status` field stays useful for other purposes — describing to the user what the catalogue is doing, polling for completion, or diagnostics.\n" +
        "- progress (0–100), new_images, updated_images, unindexed_images, failed_images: counters updated during sync.\n" +
        "- sync_started_at, sync_ended_at: ISO-8601 timestamps.\n\n" +
        "Terminal transitions to watch for when polling:\n" +
        "- busy → 'synchronized' (sync completed)\n" +
        "- busy → '*_failed' (crashed; retryable via start_catalogue_sync)\n" +
        "- busy → '*_stopped' (stop took effect)\n" +
        "- row disappears → detach succeeded\n" +
        "- row becomes 'unindexing_failed' → detach crashed; retryable via detach_catalogue\n\n" +
        "Response order is not guaranteed stable across calls; sort client-side if presentation order matters.",
      inputSchema: {},
      outputSchema: {
        catalogues: z.array(catalogueSchema),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    tryTool(async () => {
      const body = await http.envelope("GET", "/api/imagetalk/catalogues");
      return jsonResult({ catalogues: body.catalogues });
    }),
  );

  server.registerTool(
    "get_catalogue",
    {
      title: "Get one catalogue",
      description:
        "Fetches a single catalogue by id with the same fields as list_catalogues. Cheaper than re-listing all catalogues when you only care about one — e.g. when polling the progress of a specific synchronization you just started.",
      inputSchema: {
        catalogue_id: UUID_SCHEMA,
      },
      outputSchema: {
        catalogue: catalogueSchema,
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    tryTool(async ({ catalogue_id }) => {
      const body = await http.envelope("GET", `/api/imagetalk/catalogues/${encodeURIComponent(catalogue_id)}`);
      return jsonResult({ catalogue: body.catalogue });
    }),
  );

  server.registerTool(
    "add_catalogue",
    {
      title: "Register a folder as a catalogue",
      description:
        "Registers a folder so the backend knows about it. This is pure bookkeeping — it does NOT start indexing. The returned catalogue has status=new. To actually index the images, call start_catalogue_sync afterwards.\n\n" +
        "Requirements (enforced by the backend, returned as tool errors on violation):\n" +
        "- The path must exist and be a directory.\n" +
        "- The path must be a strict descendant of settings.root (not the root itself).\n" +
        "- The path must not already be registered.\n" +
        "- The path must not be a parent or child of any existing catalogue — catalogues form a flat, non-overlapping set.\n\n" +
        "To reverse this registration later, call detach_catalogue (which removes the catalogue and its index without deleting any user files on disk).",
      inputSchema: {
        path_name: z
          .string()
          .min(1)
          .describe(
            "Absolute filesystem path to register, using the host's native separator. Must be a strict descendant of settings.root.",
          ),
      },
      outputSchema: {
        catalogue: catalogueSchema,
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    tryTool(async ({ path_name }) => {
      const body = await http.envelope("POST", "/api/imagetalk/catalogues", { body: { path_name } });
      return jsonResult({ catalogue: body.catalogue });
    }),
  );

  server.registerTool(
    "start_catalogue_sync",
    {
      title: "Start (or retry) indexing a catalogue",
      description:
        "Starts the indexing work for a catalogue: walking the folder, describing new/changed images with the vision model, embedding those descriptions, and storing the results so search can see them. This is what turns a merely registered catalogue into one that actually contributes to search_images.\n\n" +
        "When to call:\n" +
        "- Right after add_catalogue, to bring a new catalogue online.\n" +
        "- On a 'synchronized' catalogue, to pick up filesystem changes (added/removed/modified files).\n" +
        "- After a '*_failed' or '*_stopped' status, to retry.\n\n" +
        "Only call this when the catalogue's synchronize_allowed flag is true. That flag already encodes every reason the backend would refuse (wrong status, another catalogue busy, or a search in flight).\n\n" +
        "ASYNCHRONOUS: A successful response means the request was accepted and status transitioned to 'synchronizing' — NOT that indexing is done. The actual work (potentially minutes, depending on folder size) runs in the background. To observe completion, poll list_catalogues or get_catalogue and watch for status to reach 'synchronized' (success), 'synchronizing_failed' (crash), or 'synchronizing_stopped' (if stopped). Note: the backend may transparently enter a 'reconciling' phase after synchronizing to clean up stale data — treat it exactly like synchronizing (same polling rules).\n\n" +
        "While this runs, the shared vision/embedding worker is held, so searches and other catalogue syncs will be rejected until it completes. If you need to abort, use stop_catalogue_sync.",
      inputSchema: {
        catalogue_id: UUID_SCHEMA,
      },
      outputSchema: {
        catalogue: catalogueSchema,
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    tryTool(async ({ catalogue_id }) => {
      const body = await http.envelope(
        "POST",
        `/api/imagetalk/catalogues/${encodeURIComponent(catalogue_id)}/operation`,
        { body: { operation: "synchronize" } },
      );
      return jsonResult({ catalogue: body.catalogue });
    }),
  );

  server.registerTool(
    "stop_catalogue_sync",
    {
      title: "Stop an in-flight synchronization",
      description:
        "Requests that the backend wind down a running synchronization (or reconciliation). Useful when the wrong folder was started, a sync is taking too long, or you need to free the shared bottleneck so a search can run.\n\n" +
        "Only call when the catalogue's stop_allowed flag is true. That flag is true while the catalogue is actively 'synchronizing' or 'reconciling', and also after the catalogue has been stuck in a '*_stopping' state long enough (roughly 10 minutes) that a force-stop is permitted.\n\n" +
        "ASYNCHRONOUS: A successful response means the stop was accepted and the catalogue moved to 'synchronizing_stopping' (or 'reconciling_stopping') — NOT that it has already stopped. The current in-flight image finishes, pending work is dropped, and only then does status transition to the '*_stopped' terminal state. Poll list_catalogues to observe this.\n\n" +
        "Force-stop: if a catalogue is stuck in '*_stopping' past the grace window (~10 min), stop_allowed becomes true again and calling stop_catalogue_sync a second time force-transitions it to '*_stopped'. Inside the grace window, a repeat call returns an error like 'Catalogue is still stopping. Wait at least Ns before forcing stop'.",
      inputSchema: {
        catalogue_id: UUID_SCHEMA,
      },
      outputSchema: {
        catalogue: catalogueSchema,
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    tryTool(async ({ catalogue_id }) => {
      const body = await http.envelope(
        "POST",
        `/api/imagetalk/catalogues/${encodeURIComponent(catalogue_id)}/operation`,
        { body: { operation: "stop" } },
      );
      return jsonResult({ catalogue: body.catalogue });
    }),
  );

  server.registerTool(
    "detach_catalogue",
    {
      title: "Remove a catalogue from the ImageTalk index",
      description:
        "Removes a catalogue's registration and all its index data (per-image records and search vectors) from the ImageTalk backend database.\n\n" +
        "IMPORTANT — WHAT THIS DOES NOT DO: This is NOT a file deletion. The user's actual image files in the folder are completely untouched — not deleted, not moved, not modified. Only the backend's knowledge of those files is removed. After this call, the folder can no longer be searched through ImageTalk until it is registered again via add_catalogue and re-synchronized.\n\n" +
        "This is the inverse of add_catalogue. Call it when the user wants to stop including a folder in ImageTalk search, free up the backend's storage for it, or re-register it from scratch.\n\n" +
        "Only call when the catalogue's delete_allowed flag is true (i.e. no sync or reconcile is currently running on it).\n\n" +
        "ASYNCHRONOUS: A successful response (with catalogue=null) means the request was accepted. The actual removal runs in the background; the catalogue briefly appears in list_catalogues with status='unindexing' before disappearing on success, or surfaces as 'unindexing_failed' on crash (retryable). Poll list_catalogues to observe the terminal outcome.",
      inputSchema: {
        catalogue_id: UUID_SCHEMA,
      },
      outputSchema: {
        catalogue: z.null(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    tryTool(async ({ catalogue_id }) => {
      const body = await http.envelope("DELETE", `/api/imagetalk/catalogues/${encodeURIComponent(catalogue_id)}`);
      return jsonResult({ catalogue: body.catalogue });
    }),
  );
}
