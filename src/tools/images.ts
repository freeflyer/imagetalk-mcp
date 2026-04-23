import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { BackendError, type HttpClient } from "../http.js";
import { makePreview } from "../preview.js";
import { errorResult, jsonResult, tryTool, type ToolResult } from "./shared.js";

const IMAGE_ID_SCHEMA = z
  .string()
  .uuid()
  .describe("Image id as a canonical UUID. Obtained from search_images results or from a previous get_image call.");

export function registerImageTools(server: McpServer, http: HttpClient, config: Config): void {
  server.registerTool(
    "get_image",
    {
      title: "Get image metadata",
      description:
        "Returns the backend's full record for one image: its catalogue id, path on disk, filesystem timestamps (image_created_at, image_updated_at), lifecycle status, and description.\n\n" +
        "Useful for a details view or for debugging — NOT required to render search results, since search_images already returns the id, path, score, and description you need.\n\n" +
        "Image lifecycle statuses: new, described, description_failed, embedded, embedding_failed, deleted, outdated. Only 'embedded' images are visible to search.\n\n" +
        "To display the actual image to the user, use get_image_preview with the same id (preferred). Use get_image_file only when you need full resolution for your own visual analysis.",
      inputSchema: {
        image_id: IMAGE_ID_SCHEMA,
      },
    },
    tryTool(async ({ image_id }) => {
      const body = await http.envelope("GET", `/api/imagetalk/images/${encodeURIComponent(image_id)}`);
      return jsonResult({ image: body.image });
    }),
  );

  server.registerTool(
    "get_image_preview",
    {
      title: "Fetch small image preview (default for displaying to the user)",
      description:
        "Returns a small JPEG preview of the image (resized to fit within ~512×512, quality 70) as an inline image content block. This is the usual choice when you want an image rendered into the chat reliably, because it sidesteps the MCP response-size ceiling that full-resolution files often hit.\n\n" +
        "Why previews exist: MCP responses have a practical size ceiling (around 1 MB per tool call in Claude Desktop). Full-resolution photos routinely exceed that — a 12-megapixel JPEG is typically 2–6 MB raw, ~3–8 MB once base64-encoded — which can cause the tool result to be dropped or truncated. A preview sidesteps the limit entirely (20–80 KB typical) and renders reliably. Only fine detail is lost.\n\n" +
        "When to call: after a search, once you have narrowed the list to the images actually worth rendering — typically 1–3. The typical end-to-end flow:\n" +
        "  1. search_images with count = settings.search_limit.\n" +
        "  2. Read the returned descriptions and pick the ones that best match the user's intent (usually 1–3, more only when the user explicitly asked for many).\n" +
        "  3. Call get_image_preview once per selected image.\n" +
        "Calling get_image_preview for every search result usually spends context for little gain — previews fetched for images that will not be rendered just sit in the result. Narrowing by description first, then fetching previews for the finalists, tends to work better.\n\n" +
        "Number of images to fetch: 1–3 is a reasonable default, with more only when the user explicitly asked for a specific larger number. Each preview costs a round-trip and a chunk of response payload, so leaning toward only the images actually worth rendering tends to work out best.\n\n" +
        "get_image_file (the other tool) is the better pick when you need full resolution for your own visual analysis — e.g. to read small text inside the image, count fine details, or answer a very specific follow-up question where the preview might lose the relevant information. For routine rendering into chat, get_image_preview is usually the safer default because of the size ceiling above.\n\n" +
        "Errors:\n" +
        "- 'Image not found in DB' — the id is unknown (usually because the catalogue has been re-synced and the image was removed).\n" +
        "- 'Image file not found' — the backend has a record but the file is missing on disk. The next catalogue sync will clean up the stale record.",
      inputSchema: {
        image_id: IMAGE_ID_SCHEMA,
      },
    },
    async ({ image_id }): Promise<ToolResult> => {
      try {
        const { bytes } = await http.getBinary(
          `/api/imagetalk/images/${encodeURIComponent(image_id)}/file`,
          { timeoutMs: config.requestTimeoutMs },
        );
        const preview = await makePreview(bytes);
        return {
          content: [
            { type: "image", data: preview.bytes.toString("base64"), mimeType: preview.mimeType },
          ],
        };
      } catch (err) {
        if (err instanceof BackendError) {
          return errorResult(`Failed to fetch image preview: ${err.message}`);
        }
        return errorResult(`Unexpected error generating image preview: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_image_file",
    {
      title: "Fetch full-resolution image bytes (for detailed visual analysis only)",
      description:
        "Returns the ORIGINAL image at full resolution as an inline image content block. Use this tool ONLY when you need to visually analyze the image yourself at full detail — e.g. to read small text inside the photo, count fine objects, or answer a follow-up question where a downscaled preview might lose the relevant information.\n\n" +
        "DO NOT USE THIS TO DISPLAY IMAGES TO THE USER. For 'here are the matches' replies, use get_image_preview instead. Reasons:\n" +
        "- Full-resolution JPEGs are frequently 2–8 MB once base64-encoded, which can exceed the MCP response size limit in Claude Desktop (~1 MB) and cause the tool result to be dropped or the image to fail to render.\n" +
        "- Previews render equally well in the chat card for the user's purposes.\n" +
        "- Full bytes consume far more of your own context window than a preview.\n\n" +
        "If in doubt whether you need this tool, you probably don't — prefer get_image_preview.\n\n" +
        "WHEN TO CALL: only after picking a specific image (typically just one) whose fine detail you genuinely need to inspect. This is a rare case; normal flows should never reach it.\n\n" +
        "Errors:\n" +
        "- 'Image not found in DB' — the id is unknown.\n" +
        "- 'Image file not found' — the backend has a record but the file is missing on disk.\n" +
        "- The response may be rejected or truncated by the MCP client if the full image exceeds the client's size limit; fall back to get_image_preview in that case.",
      inputSchema: {
        image_id: IMAGE_ID_SCHEMA,
      },
    },
    async ({ image_id }): Promise<ToolResult> => {
      try {
        const { bytes, mimeType } = await http.getBinary(
          `/api/imagetalk/images/${encodeURIComponent(image_id)}/file`,
          { timeoutMs: config.requestTimeoutMs },
        );
        return {
          content: [
            { type: "image", data: bytes.toString("base64"), mimeType },
          ],
        };
      } catch (err) {
        if (err instanceof BackendError) {
          return errorResult(`Failed to fetch image bytes: ${err.message}`);
        }
        return errorResult(`Unexpected error fetching image bytes: ${(err as Error).message}`);
      }
    },
  );
}
