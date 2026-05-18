import { expect, test } from "@playwright/test";

test.describe("Docs (Chromium)", () => {
	test("GET /docs loads Swagger UI shell", async ({ page }) => {
		await page.goto("/docs");
		await expect(page.locator(".swagger-ui")).toBeVisible({
			timeout: 30_000,
		});
	});
});
