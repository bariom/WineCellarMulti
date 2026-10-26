import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * One line per finished test in frontend/e2e-progress.log, so a run can be
 * followed from another window (VS Code or `Get-Content … -Wait`) while it goes.
 */
export default class ProgressReporter implements Reporter {
  private file = "";
  private total = 0;
  private done = 0;
  private failed = 0;
  private started = Date.now();

  onBegin(config: FullConfig, suite: Suite) {
    this.file = join(config.configFile ? dirname(config.configFile) : process.cwd(), "e2e-progress.log");
    mkdirSync(dirname(this.file), { recursive: true });
    this.total = suite.allTests().length;
    this.started = Date.now();
    // The BOM tells VS Code and Windows PowerShell the file is UTF-8, so ✓ and › show as such.
    writeFileSync(this.file, `﻿${new Date().toLocaleString("it-CH")} · ${this.total} test, ${config.workers} in parallelo\n`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // A test that will be retried is counted once, when it settles.
    if (result.status !== "passed" && result.status !== "skipped" && result.retry < test.retries) return;
    this.done += 1;
    const ok = result.status === "passed" || result.status === "skipped";
    if (!ok) this.failed += 1;
    const mark = result.status === "skipped" ? "–" : ok ? "✓" : "✗";
    const title = test.titlePath().slice(3).join(" › ");
    const file = test.location.file.split(/[\\/]/).pop()?.replace(/\.spec\.ts$/, "") || "";
    const width = String(this.total).length;
    const line = `[${String(this.done).padStart(width)}/${this.total}] ${mark} ${file} › ${title}  ${(result.duration / 1000).toFixed(1)}s`;
    // Terminal colour codes would show up as noise in an editor.
    const message = (result.error?.message || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0].slice(0, 200);
    const error = !ok && message ? `\n      ${message}` : "";
    appendFileSync(this.file, `${line}${error}\n`);
  }

  onEnd(result: FullResult) {
    const minutes = ((Date.now() - this.started) / 60000).toFixed(1);
    appendFileSync(this.file, `\nFine: ${result.status} · ${this.done - this.failed} passati, ${this.failed} falliti · ${minutes} min\n`);
  }
}
