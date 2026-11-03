import { expect, test } from "@playwright/test";

const stack = [
  "Next.js 16, App Router, React 19",
  "Neon Postgres with Drizzle ORM",
  "Better Auth with the organization plugin",
  "Cloudflare R2, Resend, Paystack",
];

test("boots and shows the Presswise heading and the stack list", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Presswise" })).toBeVisible();
  await expect(
    page.getByText("Print on demand for Nigerian print shops and their customers."),
  ).toBeVisible();

  const region = page.getByRole("region", { name: "Scaffold stack" });
  await expect(region.getByRole("listitem")).toHaveText(stack);
});

test("loads with no console or page errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Presswise" })).toBeVisible();

  expect(problems).toEqual([]);
});

test("stays readable on a narrow phone with no sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Presswise" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Scaffold stack" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.viewport);
});

test("an unknown address shows a not found page instead of the home page", async ({ page }) => {
  const response = await page.goto("/no-such-page");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Presswise" })).toHaveCount(0);
});
