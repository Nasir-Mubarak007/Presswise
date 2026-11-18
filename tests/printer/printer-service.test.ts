import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock the database client before importing the service ----
// Drizzle queries are chainable: select().from().where().limit() or .orderBy()
// Every link in the chain must return either the next link or a resolved value.
// The mock is built inside the vi.mock factory so vi.mock hoisting works.

function createChainable(resolveValue: unknown) {
  const obj: Record<string, unknown> = {
    from: vi.fn(() => createChainable(resolveValue)),
    innerJoin: vi.fn(() => createChainable(resolveValue)),
    leftJoin: vi.fn(() => createChainable(resolveValue)),
    limit: vi.fn(() => Promise.resolve(resolveValue)),
    orderBy: vi.fn(() => createChainable(resolveValue)),
    where: vi.fn(() => createChainable(resolveValue)),
    for: vi.fn(() => createChainable(resolveValue)),
    then: (resolve: (v: unknown) => void) => resolve(resolveValue), // make it awaitable directly
  };
  return obj;
}

vi.mock("@/lib/db/client", () => {
  const localDb: Record<string, unknown> = {
    select: vi.fn(() => createChainable([])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        then: (resolve: (v: unknown) => void) => resolve({}),
        returning: vi.fn(() => Promise.resolve([{ id: "mock-id" }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve({})),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve({})),
    })),
    transaction: vi.fn(async (callback: (tx: Record<string, unknown>) => unknown) => callback(localDb)),
  };
  return { db: localDb };
});

vi.mock("@/lib/jobs/printer-assets", () => ({
  enqueueProductPublication: vi.fn(async () => {}),
  enqueueShopPublication: vi.fn(async () => {}),
}));

import { db } from "@/lib/db/client";
import { enqueueShopPublication } from "@/lib/jobs/printer-assets";
import {
  createDraftShop,
  publishShop,
  updateShopSettings,
  suspendShop,
  NIGERIAN_STATES,
  listDirectoryShops,
} from "@/lib/services/printer-service";

describe("printer service (mocked db)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("NIGERIAN_STATES", () => {
    it("includes all 36 states plus FCT", () => {
      expect(NIGERIAN_STATES).toContain("Lagos");
      expect(NIGERIAN_STATES).toContain("FCT");
      expect(NIGERIAN_STATES.length).toBe(37);
    });
  });

  describe("createDraftShop", () => {
    const input = {
      name: "Mike's Print Shop",
      slug: "mikes-print-shop",
      state: "Lagos",
      city: "Ikeja",
      area: "Ikeja GRA",
      ownerUserId: "user-1",
    };

    it("creates a shop and returns ok with shopId", async () => {
      const result = await createDraftShop(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.shopId).toBeDefined();
      }
    });

    it("rejects empty name", async () => {
      const result = await createDraftShop({ ...input, name: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.invalid_input");
      }
    });

    it("rejects invalid state", async () => {
      const result = await createDraftShop({ ...input, state: "Not A State" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.invalid_state");
      }
    });

    it("rejects duplicate slug", async () => {
      vi.mocked(db.select as any)
        .mockReturnValueOnce(createChainable([])) // no active membership
        .mockReturnValueOnce(createChainable([{ id: "existing-shop" }])); // slug taken
      const result = await createDraftShop(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.slug_taken");
      }
    });

    it("rejects user who already has an active membership", async () => {
      vi.mocked(db.select as any).mockReturnValueOnce(createChainable([{ id: "membership" }]));
      const result = await createDraftShop(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.one_per_user");
      }
    });
  });

  describe("publishShop", () => {
    it("queues a ready shop publication", async () => {
      vi.mocked(db.select as any)
        .mockReturnValueOnce(createChainable([{ role: "owner", status: "active" }]))
        .mockReturnValueOnce(
          createChainable([
            {
              id: "shop-1",
              status: "draft",
              name: "Shop",
              slug: "shop",
              state: "Lagos",
              city: "Ikeja",
              visibilityTransition: false,
              logoObjectKey: null,
              logoAltText: null,
              bannerObjectKey: null,
              bannerDecorative: false,
              bannerAltText: null,
            },
          ])
        )
        .mockReturnValueOnce(createChainable([]))
        .mockReturnValueOnce(createChainable([]))
        .mockReturnValueOnce(createChainable([{ productId: "p-1" }]));
      vi.mocked(db.select as any).mockReturnValueOnce(
        createChainable([{ status: "queued", retryCount: 0 }]),
      );

      const result = await publishShop({ shopId: "shop-1", actorUserId: "user-1" });
      expect(result.ok).toBe(true);
      expect(enqueueShopPublication).toHaveBeenCalledOnce();
    });

    it("rejects non-owner", async () => {
      vi.mocked(db.select as any).mockReturnValueOnce(
        createChainable([{ role: "staff", status: "active" }])
      );
      const result = await publishShop({ shopId: "shop-1", actorUserId: "user-1" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.forbidden");
      }
    });

    it("rejects suspended shop", async () => {
      vi.mocked(db.select as any)
        .mockReturnValueOnce(createChainable([{ role: "owner", status: "active" }]))
        .mockReturnValueOnce(
          createChainable([
            { id: "shop-1", status: "suspended", name: "Shop", slug: "shop", state: "Lagos", city: "Ikeja" },
          ])
        );
      const result = await publishShop({ shopId: "shop-1", actorUserId: "user-1" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shop.unavailable");
      }
    });
  });

  describe("updateShopSettings", () => {
    it("updates settings for the shop owner", async () => {
      vi.mocked(db.select as any)
        .mockReturnValueOnce(createChainable([{ role: "owner", status: "active" }]))
        .mockReturnValueOnce(createChainable([{ id: "shop-1" }]));

      const result = await updateShopSettings({
        shopId: "shop-1",
        actorUserId: "user-1",
        tagline: "Great prints",
        area: "VI",
        vatEnabled: true,
      });
      expect(result.ok).toBe(true);
    });

    it("rejects non-owner", async () => {
      vi.mocked(db.select as any).mockReturnValueOnce(
        createChainable([{ role: "staff", status: "active" }])
      );
      const result = await updateShopSettings({
        shopId: "shop-1",
        actorUserId: "user-1",
        tagline: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("shop.forbidden");
      }
    });
  });

  describe("suspendShop", () => {
    it("requires platform admin to suspend", async () => {
      const result = await suspendShop({
        shopId: "shop-1",
        actorUserId: "user-1",
        actorRole: "owner",
        action: "suspend",
        reason: "Spam",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("shop.forbidden");
      }
    });

    it("suspends a shop as platform admin", async () => {
      vi.mocked(db.select as any).mockReturnValueOnce(
        createChainable([{ id: "shop-1", status: "published" }])
      );

      const result = await suspendShop({
        shopId: "shop-1",
        actorUserId: "admin-1",
        actorRole: "platform_admin",
        action: "suspend",
        reason: "Spam",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("suspended");
      }
    });

    it("returns a reinstated shop to draft so its owner can publish it safely", async () => {
      vi.mocked(db.select as any).mockReturnValueOnce(
        createChainable([{ id: "shop-1", status: "suspended" }])
      );

      const result = await suspendShop({
        shopId: "shop-1",
        actorUserId: "admin-1",
        actorRole: "platform_admin",
        action: "reinstate",
        reason: "Resolved",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe("draft");
      }
    });
  });

  describe("listDirectoryShops", () => {
    it("returns paginated shops and excludes incomplete variant matches", async () => {
      const selectMock = vi.mocked(db.select as any);
      selectMock
        .mockReturnValueOnce(
          createChainable([
            {
              id: "s-1",
              name: "Shop A",
              slug: "shop-a",
              status: "published",
              state: "Lagos",
              city: "Ikeja",
              area: null,
              tagline: null,
            },
          ])
        )
        .mockReturnValue(createChainable([])); // products, variants, images

      const result = await listDirectoryShops({ page: 1 });
      expect(result.page).toBe(1);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);

      selectMock
        .mockReturnValueOnce(
          createChainable([
            {
              id: "s-1",
              name: "Shop A",
              slug: "shop-a",
              status: "published",
              state: "Lagos",
              city: "Ikeja",
              area: null,
              tagline: null,
            },
          ]),
        )
        .mockReturnValueOnce(
          createChainable([
            {
              id: "p-1",
              shopId: "s-1",
              slug: "shirt",
              name: "Shirt",
              category: "apparel",
              basePriceKobo: 10000,
              sizes: null,
              colors: null,
            },
          ]),
        )
        .mockReturnValueOnce(
          createChainable([
            {
              id: "v-1",
              productId: "p-1",
              material: null,
              finish: "Matte",
              priceAddonKobo: 0,
              minimumQuantity: 1,
              bulkTiers: null,
            },
          ]),
        )
        .mockReturnValueOnce(createChainable([]));

      const filtered = await listDirectoryShops({ page: 1, material: "cotton" });

      expect(filtered.shops).toEqual([]);
    });
  });
});
