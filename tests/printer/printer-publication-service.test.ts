import { beforeEach, describe, expect, it, vi } from "vitest";

function createChainable(resolveValue: unknown) {
  const chain = {
    from: vi.fn(() => createChainable(resolveValue)),
    innerJoin: vi.fn(() => createChainable(resolveValue)),
    leftJoin: vi.fn(() => createChainable(resolveValue)),
    where: vi.fn(() => createChainable(resolveValue)),
    orderBy: vi.fn(() => createChainable(resolveValue)),
    for: vi.fn(() => createChainable(resolveValue)),
    limit: vi.fn(() => Promise.resolve(resolveValue)),
    then: (resolve: (value: unknown) => void) => resolve(resolveValue),
  };
  return chain;
}

vi.mock("@/lib/db/client", () => {
  const localDb: Record<string, unknown> = {
    select: vi.fn(() => createChainable([])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        then: (resolve: (value: unknown) => void) => resolve({}),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve({})),
      })),
    })),
    transaction: vi.fn(
      async (callback: (tx: Record<string, unknown>) => unknown) =>
        callback(localDb),
    ),
  };
  return { db: localDb };
});

vi.mock("@/lib/jobs/printer-assets", () => ({
  enqueueProductPublication: vi.fn(async () => {}),
  enqueueShopPublication: vi.fn(async () => {}),
}));

vi.mock("@/lib/storage/r2", () => ({
  deletePublicObject: vi.fn(async () => {}),
  putPublicObject: vi.fn(async () => {}),
  readPrivateObject: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock("@/lib/storage/image-processing", () => ({
  createPublicWebp: vi.fn(async () => ({
    bytes: Buffer.from([1, 2, 3]),
    contentType: "image/png",
  })),
  ImageValidationError: class ImageValidationError extends Error {
    constructor(readonly failureCode: string) {
      super(failureCode);
    }
  },
}));

import { db } from "@/lib/db/client";
import { enqueueProductPublication } from "@/lib/jobs/printer-assets";
import {
  processProductPublicationTransition,
  requestProductPublication,
  StorageUnavailableError,
} from "@/lib/services/printer-publication-service";
import { createPublicWebp } from "@/lib/storage/image-processing";
import {
  deletePublicObject,
  putPublicObject,
  readPrivateObject,
} from "@/lib/storage/r2";

function queueProductRequest(
  membership: unknown[],
  shop: unknown[],
  product: unknown[],
  activeTransition: unknown[],
  variants: unknown[],
  images: unknown[],
  publishedCount: unknown[] = [{ value: 0 }],
  queueState: unknown[] = [{ status: "queued", retryCount: 0 }],
) {
  vi.mocked(db.select)
    .mockReturnValueOnce(createChainable(membership) as never)
    .mockReturnValueOnce(createChainable(shop) as never)
    .mockReturnValueOnce(createChainable(product) as never)
    .mockReturnValueOnce(createChainable(activeTransition) as never)
    .mockReturnValueOnce(createChainable(variants) as never)
    .mockReturnValueOnce(createChainable(images) as never)
    .mockReturnValueOnce(createChainable(publishedCount) as never)
    .mockReturnValueOnce(createChainable(queueState) as never);
}

function queueProductProcessing(images: unknown[]) {
  const product = {
    id: "product-1",
    shopId: "shop-1",
    status: "draft",
    visibilityTransition: true,
    version: 1,
    category: "apparel",
    basePriceKobo: 10000,
  };
  const shop = {
    id: "shop-1",
    status: "published",
    visibilityTransition: false,
  };
  const transition = {
    id: "transition-1",
    productId: "product-1",
    shopId: null,
    status: "processing",
    targetState: "published",
    retryCount: 1,
    failureCode: null,
  };
  const results = [
    [{ ...transition, status: "queued" }],
    [transition],
    [product],
    [shop],
    [{
      material: "Cotton",
      finish: "Matte",
      priceAddonKobo: 0,
      minimumQuantity: 1,
      bulkTiers: null,
    }],
    images,
    [transition],
    [shop],
    [product],
  ];

  for (const result of results) {
    vi.mocked(db.select).mockReturnValueOnce(createChainable(result) as never);
  }
}

describe("printer publication service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects product publication without active owner or manager membership", async () => {
    queueProductRequest(
      [{ role: "staff", status: "active" }],
      [],
      [],
      [],
      [],
      [],
      [],
    );

    const result = await requestProductPublication({
      shopId: "shop-1",
      actorUserId: "user-1",
      productId: "product-1",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "shop.forbidden" },
    });
    expect(enqueueProductPublication).not.toHaveBeenCalled();
  });

  it("does not queue an incomplete product", async () => {
    queueProductRequest(
      [{ role: "manager", status: "active" }],
      [{ status: "draft", visibilityTransition: false }],
      [{
        id: "product-1",
        status: "draft",
        visibilityTransition: false,
        category: null,
        basePriceKobo: null,
      }],
      [],
      [],
      [],
      [],
    );

    const result = await requestProductPublication({
      shopId: "shop-1",
      actorUserId: "user-1",
      productId: "product-1",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "product.not_ready" },
    });
    expect(enqueueProductPublication).not.toHaveBeenCalled();
  });

  it("queues a ready product using an identifier only", async () => {
    queueProductRequest(
      [{ role: "owner", status: "active" }],
      [{ status: "draft", visibilityTransition: false }],
      [{
        id: "product-1",
        status: "draft",
        visibilityTransition: false,
        category: "apparel",
        basePriceKobo: 10000,
      }],
      [],
      [{
        material: "Cotton",
        finish: "Matte",
        priceAddonKobo: 0,
        minimumQuantity: 1,
        bulkTiers: null,
      }],
      [{
        id: "image-1",
        objectKey: "originals/shop-1/product-1/image-1",
        altText: "Front view",
        sortOrder: 0,
        attestedByUserId: "user-1",
        attestedAt: new Date(),
        publicObjectKey: null,
      }],
      [{ value: 0 }],
    );

    const result = await requestProductPublication({
      shopId: "shop-1",
      actorUserId: "user-1",
      productId: "product-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("queued");
      expect(result.data.transitionId).toBeTruthy();
      expect(enqueueProductPublication).toHaveBeenCalledWith(
        result.data.transitionId,
        0,
      );
    }
  });

  it("records a retryable failure when the queue is unavailable", async () => {
    vi.mocked(enqueueProductPublication).mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );
    queueProductRequest(
      [{ role: "owner", status: "active" }],
      [{ status: "draft", visibilityTransition: false }],
      [{
        id: "product-1",
        status: "draft",
        visibilityTransition: false,
        category: "apparel",
        basePriceKobo: 10000,
      }],
      [],
      [{
        material: "Cotton",
        finish: "Matte",
        priceAddonKobo: 0,
        minimumQuantity: 1,
        bulkTiers: null,
      }],
      [{
        id: "image-1",
        objectKey: "originals/shop-1/product-1/image-1",
        altText: "Front view",
        sortOrder: 0,
        attestedByUserId: "user-1",
        attestedAt: new Date(),
        publicObjectKey: null,
      }],
      [{ value: 0 }],
    );

    const result = await requestProductPublication({
      shopId: "shop-1",
      actorUserId: "user-1",
      productId: "product-1",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE" },
    });
    expect(db.update).toHaveBeenCalled();
  });

  it("creates and records a public derivative before completing product publication", async () => {
    const image = {
      id: "image-1",
      objectKey: "originals/shop-1/product-1/image-1",
      altText: "Front view",
      sortOrder: 0,
      attestedByUserId: "user-1",
      attestedAt: new Date(),
      publicObjectKey: null,
    };
    queueProductProcessing([image]);
    vi.mocked(readPrivateObject).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(createPublicWebp).mockResolvedValue({
      bytes: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });
    vi.mocked(putPublicObject).mockResolvedValue();

    await processProductPublicationTransition("transition-1");

    expect(putPublicObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "products/shop-1/product-1/image-1.webp",
        contentType: "image/webp",
      }),
    );
    expect(db.update).toHaveBeenCalled();
    expect(deletePublicObject).not.toHaveBeenCalled();
  });

  it("compensates for partial derivative uploads when product publication fails", async () => {
    const images = [1, 2].map((number) => ({
      id: `image-${number}`,
      objectKey: `originals/shop-1/product-1/image-${number}`,
      altText: `View ${number}`,
      sortOrder: number - 1,
      attestedByUserId: "user-1",
      attestedAt: new Date(),
      publicObjectKey: null,
    }));
    queueProductProcessing(images);
    vi.mocked(readPrivateObject).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(createPublicWebp).mockResolvedValue({
      bytes: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });
    vi.mocked(putPublicObject)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(
      processProductPublicationTransition("transition-1"),
    ).rejects.toBeInstanceOf(StorageUnavailableError);

    expect(deletePublicObject).toHaveBeenCalledTimes(2);
    expect(deletePublicObject).toHaveBeenCalledWith(
      "products/shop-1/product-1/image-1.webp",
    );
    expect(deletePublicObject).toHaveBeenCalledWith(
      "products/shop-1/product-1/image-2.webp",
    );
  });
});
