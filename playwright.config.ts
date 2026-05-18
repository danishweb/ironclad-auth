import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "e2e/tests",
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://127.0.0.1:3100",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "pnpm build && pnpm exec tsx e2e/run-stack.ts",
		url: "http://127.0.0.1:3100/healthz",
		env: { PORT: "3100" },
		// Only reuse when explicitly opted in; otherwise a stray process on this port
		// can satisfy /healthz while the mock IdP on 4010 was never started.
		reuseExistingServer: process.env.PLAYWRIGHT_REUSE === "1",
		timeout: 120_000,
	},
});
