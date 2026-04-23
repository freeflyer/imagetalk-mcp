import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient } from "../http.js";
import { folderSchema } from "./schemas.js";
import { jsonResult, tryTool } from "./shared.js";

export function registerFolderTools(server: McpServer, http: HttpClient): void {
  server.registerTool(
    "list_folders",
    {
      title: "List immediate subfolders",
      description:
        "Lists the immediate subdirectories of a given absolute path. Pure read-only browsing — does not touch the catalogue database and does not start any work. The path must be the configured root (see get_settings) or a descendant of it; browsing outside the root is rejected.\n\n" +
        "Typical use: help the user (or yourself) pick a folder to register as a catalogue. Start at settings.root, then navigate one level at a time using the returned path_name values. The result is alphabetically sorted by folder name, symlinks are not followed, and only directories are returned.\n\n" +
        "Next step after finding the folder the user wants to index: call add_catalogue with its path_name.",
      inputSchema: {
        path_name: z
          .string()
          .min(1)
          .describe(
            "Absolute filesystem path using the host's native separator (on Windows use backslashes, on POSIX use forward slashes). Must be at or below settings.root.",
          ),
      },
      outputSchema: {
        folders: z.array(folderSchema),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    tryTool(async ({ path_name }) => {
      const body = await http.envelope("GET", "/api/imagetalk/folders", { query: { path_name } });
      return jsonResult({ folders: body.folders });
    }),
  );
}
