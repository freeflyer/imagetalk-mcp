import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import type { HttpClient } from "../http.js";
import { searchHitSchema } from "./schemas.js";
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
        "Descriptions may have small inaccuracies or missing details. When a candidate looks borderline from its description alone, pulling its preview and judging visually can be a useful way to settle the doubt.\n\n" +
        "FIELDS:\n" +
        "- request (required): the user's natural-language query in their native language. The backend runs this through both a dense (embedding) and a lexical (BM25) retrieval channel and fuses them.\n" +
        "- count (required): how many results to return. Must be between 1 and settings.search_limit (get it via get_settings). Exceeding the limit is rejected.\n" +
        "- included (optional): whitelist of catalogue IDs (UUIDs) — only images in these catalogues are considered.\n" +
        "- excluded (optional): blacklist of catalogue IDs (UUIDs) — images in these catalogues are skipped.\n" +
        "- dates (optional): filter by filesystem timestamps. See the dates-field rules below.\n" +
        "- indexes (optional): opt-out controlling which retrieval approaches contribute to the fused ranking. See the indexes-field rules below.\n\n" +
        "SCOPING BY CATALOGUE (included / excluded):\n" +
        "These fields take catalogue IDs (UUIDs), not folder paths. When the user names a folder to include or skip, the flow is: call list_catalogues, find the catalogue whose `path_name` matches the user's intent, and pass its `id` here. Unknown IDs cause the backend to reject the call with 'Included/Excluded catalogues not found: <ids>'.\n\n" +
        "DATES RULES:\n" +
        "Omit the whole 'dates' field when no date filtering is needed. If present, it must satisfy:\n" +
        "- Exactly ONE of created_at / updated_at must be true (not both, not neither) — this selects which filesystem timestamp to filter on.\n" +
        "- At LEAST ONE of begin_date / end_date must be provided (both inclusive, YYYY-MM-DD format).\n\n" +
        "INDEXES RULES:\n" +
        "Omit the whole 'indexes' field by default. The default behaviour (field omitted) uses all three retrieval approaches and fuses their rankings — this is the recommended mode and what users normally want. Include the field only when the user has explicitly asked to skip one or two of the approaches (e.g. 'don't search visually', 'use only keyword matching'). When present:\n" +
        "- All three booleans (description, clip, bm25) must be supplied together.\n" +
        "- At least one must be true.\n\n" +
        "The three approaches:\n" +
        "- description — semantic match against the meaning of each image's textual description. Strong for queries about what's depicted, phrased in the user's own words.\n" +
        "- clip — visual match against the image itself. Strong for queries about how images look (style, colour, composition, mood).\n" +
        "- bm25 — keyword/phrase (lexical, BM25) match against each image's textual description. Strong when the user expects specific terms to literally appear in a description.\n\n" +
        "BOTTLENECK:\n" +
        "Only one sync or search runs at a time across the whole backend. If a catalogue sync happens to be in progress, this tool returns the error 'Cannot search: a catalogue synchronization or another search is in progress'. When that happens, just report the error to the user and let them decide whether to wait or stop the sync.\n\n" +
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
            "Number of candidate results to return. Must be between 1 and settings.search_limit; normally set this to settings.search_limit (the maximum the backend allows).",
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
        indexes: z
          .object({
            description: z.boolean().describe("Include the textual-description semantic match in the fused ranking."),
            clip: z.boolean().describe("Include the visual (image-content) match in the fused ranking."),
            bm25: z.boolean().describe("Include the textual-description keyword/lexical match in the fused ranking."),
          })
          .optional()
          .describe("Optional opt-out controlling which retrieval approaches contribute to the result. Omit entirely by default — the default fuses all three approaches and is what users normally want. Include only when the user has explicitly asked to skip one or two approaches; see the indexes-field rules in this tool's description for the per-field constraints."),
      },
      outputSchema: {
        images: z.array(searchHitSchema),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
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
