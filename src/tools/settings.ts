import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
        "- describe_language: English name of the language the backend uses when describing images (e.g. \"English\", \"French\", \"Japanese\"). This determines whether you should use the optional extra_request cross-language boost on search_images (only useful when the user's query language differs from describe_language).\n" +
        "- search_limit: maximum value allowed for the 'count' parameter in search_images. This is also the value you should USE for 'count' on every search (see search_images for why).\n\n" +
        "Call this once at the start of a session and re-use the values — they're deployment-level and change rarely. If this tool returns an error (e.g. 'IMAGETALK_ROOT is not set'), the backend is unconfigured and every downstream action will fail — tell the user the system needs setup and stop.\n\n" +
        "Suggested search-and-display flow (one well-trodden path when the user asks to find images):\n" +
        "  1. search_images with count = settings.search_limit — cast the widest net the backend allows.\n" +
        "  2. Look at each result's `description` field and judge how well it fits the user's intent. The backend's ranking is a starting point, not the final word; a second-pass review of the descriptions tends to produce better-targeted selections than trusting the top-N directly.\n" +
        "  3. Narrow down to the matches that actually answer the query — typically a small handful (1–3 is a reasonable default, more when the user explicitly asked for many).\n" +
        "  4. Call get_image_preview for those selected images — small JPEG previews that render reliably in chat and stay well under MCP response-size limits. get_image_file is intended for full-resolution analysis rather than routine rendering.\n" +
        "  5. When replying to the user, it usually helps to mention each chosen match's `path_name` — the absolute path of the image on the user's machine — so they know where the file lives; surfacing it as a file:// link lets them open it directly.",
      inputSchema: {},
    },
    tryTool(async () => {
      const body = await http.envelope("GET", "/api/imagetalk/settings");
      return jsonResult(body.settings);
    }),
  );
}
