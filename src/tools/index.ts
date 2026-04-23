import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { HttpClient } from "../http.js";

import { registerHealthTools } from "./health.js";
import { registerSettingsTools } from "./settings.js";
import { registerFolderTools } from "./folders.js";
import { registerCatalogueTools } from "./catalogues.js";
import { registerSearchTools } from "./search.js";
import { registerImageTools } from "./images.js";

export function registerAllTools(server: McpServer, http: HttpClient, config: Config): void {
  registerHealthTools(server, http);
  registerSettingsTools(server, http);
  registerFolderTools(server, http);
  registerCatalogueTools(server, http);
  registerSearchTools(server, http, config);
  registerImageTools(server, http, config);
}
