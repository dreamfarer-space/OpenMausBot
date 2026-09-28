import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { closeBrowserSession } from "../../server/browser-engine.ts";
import { launchVerificationServer } from "../control-omb.ts";
import { ensureUiBrowser, sessionEnv } from "./control-omb-ui.ts";
import { mountPreview, type MountedPreview } from "./preview-fixture.ts";

const exec = promisify(execFile);

it("renders currency, protected code and streaming math in an isolated browser", async () => {
  const { binary, chrome } = await ensureUiBrowser();
  const fixture = await launchVerificationServer(process.env, undefined, undefined, { binaryPath: binary, executablePath: chrome ?? "" });
  const env = sessionEnv({ home: fixture.info.dataDir, session: "omb-math-" + new URL(fixture.info.url).port, chrome });
  const browser = async (...args: string[]) => {
    const { stdout } = await exec(binary, [...args, "--json"], { env, timeout: 30_000, maxBuffer: 1_048_576 });
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    return result.data;
  };
  let preview: MountedPreview | undefined;
  try {
    preview = await mountPreview(fixture, {
      entry: "/scripts/testing/math-followup-preview.tsx",
      route: "/__math.html", title: "Isolated chat math", logLevel: "warn",
    });
    await browser("open", preview.previewUrl);
    await browser("wait", "--fn", "document.querySelector('.chat-md')?.textContent === 'Ready'");
    const tick = String.fromCharCode(96);
    const cases = [
      { text: "Jan −$3,000 · Feb −$2,000 · Avg ≈ $2,200 and $5 vs $10", math: 0, display: 0, includes: "$2,200" },
      { text: "\\(\r\nx % comment\r\n+y\\)\n\nAfter", math: 1, display: 0, includes: "After" },
      { text: tick + "\\(a\\)" + tick + " text \\(x\\) " + tick + "\\[b\\]" + tick, math: 1, display: 0, includes: "\\[b\\]" },
      { text: "\u0000OMB_CODE_0\u0000 " + tick + "\\(a\\)" + tick + " \\(x\\)", math: 1, display: 0, includes: "\uFFFDOMB_CODE_0\uFFFD" },
      { text: "$$x^2$", math: 0, display: 0, includes: "$$x^2$", streaming: true },
      { text: "$$x^2$$\n\nAfter", math: 1, display: 1, includes: "After", streaming: true },
      { text: "$$x^2$$\n\nAfter", math: 1, display: 1, includes: "After", streaming: false },
    ];
    for (const sample of cases) {
      await browser("eval", "window.renderMath(" + JSON.stringify(sample.text) + ", " + Boolean(sample.streaming) + "); true");
      await browser("wait", "--fn",
        "document.querySelectorAll('.katex').length === " + sample.math
        + " && document.querySelectorAll('.katex-display').length === " + sample.display
        + " && document.querySelector('.chat-md').textContent.includes(" + JSON.stringify(sample.includes) + ")");
      const result = await browser("eval", "({ math: document.querySelectorAll('.katex').length, display: document.querySelectorAll('.katex-display').length, errors: document.querySelectorAll('.katex-error').length, text: document.querySelector('.chat-md').textContent })");
      expect(result.result.errors).toBe(0);
      console.info(JSON.stringify({ sample, result: result.result }));
    }
    const font = await browser("eval", "getComputedStyle(document.querySelector('.katex')).fontFamily");
    expect(font.result).toContain("KaTeX_Main");
    const logs = await browser("console");
    expect(logs.messages.filter((message: { type: string }) => message.type === "error")).toEqual([]);
    mkdirSync(".omb-scratch/verify-evidence", { recursive: true });
    await browser("screenshot", resolve(".omb-scratch/verify-evidence/chat-math.png"));
  } finally {
    try { expect(await closeBrowserSession(binary, env)).toBe(true); }
    finally {
      try { await preview?.close(); }
      finally { await fixture.close(); }
    }
    expect(existsSync(fixture.info.dataDir)).toBe(false);
  }
}, 600_000);
