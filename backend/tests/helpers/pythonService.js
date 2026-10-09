import { spawn } from "node:child_process";
import { join } from "node:path";

const CODE_INTELLIGENCE_DIR = join(import.meta.dirname, "..", "..", "..", "code-intelligence");
const PYTHON_BIN = join(CODE_INTELLIGENCE_DIR, ".venv", "bin", "python");

async function waitForHealth(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Python service did not become healthy at ${url} within ${timeoutMs}ms`);
}

/** Spawns the real FastAPI code-intelligence service on a given port for
 * a true end-to-end test - no mocking of the Node<->Python boundary. */
export async function startPythonService(port) {
  const child = spawn(PYTHON_BIN, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: CODE_INTELLIGENCE_DIR,
    stdio: "pipe",
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url);

  return {
    url,
    async stop() {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}
