// Minimal MCP-like bridge: wraps calling internal DB or external automation (n8n) later
import axios from 'axios';

export type MCPRequest = {
  action: 'searchProduct' | 'nearestStore';
  payload: Record<string, unknown>;
};

export async function callAutomation(flowUrl: string, payload: unknown): Promise<unknown> {
  const response = await axios.post(flowUrl, payload, { timeout: 15_000 });
  return response.data;
}


