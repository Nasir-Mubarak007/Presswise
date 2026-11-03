import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __previewArtworkPixels: number;
    __previewImagePixels: number;
  }
}

test("renders and rotates the three dimensional storefront product preview", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const originalTexImage2D = WebGLRenderingContext.prototype.texImage2D;
    window.__previewArtworkPixels = 0;
    window.__previewImagePixels = 0;
    const interceptTexImage2D = function (this: WebGLRenderingContext, ...args: unknown[]) {
      const source = args[args.length - 1];
      if (source instanceof HTMLCanvasElement && source.width === 512 && window.__previewImagePixels === 0) {
        const pixels = source.getContext("2d")?.getImageData(190, 280, 132, 85).data;
        if (pixels) {
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] > 175 && pixels[index + 1] > 175 && pixels[index + 2] > 175) {
              window.__previewArtworkPixels += 1;
            }
            if (pixels[index] > 150 && pixels[index] > pixels[index + 1] * 1.5 && pixels[index] > pixels[index + 2] * 1.5) {
              window.__previewImagePixels += 1;
            }
          }
        }
      }
      return (originalTexImage2D as (...args: unknown[]) => void).apply(this, args);
    };
    Object.defineProperty(WebGLRenderingContext.prototype, "texImage2D", { value: interceptTexImage2D });
  });
  await page.goto("/storefront");
  await page.getByRole("button", { name: "Customize Pullover Hoodie" }).click();
  await page.getByRole("button", { name: "Forest" }).click();
  await page.getByRole("group", { name: "Material" }).getByRole("button", { name: /Premium/ }).click();
  await page.getByRole("group", { name: "Finish" }).getByRole("button", { name: /Embroidered/ }).click();
  for (let quantity = 1; quantity < 10; quantity += 1) {
    await page.getByRole("button", { name: "Increase quantity" }).click();
  }
  const imageDataUrl = await page.evaluate(() => {
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = imageCanvas.height = 600;
    const context = imageCanvas.getContext("2d");
    if (!context) throw new Error("Could not create an image for the product preview test.");
    context.fillStyle = "#e33636";
    context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    return imageCanvas.toDataURL("image/png");
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageDataUrl.split(",")[1], "base64"),
  });
  await expect(page.getByRole("group", { name: /Uploaded photo/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Text on your product" }).fill("Studio sample");
  await page.getByRole("button", { name: "Preview and order" }).click();

  const canvas = page.locator('canvas[aria-label^="Interactive 3D preview"]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("aria-label", /Forest Pullover Hoodie, Premium material, Embroidered finish, front view/);
  await expect.poll(() => page.evaluate(() => window.__previewArtworkPixels)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__previewImagePixels)).toBeGreaterThan(0);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).height)).toBeGreaterThan(0);
  await expect.poll(() => canvas.evaluate((element) => {
    const previewCanvas = element as HTMLCanvasElement;
    return previewCanvas.getContext("webgl") !== null;
  })).toBe(true);

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("The interactive product preview has no visible bounds.");
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.56, { steps: 8 });
  await page.mouse.up();

  await expect(canvas).toHaveAttribute("aria-label", /Forest Pullover Hoodie, Premium material, Embroidered finish, back view/);
});
