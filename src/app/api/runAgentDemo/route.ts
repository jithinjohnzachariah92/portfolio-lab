import { handleRunAgentDemo } from "@agent-demo/api";

export async function POST() {
  return handleRunAgentDemo();
}