import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "../http.js";
import { jsonResult, tryTool } from "./shared.js";

export function registerHealthTools(server: McpServer, http: HttpClient): void {
  server.registerTool(
    "health_live",
    {
      title: "Check backend liveness",
      description:
        "Cheap heartbeat: returns ok if the ImageTalk backend HTTP server is up. Does not check any downstream dependency (vision model, databases). Use this as a quick reachability probe before other calls. If you need to know whether the backend can actually serve work, call health_ready instead.",
      inputSchema: {},
    },
    tryTool(async () => {
      const { status, body } = await http.plainJson("/health/live");
      return jsonResult({ http_status: status, body });
    }),
  );

  server.registerTool(
    "health_ready",
    {
      title: "Check backend readiness",
      description:
        "Actively pings every downstream dependency: the vision/embedding engine (ollama), the relational store (postgres), and the vector store (qdrant). Returns status=ok with HTTP 200 when all dependencies are healthy, or status=degraded with HTTP 503 when at least one is down. The checks field identifies which specific dependency is unhealthy. Use this when a user-visible action depends on the backend actually being able to perform work — e.g. before kicking off a synchronization or when diagnosing why searches are failing. For cheap uptime pings, prefer health_live.",
      inputSchema: {},
    },
    tryTool(async () => {
      const { status, body } = await http.plainJson("/health/ready");
      return jsonResult({ http_status: status, body });
    }),
  );
}
