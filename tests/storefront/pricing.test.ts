import { describe, expect, it } from "vitest";
import { defaultDesign, getProduct } from "@/lib/storefront/catalog";
import { calculateCheckoutPrice, calculatePrice, formatNaira } from "@/lib/storefront/pricing";
import { createDemoStorefrontService } from "@/lib/storefront/mock-service";

describe("storefront pricing", () => {
  it("converts the HTML catalog values to integer kobo", () => {
    const design = defaultDesign("cap");

    expect(calculatePrice(design, getProduct("cap").basePriceKobo)).toMatchObject({
      unitKobo: 800_000,
      subtotalKobo: 800_000,
      minimumQuantity: 1,
    });
  });

  it("applies material, finish, and bulk adjustments in kobo", () => {
    const design = {
      ...defaultDesign("cap"),
      material: "Premium" as const,
      finish: "Embroidered" as const,
      quantity: 10,
    };

    expect(calculatePrice(design, getProduct("cap").basePriceKobo)).toMatchObject({
      unitKobo: 1_100_000,
      subtotalKobo: 11_000_000,
      minimumQuantity: 10,
    });
  });

  it("includes delivery and rounds VAT on the item subtotal", () => {
    const design = defaultDesign("cap");
    const price = calculateCheckoutPrice(design, getProduct("cap").basePriceKobo, "standard");

    expect(price).toMatchObject({
      subtotalKobo: 800_000,
      deliveryKobo: 250_000,
      vatKobo: 60_000,
      totalKobo: 1_110_000,
    });
    expect(formatNaira(price.totalKobo)).toBe("₦11,100");
  });
});

describe("storefront demo services", () => {
  it("returns fixture products using category and search filters", async () => {
    const service = createDemoStorefrontService();

    const result = await service.listProducts("bags", "canvas");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((product) => product.id)).toEqual(["tote"]);
    }
  });

  it("requires both the order number and matching email to track an order", async () => {
    const service = createDemoStorefrontService();

    expect((await service.findDemoOrder("PW-10001", "wrong@example.com")).ok).toBe(false);
    expect((await service.findDemoOrder("PW-10001", "demo@example.com")).ok).toBe(true);
  });

  it("requires a tracking number before shipping a delivery order", async () => {
    const service = createDemoStorefrontService();

    expect(await service.advanceDemoOrder("PW-10001", "shipped")).toMatchObject({
      ok: false,
      error: { code: "order.invalid_transition" },
    });
    expect(await service.advanceDemoOrder("PW-10001", "in_production")).toMatchObject({ ok: true });
    expect(await service.advanceDemoOrder("PW-10001", "shipped")).toMatchObject({
      ok: false,
      error: { code: "order.tracking_required" },
    });
  });

  it("declines an order with a reason and records its refund state", async () => {
    const service = createDemoStorefrontService();

    expect((await service.declineDemoOrder("PW-10001", "Too short")).ok).toBe(false);
    const result = await service.declineDemoOrder(
      "PW-10001",
      "The uploaded image is too small to print clearly.",
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        status: "refunded",
        declineReason: "The uploaded image is too small to print clearly.",
        history: [{ status: "paid" }, { status: "refunded" }],
      },
    });
  });

  it("does not preserve password values in the demo identity", async () => {
    const service = createDemoStorefrontService();

    const result = await service.signInDemo("demo@example.com", "temporary-demo-password");

    expect(result).toMatchObject({
      ok: true,
      data: { email: "demo@example.com", demoOnly: true },
    });
    expect(JSON.stringify(service.getIdentity())).not.toContain("temporary-demo-password");
  });
});
