import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient } from "../http.js";
import { jsonResult, tryTool } from "./shared.js";

export function registerSettingsTools(server: McpServer, http: HttpClient): void {
  server.registerTool(
    "get_settings",
    {
      title: "Get ImageTalk configuration",
      description:
        "Returns deployment-level settings that bound every subsequent call:\n" +
        "- root: absolute filesystem path under which every catalogue must live. Attempts to register or browse outside this root are rejected.\n" +
        "- describe_language: English name of the language the backend uses when describing images (e.g. \"English\", \"French\", \"Japanese\").\n" +
        "- search_limit: maximum value allowed for the 'count' parameter in search_images.\n\n" +
        "Call this once at the start of a session and re-use the values — they're deployment-level and change rarely. If this tool returns an error (e.g. 'IMAGETALK_ROOT is not set'), the backend is unconfigured and every downstream action will fail — tell the user the system needs setup and stop.",
      inputSchema: {},
      outputSchema: {
        root: z.string(),
        describe_language: z.string(),
        search_limit: z.number().int(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    tryTool(async () => {
      const body = await http.envelope("GET", "/api/imagetalk/settings");
      return jsonResult(body.settings);
    }),
  );
}
