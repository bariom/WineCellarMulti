import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Generates the e-mail screenshot library (docs/EMAIL_CAMPAIGNS.md); not part of the E2E suites.
export default defineConfig({
  ...baseConfig,
  testDir: "./e2e-email-library",
  reporter: [["list"]],
  outputDir: "./test-results-email-library",
});
