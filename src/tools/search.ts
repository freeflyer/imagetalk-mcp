import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import type { HttpClient } from "../http.js";
import { jsonResult, tryTool } from "./shared.js";

const DATE_STRING = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format");

export function registerSearchTools(server: McpServer, http: HttpClient, config: Config): void {
  server.registerTool(
    "search_images",
    {
      title: "Search images by natural-language query",
      description:
        "Runs a natural-language search across all *synchronized* images in all registered catalogues (minus anything excluded). This is the headline feature of ImageTalk; everything else in the API exists to make this call meaningful.\n\n" +
        "Returns a ranked list of up to 'count' matches, each with: id, score (fused ranking, higher is better, sort descending — comparable within the result set but not in absolute terms), path_name (absolute filesystem path of the image on the user's machine), and description (a backend-generated caption of the image's contents).\n\n" +
        "Suggested usage (two-stage selection):\n" +
        "The backend's ranking is fast and useful but imperfect — it returns images that are *plausibly* related to the query. Reading the `description` field of each result and picking the best matches yourself tends to produce noticeably better answers than trusting the raw top-N.\n" +
        "  1. Setting count = settings.search_limit (the maximum the backend allows) gives you more candidates to evaluate and dramatically increases the chance the best match is in the list. Restricting count to just the number of images you plan to show forces the backend's ranking to be final and often misses better matches sitting at rank 4, 8, or 15.\n" +
        "  2. Read every returned description and pick the ones whose content actually matches the user's intent — typically a small handful (1–3 is a reasonable default, more when the user explicitly asked for many). The rest can be dropped before the next step.\n" +
        "  3. Call get_image_preview (rather than get_image_file) for the ones you selected. Previews are small JPEGs that render reliably in the chat tool card and stay well under the MCP response size limit. get_image_file is worth reserving for the rare cases where you need to visually analyze an image yourself at full resolution. Fetching previews for every search result usually spends context for little gain — it pulls in image bytes for results that will not end up being shown.\n" +
        "  4. When replying to the user, it usually helps to mention each chosen match's `path_name` so they know where the file lives on disk — rendering it as a clickable link (e.g. a Markdown file:// link) lets the user open the image in one click rather than copy-pasting the path into a file manager.\n\n" +
        "FIELDS:\n" +
        "- request (required): the user's natural-language query in their native language. The backend runs this through both a dense (embedding) and a lexical (BM25) retrieval channel and fuses them.\n" +
        "- count (required): how many results to return. Must be between 1 and settings.search_limit (get it via get_settings). Exceeding the limit is rejected.\n" +
        "- included (optional): whitelist of catalogue IDs (UUIDs) — only images in these catalogues are considered.\n" +
        "- excluded (optional): blacklist of catalogue IDs (UUIDs) — images in these catalogues are skipped.\n" +
        "- dates (optional): filter by filesystem timestamps. See the dates-field rules below.\n" +
        "- extra_request (optional): cross-language boost — see the rules below.\n\n" +
        "SCOPING BY CATALOGUE (included / excluded):\n" +
        "These fields take catalogue IDs (UUIDs), not folder paths. When the user names a folder to include or skip, the flow is: call list_catalogues, find the catalogue whose `path_name` matches the user's intent, and pass its `id` here. Unknown IDs cause the backend to reject the call with 'Included/Excluded catalogues not found: <ids>'.\n\n" +
        "DATES RULES:\n" +
        "Omit the whole 'dates' field when no date filtering is needed. If present, it must satisfy:\n" +
        "- Exactly ONE of created_at / updated_at must be true (not both, not neither) — this selects which filesystem timestamp to filter on.\n" +
        "- At LEAST ONE of begin_date / end_date must be provided (both inclusive, YYYY-MM-DD format).\n\n" +
        "CROSS-LANGUAGE (extra_request) — OPTIONAL AND EXPERIMENTAL:\n" +
        "Image descriptions are always written in settings.describe_language. When the user's query is in a DIFFERENT language, recall can be slightly better if you also provide a translation of the query into describe_language as 'extra_request'. The backend then runs four parallel searches (dense + lexical on each of the two queries) and fuses them with reciprocal-rank fusion.\n" +
        "- Translation is YOUR responsibility (or the user's) — the backend does not translate. Any reasonable translation is fine.\n" +
        "- Use it ONLY when the query language differs from describe_language. When they match, omit extra_request (it only doubles cost).\n" +
        "- Plain search without extra_request already works across languages via the multilingual embedding model; extra_request is a quality boost, not a requirement.\n\n" +
        "BOTTLENECK:\n" +
        "Only one sync or search runs at a time across the whole backend. If a catalogue sync happens to be in progress, this tool returns the error 'Cannot search: a catalogue synchronization or another search is in progress'. When that happens, just report the error to the user and let them decide whether to wait or stop the sync. Do NOT proactively call list_catalogues (or any other status tool) before a search to check for conflicts — treat search_images as the first and only call in the search-and-display flow; pre-flight checks are wasted work in the common case and slow the user down.\n\n" +
        "COLD START:\n" +
        "The first search after a backend restart can take noticeably longer (tens of seconds) because the embedding model loads lazily on first use. Subsequent searches are fast. This tool uses a generous timeout to accommodate the cold start.",
      inputSchema: {
        request: z
          .string()
          .min(1)
          .describe("Natural-language query in the user's language. Required."),
        count: z
          .number()
          .int()
          .min(1)
          .describe(
            "Number of candidate results to return. ALMOST ALWAYS set this to settings.search_limit (the backend's maximum) so you have the widest pool of candidates to evaluate by description. Do not set it to the number of images you intend to show the user — narrow the selection yourself after reading the descriptions.",
          ),
        included: z
          .array(z.string().uuid())
          .optional()
          .describe(
            "Optional whitelist of catalogue IDs (UUIDs, canonical 8-4-4-4-12). If present, only images in these catalogues are considered. Get the IDs from list_catalogues (or add_catalogue) — they are the `id` field of each catalogue record.",
          ),
        excluded: z
          .array(z.string().uuid())
          .optional()
          .describe(
            "Optional blacklist of catalogue IDs (UUIDs). Images in these catalogues are skipped. IDs come from list_catalogues.",
          ),
        dates: z
          .object({
            begin_date: DATE_STRING.nullable().optional().describe("Inclusive lower bound, YYYY-MM-DD. At least one of begin_date / end_date must be set."),
            end_date: DATE_STRING.nullable().optional().describe("Inclusive upper bound, YYYY-MM-DD. At least one of begin_date / end_date must be set."),
            created_at: z.boolean().describe("Filter on filesystem creation time. Exactly one of created_at / updated_at must be true."),
            updated_at: z.boolean().describe("Filter on filesystem modification time. Exactly one of created_at / updated_at must be true."),
          })
          .optional()
          .describe("Optional date-range filter on filesystem timestamps. Omit entirely when no date filter is desired."),
        extra_request: z
          .string()
          .min(1)
          .optional()
          .describe(
            "OPTIONAL cross-language boost: a translation of 'request' into settings.describe_language. Use only when the user's query language differs from describe_language; otherwise omit.",
          ),
      },
    },
    tryTool(async (args) => {
      const body = await http.envelope("POST", "/api/imagetalk/images/search", {
        body: args,
        timeoutMs: config.searchTimeoutMs,
      });
      return jsonResult({ images: body.images });
    }),
  );
}
