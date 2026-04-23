import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { BackendError, type HttpClient } from "../http.js";
import { makePreview } from "../preview.js";
import { imageSchema } from "./schemas.js";
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
      outputSchema: {
        image: imageSchema,
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
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
        "Returns a small JPEG preview of the image (resized to fit within ~512×512, quality 70) as an inline image content block.\n\n" +
        "Errors:\n" +
        "- 'Image not found in DB' — the id is unknown (usually because the catalogue has been re-synced and the image was removed).\n" +
        "- 'Image file not found' — the backend has a record but the file is missing on disk. The next catalogue sync will clean up the stale record.",
      inputSchema: {
        image_id: IMAGE_ID_SCHEMA,
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
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
        "Returns the ORIGINAL image at full resolution as an inline image content block. Use this tool only when you need to visually analyze the image yourself at full detail (rare). For displaying images to the user, prefer get_image_preview.\n\n" +
        "Errors:\n" +
        "- 'Image not found in DB' — the id is unknown.\n" +
        "- 'Image file not found' — the backend has a record but the file is missing on disk.\n" +
        "- The response may be rejected or truncated by the MCP client if the full image exceeds the client's size limit; fall back to get_image_preview in that case.",
      inputSchema: {
        image_id: IMAGE_ID_SCHEMA,
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
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
