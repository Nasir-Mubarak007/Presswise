import { db } from "@/lib/db/client";
import { and, count, desc, eq, gte, gt, inArray, isNotNull, lt, or, ilike, sql, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  member,
  organization,
  orderStatusHistory,
  orders,
  payouts,
  payments,
  productImages,
  productVariants,
  products,
  printerShop,
  refundAttempts,
  refunds,
  auditEvent,
  shopMembership,
  user,
  userRoles,
  orderItems,
  shopCustomers,
} from "@/lib/db/schema";
import { logger } from "@/lib/log/logger";
import { createRefund, fetchRefund, isPaystackConfigured } from "@/lib/paystack";
import { err, ok, type Result, type AppError } from "@/lib/domain/result";

export type PrinterError = AppError & { fields?: Record<string, string> };

export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "FCT",
];

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type CreateShopInput = {
  name: string;
  slug: string;
  state: string;
  city: string;
  area: string | null;
  ownerUserId: string;
};

export type CreateShopResult = Result<{ shopId: string }, PrinterError>;

export async function createDraftShop(input: CreateShopInput): Promise<CreateShopResult> {
  const { name, slug: rawSlug, state, city, area, ownerUserId } = input;
  const slug = normalizeSlug(rawSlug);

  if (!name.trim() || !slug) {
    return err({ code: "shop.invalid_input", message: "Shop name and slug are required." });
  }
  if (!NIGERIAN_STATES.includes(state)) {
    return err({ code: "shop.invalid_state", message: "State must be a Nigerian state or the FCT." });
  }
  if (!city.trim()) {
    return err({ code: "shop.invalid_input", message: "City is required." });
  }

  const [existingMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.userId, ownerUserId), eq(shopMembership.status, "active")))
    .limit(1);
  if (existingMembership) {
    return err({ code: "shop.one_per_user", message: "You already belong to a printer shop." });
  }

  const [slugTaken] = await db.select().from(printerShop).where(eq(printerShop.slug, slug)).limit(1);
  if (slugTaken) {
    return err({ code: "shop.slug_taken", message: "That shop slug is already taken." });
  }

  const shopId = uuidv4();
  const orgId = uuidv4();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({ id: orgId, name: name.trim(), slug });
      await tx.insert(member).values({ id: uuidv4(), organizationId: orgId, userId: ownerUserId, role: "owner" });
      await tx.insert(printerShop).values({
        id: shopId,
        ownerUserId,
        organizationId: orgId,
        name: name.trim(),
        slug,
        status: "draft",
        state,
        city,
        area: area ?? null,
      });
      await tx.insert(shopMembership).values({
        id: uuidv4(),
        shopId,
        userId: ownerUserId,
        role: "owner",
        status: "active",
      });
      await tx.insert(userRoles).values({ id: uuidv4(), userId: ownerUserId, role: "printer_owner" });
      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId: ownerUserId,
        targetType: "shop",
        targetId: shopId,
        action: "shop.create",
        detailsJson: { slug, state, city },
      });
    });
    logger.info("shop.created", { event: "shop.created", shopId, slug });
    return ok({ shopId });
  } catch (error) {
    logger.error("shop.create_failed", { event: "shop.create_failed", error: String(error) });
    return err({ code: "shop.create_failed", message: "Could not create shop." });
  }
}

export type PublishShopInput = { shopId: string; actorUserId: string };
export type PublishShopResult = Result<void, PrinterError>;

export async function publishShop(input: PublishShopInput): Promise<PublishShopResult> {
  const { shopId, actorUserId } = input;

  const [membership] = await db
    .select()
    .from(shopMembership)
    .where(
      and(
        eq(shopMembership.shopId, shopId),
        eq(shopMembership.userId, actorUserId),
        eq(shopMembership.status, "active"),
      ),
    )
    .limit(1);
  if (!membership || membership.role !== "owner") {
    return err({ code: "shop.forbidden", message: "Only the shop owner can publish." });
  }

  const [shop] = await db.select().from(printerShop).where(eq(printerShop.id, shopId)).limit(1);
  if (!shop) {
    return err({ code: "shop.not_found", message: "Shop not found." });
  }
  if (shop.status === "suspended") {
    return err({ code: "shop.suspended", message: "A suspended shop cannot be published." });
  }

  const missing: string[] = [];
  if (!shop.name?.trim()) missing.push("shop name");
  if (!NIGERIAN_STATES.includes(shop.state)) missing.push("state");
  if (!shop.city?.trim()) missing.push("city");

  const [readyVariant] = await db
    .select({ productId: products.id })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.sortOrder, 0)))
    .where(
      and(
        eq(products.shopId, shopId),
        eq(products.status, "published"),
        sql`${products.basePriceKobo} > 0`,
        isNotNull(productImages.id),
      ),
    )
    .limit(1);
  if (!readyVariant) missing.push("a published priced product variant with a material, a finish, and a cover photo");

  if (missing.length > 0) {
    return err({
      code: "shop.not_ready_for_publication",
      message: "Publish blocked: " + missing.join(", ") + ".",
      fields: Object.fromEntries(missing.map((field) => [field, "required"])),
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(printerShop)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(printerShop.id, shopId));
      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "shop",
        targetId: shopId,
        action: "shop.publish",
        detailsJson: null,
      });
    });
    logger.info("shop.published", { event: "shop.published", shopId, slug: shop.slug });
    return ok(undefined);
  } catch (error) {
    logger.error("shop.publish_failed", { event: "shop.publish_failed", error: String(error) });
    return err({ code: "shop.publish_failed", message: "Could not publish shop." });
  }
}

export type ShopCard = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  state: string;
  city: string;
  area: string | null;
};

export async function listPublishedShops(): Promise<ShopCard[]> {
  const rows = await db
    .select({
      id: printerShop.id,
      name: printerShop.name,
      slug: printerShop.slug,
      tagline: printerShop.tagline,
      state: printerShop.state,
      city: printerShop.city,
      area: printerShop.area,
    })
    .from(printerShop)
    .where(eq(printerShop.status, "published"))
    .orderBy(printerShop.name);

  return rows;
}

export type PublishedProduct = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  basePriceKobo: number | null;
  sizes: string[] | null;
  colors: string[] | null;
  coverObjectKey: string | null;
  coverAltText: string | null;
  variants: {
    id: string;
    material: string;
    finish: string;
    priceAddonKobo: number;
    minimumQuantity: number;
  }[];
};

export async function getPublishedShop(slug: string): Promise<{ shop: ShopCard; products: PublishedProduct[] } | null> {
  const [shop] = await db
    .select()
    .from(printerShop)
    .where(and(eq(printerShop.slug, slug), eq(printerShop.status, "published")))
    .limit(1);
  if (!shop) return null;

  const productRows = await db
    .select()
    .from(products)
    .where(and(eq(products.shopId, shop.id), eq(products.status, "published")))
    .orderBy(products.createdAt);

  if (productRows.length === 0) {
    return { shop: mapShop(shop), products: [] };
  }

  const productIds = productRows.map((p) => p.id);

  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds));

  const imageRows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(productImages.sortOrder);

  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const row of variantRows) {
    const list = variantsByProduct.get(row.productId);
    if (list) list.push(row);
    else variantsByProduct.set(row.productId, [row]);
  }

  const coverByProduct = new Map<string, typeof imageRows[number] | undefined>();
  for (const row of imageRows) {
    if (!coverByProduct.has(row.productId)) {
      coverByProduct.set(row.productId, row);
    }
  }

  return {
    shop: mapShop(shop),
    products: productRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      basePriceKobo: p.basePriceKobo,
      sizes: p.sizes,
      colors: p.colors,
      coverObjectKey: coverByProduct.get(p.id)?.objectKey ?? null,
      coverAltText: coverByProduct.get(p.id)?.altText ?? null,
      variants: (variantsByProduct.get(p.id) ?? []).map((v) => ({
        id: v.id,
        material: v.material,
        finish: v.finish,
        priceAddonKobo: v.priceAddonKobo,
        minimumQuantity: v.minimumQuantity,
      })),
    })),
  };
}

function mapShop(shop: typeof printerShop.$inferSelect): ShopCard {
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    tagline: shop.tagline,
    state: shop.state,
    city: shop.city,
    area: shop.area,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (ch) => `\\${ch}`);
}

export type DirectoryShop = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  state: string;
  city: string;
  area: string | null;
  product: {
    name: string;
    material: string;
    finish: string;
    unitPriceKobo: number;
    minimumQuantity: number;
    coverObjectKey: string | null;
    coverAltText: string | null;
  } | null;
};

export type BrowseDirectoryResult = {
  shops: DirectoryShop[];
  page: number;
  pageCount: number;
  hasNext: boolean;
};

const DIRECTORY_PAGE_SIZE = 12;
const DIRECTORY_CANDIDATE_CAP = 400;

function unitPriceAtMinQuantity(
  variant: (typeof productVariants.$inferSelect) & { bulkTiers: unknown },
  basePriceKobo: number | null,
): number {
  const quantity = variant.minimumQuantity;
  const tiers =
    (variant.bulkTiers as {
      minQty: number;
      unitPriceKobo: number;
    }[] | null) ?? null;
  if (tiers && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    let applicable: { minQty: number; unitPriceKobo: number } | null = null;
    for (const tier of sorted) {
      if (quantity >= tier.minQty) applicable = tier;
      else break;
    }
    if (applicable) return applicable.unitPriceKobo;
  }
  return (basePriceKobo ?? 0) + variant.priceAddonKobo;
}

export async function listDirectoryShops(input: {
  query?: string | null;
  location?: string | null;
  category?: string | null;
  material?: string | null;
  finish?: string | null;
  page?: number;
}): Promise<BrowseDirectoryResult> {
  const page = Math.max(1, input.page ?? 1);
  const conditions = [eq(printerShop.status, "published")];

  const search = (input.query ?? "").trim();
  const location = (input.location ?? "").trim();

  if (search) {
    const escaped = escapeLike(search);
    const pattern = `%${escaped}%`;
    conditions.push(
      (or(
        ilike(printerShop.name, pattern),
        ilike(printerShop.tagline, pattern),
        ilike(printerShop.city, pattern),
        ilike(printerShop.area, pattern),
        ilike(printerShop.state, pattern),
      )) as unknown as SQL<unknown>,
    );
  }
  if (location) {
    const escaped = escapeLike(location);
    const pattern = `%${escaped}%`;
    conditions.push(
      (or(
        ilike(printerShop.state, pattern),
        ilike(printerShop.city, pattern),
        ilike(printerShop.area, pattern),
      )) as unknown as SQL<unknown>,
    );
  }

  const shopRows = await db
    .select()
    .from(printerShop)
    .where(and(...conditions))
    .orderBy(printerShop.name)
    .limit(DIRECTORY_CANDIDATE_CAP);

  const categoryFilter = (input.category ?? "").trim();
  const materialFilter = (input.material ?? "").trim().toLowerCase();
  const finishFilter = (input.finish ?? "").trim().toLowerCase();
  const hasProductFilter = Boolean(categoryFilter || materialFilter || finishFilter);

  const shopIds = shopRows.map((s) => s.id);
  const productRows =
    shopIds.length > 0
      ? await db
          .select()
          .from(products)
          .where(
            and(eq(products.status, "published"), inArray(products.shopId, shopIds)),
          )
          .orderBy(products.createdAt)
      : [];

  const productByShop = new Map<string, typeof products.$inferSelect[]>();
  for (const p of productRows) {
    const list = productByShop.get(p.shopId);
    if (list) list.push(p);
    else productByShop.set(p.shopId, [p]);
  }

  const productIdList = productRows.map((p) => p.id);
  const variantRows =
    productIdList.length > 0
      ? await db.select().from(productVariants).where(inArray(productVariants.productId, productIdList))
      : [];
  const variantsByProduct = new Map<string, typeof productVariants.$inferSelect[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.productId);
    if (list) list.push(v);
    else variantsByProduct.set(v.productId, [v]);
  }

  const imageRows =
    productIdList.length > 0
      ? await db
          .select()
          .from(productImages)
          .where(inArray(productImages.productId, productIdList))
          .orderBy(productImages.sortOrder)
      : [];
  const coverByProduct = new Map<string, typeof productImages.$inferSelect | undefined>();
  for (const img of imageRows) {
    if (!coverByProduct.has(img.productId)) coverByProduct.set(img.productId, img);
  }

  const results: DirectoryShop[] = [];
  for (const shop of shopRows) {
    const productsForShop = productByShop.get(shop.id) ?? [];
    let best: {
      product: typeof products.$inferSelect;
      variant: typeof productVariants.$inferSelect;
      unitPriceKobo: number;
    } | null = null;

    for (const p of productsForShop) {
      if (categoryFilter && (!p.category || p.category.toLowerCase() !== categoryFilter.toLowerCase())) {
        continue;
      }
      for (const v of variantsByProduct.get(p.id) ?? []) {
        if (materialFilter && v.material.trim().toLowerCase() !== materialFilter) continue;
        if (finishFilter && v.finish.trim().toLowerCase() !== finishFilter) continue;
        const unitPrice = unitPriceAtMinQuantity(v, p.basePriceKobo);
        const candidate = { product: p, variant: v, unitPriceKobo: unitPrice };
        if (!best) {
          best = candidate;
        } else if (candidate.unitPriceKobo < best.unitPriceKobo) {
          best = candidate;
        } else if (candidate.unitPriceKobo === best.unitPriceKobo) {
          if (candidate.product.name < best.product.name) {
            best = candidate;
          } else if (candidate.product.name === best.product.name) {
            if (candidate.product.id < best.product.id) {
              best = candidate;
            } else if (
              candidate.product.id === best.product.id &&
              candidate.variant.id < best.variant.id
            ) {
              best = candidate;
            }
          }
        }
      }
    }

    if (hasProductFilter && !best) continue;

    const cover = best ? coverByProduct.get(best.product.id) : undefined;
    results.push({
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      tagline: shop.tagline,
      state: shop.state,
      city: shop.city,
      area: shop.area,
      product: best
        ? {
            name: best.product.name,
            material: best.variant.material,
            finish: best.variant.finish,
            unitPriceKobo: best.unitPriceKobo,
            minimumQuantity: best.variant.minimumQuantity,
            coverObjectKey: cover?.objectKey ?? null,
            coverAltText: cover?.altText ?? null,
          }
        : null,
    });
  }

  const searchLower = search.toLowerCase();
  results.sort((a, b) => {
    if (search) {
      const aExact = a.name.toLowerCase() === searchLower;
      const bExact = b.name.toLowerCase() === searchLower;
      if (aExact !== bExact) return aExact ? -1 : 1;
      const aPrefix = a.name.toLowerCase().startsWith(searchLower);
      const bPrefix = b.name.toLowerCase().startsWith(searchLower);
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    }
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const start = (page - 1) * DIRECTORY_PAGE_SIZE;
  const pageShops = results.slice(start, start + DIRECTORY_PAGE_SIZE + 1);
  const hasNext = pageShops.length > DIRECTORY_PAGE_SIZE;
  const shops = pageShops.slice(0, DIRECTORY_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(results.length / DIRECTORY_PAGE_SIZE));

  return { shops, page, pageCount, hasNext };
}

export type DashboardProduct = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  basePriceKobo: number | null;
  sizes: string[] | null;
  colors: string[] | null;
  status: string;
  coverObjectKey: string | null;
  coverAltText: string | null;
  variantCount: number;
  createdAt: Date;
};

export type ListDashboardProductsResult = {
  products: DashboardProduct[];
  page: number;
  pageCount: number;
  hasNext: boolean;
};

const DASHBOARD_CATALOG_PAGE_SIZE = 25;

export async function listShopProducts(input: {
  shopId: string;
  status?: string | null;
  page?: number;
}): Promise<ListDashboardProductsResult> {
  const page = Math.max(1, input.page ?? 1);

  const conditions = [eq(products.shopId, input.shopId)];
  if (input.status) {
    conditions.push(eq(products.status, input.status));
  }

  const productRows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      category: products.category,
      basePriceKobo: products.basePriceKobo,
      sizes: products.sizes,
      colors: products.colors,
      status: products.status,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(DASHBOARD_CATALOG_PAGE_SIZE + 1);

  const hasNext = productRows.length > DASHBOARD_CATALOG_PAGE_SIZE;
  const pageProducts = productRows.slice(0, DASHBOARD_CATALOG_PAGE_SIZE);

  const productIds = pageProducts.map((p) => p.id);

  const variantCounts = new Map<string, number>();
  const covers = new Map<string, { objectKey: string | null; altText: string | null }>();
  if (productIds.length > 0) {
    const variantRows = await db
      .select({ productId: productVariants.productId, count: count() })
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds))
      .groupBy(productVariants.productId);
    for (const row of variantRows) {
      variantCounts.set(row.productId, Number(row.count));
    }

    const imageRows = await db
      .select({
        productId: productImages.productId,
        objectKey: productImages.objectKey,
        altText: productImages.altText,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(productImages.sortOrder);
    for (const img of imageRows) {
      if (!covers.has(img.productId)) {
        covers.set(img.productId, { objectKey: img.objectKey, altText: img.altText });
      }
    }
  }

  return {
    products: pageProducts.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      basePriceKobo: p.basePriceKobo ?? null,
      sizes: p.sizes,
      colors: p.colors,
      status: p.status,
      coverObjectKey: covers.get(p.id)?.objectKey ?? null,
      coverAltText: covers.get(p.id)?.altText ?? null,
      variantCount: variantCounts.get(p.id) ?? 0,
      createdAt: p.createdAt,
    })),
    page,
    pageCount: Math.max(1, Math.ceil((pageProducts.length + (hasNext ? 1 : 0)) / DASHBOARD_CATALOG_PAGE_SIZE)),
    hasNext,
  };
}

export type ShopMembershipRole = "owner" | "manager" | "staff";

export type ActiveMembership = {
  membershipId: string;
  shopId: string;
  userId: string;
  role: ShopMembershipRole;
  status: string;
} | null;

export async function getActiveMembership(shopId: string, userId: string): Promise<ActiveMembership> {
  const rows = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, userId)))
    .limit(1);
  if (!rows[0]) return null;
  return {
    membershipId: rows[0].id,
    shopId: rows[0].shopId,
    userId: rows[0].userId,
    role: rows[0].role as ShopMembershipRole,
    status: rows[0].status,
  };
}

export type OverviewMetrics = {
  paidToday: number;
  ready: number;
  active: number;
  settledNetPayout30d: number;
  isStaff: boolean;
};

export async function getOverviewMetrics(shopId: string, userId: string, role: ShopMembershipRole): Promise<OverviewMetrics> {
  const isStaff = role === "staff";

  // Africa/Lagos is UTC+1 year-round (no DST in Nigeria).
  const now = new Date();
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);
  const lagosStart = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate()));
  const lagosEnd = new Date(lagosStart.getTime() + 24 * 60 * 60 * 1000);

  const paidTodayRows = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shopId),
        eq(orders.paymentStatus, "paid"),
        isStaff ? eq(orders.assignedMembershipId, userId) : sql`true`,
        gte(orders.createdAt, lagosStart),
        lt(orders.createdAt, lagosEnd),
      ),
    );
  const paidToday = Number(paidTodayRows[0]?.count ?? 0);

  const readyRows = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shopId),
        eq(orders.status, "paid"),
        isStaff ? eq(orders.assignedMembershipId, userId) : sql`true`,
      ),
    );
  const ready = Number(readyRows[0]?.count ?? 0);

  const activeRows = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shopId),
        or(eq(orders.status, "in_production"), eq(orders.status, "shipped")),
        isStaff ? eq(orders.assignedMembershipId, userId) : sql`true`,
      ),
    );
  const active = Number(activeRows[0]?.count ?? 0);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let settledNetPayout30d = 0;
  if (!isStaff) {
    const payoutRows = await db
      .select({ sum: sql<string>`coalesce(sum(${payouts.netKobo}), 0)` })
      .from(payouts)
      .where(
        and(
          eq(payouts.shopId, shopId),
          eq(payouts.status, "settled"),
          gte(payouts.paidAt, thirtyDaysAgo),
        ),
      );
    settledNetPayout30d = Number(payoutRows[0]?.sum ?? 0);
  }

  return {
    paidToday,
    ready,
    active,
    settledNetPayout30d,
    isStaff,
  };
}

export type DashboardOrder = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  contactName: string | null;
  contactPhone: string | null;
  totalKobo: number;
  createdAt: Date;
  assignedMemberName: string | null;
  assignedMemberRole: string | null;
};

export type ListDashboardOrdersResult = {
  orders: DashboardOrder[];
  page: number;
  pageCount: number;
  hasNext: boolean;
};

const DASHBOARD_ORDER_PAGE_SIZE = 25;

export async function listDashboardOrders(input: {
  shopId: string;
  status?: string | null;
  page?: number;
  userId: string;
  role: ShopMembershipRole;
}): Promise<ListDashboardOrdersResult> {
  const page = Math.max(1, input.page ?? 1);
  const isStaff = input.role === "staff";

  const conditions = [eq(orders.shopId, input.shopId)];

  if (input.status) {
    conditions.push(eq(orders.status, input.status));
  }
  if (isStaff) {
    conditions.push(eq(orders.assignedMembershipId, input.userId));
  }

  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      deliveryMethod: orders.deliveryMethod,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      totalKobo: orders.totalKobo,
      createdAt: orders.createdAt,
      assignedMembershipId: orders.assignedMembershipId,
    })
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(DASHBOARD_ORDER_PAGE_SIZE + 1);

  const hasNext = orderRows.length > DASHBOARD_ORDER_PAGE_SIZE;
  const pageOrders = orderRows.slice(0, DASHBOARD_ORDER_PAGE_SIZE);

  const membershipIds = pageOrders
    .map((o) => o.assignedMembershipId)
    .filter((id): id is string => Boolean(id));
  const membershipsById = new Map<string, { userName: string | null; role: string | null }>();
  if (membershipIds.length > 0) {
    const membershipRows = await db
      .select({
        membershipId: shopMembership.id,
        userId: shopMembership.userId,
        role: shopMembership.role,
      })
      .from(shopMembership)
      .where(inArray(shopMembership.id, membershipIds));

    const userIds = membershipRows.map((m) => m.userId);
    const userById = new Map<string, string | null>();
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, userIds));
      for (const u of userRows) {
        userById.set(u.id, u.name);
      }
    }
    for (const m of membershipRows) {
      membershipsById.set(m.membershipId, {
        userName: userById.get(m.userId) ?? null,
        role: m.role,
      });
    }
  }

  return {
    orders: pageOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      deliveryMethod: o.deliveryMethod,
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      totalKobo: Number(o.totalKobo),
      createdAt: o.createdAt,
      assignedMemberName: o.assignedMembershipId ? membershipsById.get(o.assignedMembershipId)?.userName ?? null : null,
      assignedMemberRole: o.assignedMembershipId ? membershipsById.get(o.assignedMembershipId)?.role ?? null : null,
    })),
    page,
    pageCount: Math.max(1, Math.ceil((pageOrders.length + (hasNext ? 1 : 0)) / DASHBOARD_ORDER_PAGE_SIZE)),
    hasNext,
  };
}

export type DashboardPayout = {
  id: string;
  orderId: string;
  grossKobo: number;
  platformFeeKobo: number;
  netKobo: number;
  status: string;
  paystackSettlementReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export async function listDashboardPayouts(shopId: string): Promise<DashboardPayout[]> {
  const rows = await db
    .select()
    .from(payouts)
    .where(eq(payouts.shopId, shopId))
    .orderBy(desc(payouts.createdAt));

  return rows.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    grossKobo: Number(p.grossKobo),
    platformFeeKobo: Number(p.platformFeeKobo),
    netKobo: Number(p.netKobo),
    status: p.status,
    paystackSettlementReference: p.paystackSettlementReference,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }));
}

export type UpdateShopSettingsInput = {
  shopId: string;
  actorUserId: string;
  tagline?: string | null;
  area?: string | null;
  vatEnabled?: boolean;
};

export type UpdateShopSettingsResult = { ok: true } | { ok: false; code: string; message: string };

export async function updateShopSettings(input: UpdateShopSettingsInput): Promise<UpdateShopSettingsResult> {
  const { shopId, actorUserId, tagline, area, vatEnabled } = input;

  const [membership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (!membership || membership.role !== "owner") {
    return { ok: false, code: "shop.forbidden", message: "Only the shop owner can update settings." };
  }

  const [shop] = await db.select().from(printerShop).where(eq(printerShop.id, shopId)).limit(1);
  if (!shop) {
    return { ok: false, code: "shop.not_found", message: "Shop not found." };
  }

  try {
    await db
      .update(printerShop)
      .set({
        ...(tagline !== undefined ? { tagline: tagline ?? null } : {}),
        ...(area !== undefined ? { area: area ?? null } : {}),
        ...(vatEnabled !== undefined ? { vatEnabled } : {}),
        updatedAt: new Date(),
      })
      .where(eq(printerShop.id, shopId));

    await db.insert(auditEvent).values({
      id: uuidv4(),
      actorUserId,
      targetType: "shop",
      targetId: shopId,
      action: "account.sensitive_change",
      detailsJson: { fields: Object.keys({ tagline, area, vatEnabled }).filter((k) => input[k as keyof UpdateShopSettingsInput] !== undefined) },
    });
    return { ok: true };
  } catch (error) {
    logger.error("shop.settings_update_failed", { event: "shop.settings_update_failed", error: String(error) });
    return { ok: false, code: "shop.settings_update_failed", message: "Could not update settings." };
  }
}

export type ToggleShopPublishInput = { shopId: string; actorUserId: string; publish: boolean };
export type ToggleShopPublishResult = { ok: true; status: string } | { ok: false; code: string; message: string };

export async function toggleShopPublish(input: ToggleShopPublishInput): Promise<ToggleShopPublishResult> {
  const { shopId, actorUserId, publish } = input;

  const [membership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (!membership || membership.role !== "owner") {
    return { ok: false, code: "shop.forbidden", message: "Only the shop owner can publish or unpublish." };
  }

  const [shop] = await db.select().from(printerShop).where(eq(printerShop.id, shopId)).limit(1);
  if (!shop) {
    return { ok: false, code: "shop.not_found", message: "Shop not found." };
  }
  if (shop.status === "suspended") {
    return { ok: false, code: "shop.suspended", message: "A suspended shop cannot be published or unpublished." };
  }

  const targetStatus = publish ? "published" : "draft";

  try {
    await db
      .update(printerShop)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(eq(printerShop.id, shopId));

    await db.insert(auditEvent).values({
      id: uuidv4(),
      actorUserId,
      targetType: "shop",
      targetId: shopId,
      action: publish ? "shop.publish" : "shop.unpublish",
      detailsJson: null,
    });
    return { ok: true, status: targetStatus };
  } catch (error) {
    logger.error("shop.publish_toggle_failed", { event: "shop.publish_toggle_failed", error: String(error) });
    return { ok: false, code: "shop.publish_toggle_failed", message: "Could not update shop status." };
  }
}

export type SuspendShopInput = { shopId: string; actorUserId: string; actorRole: ShopMembershipRole | "platform_admin"; action: "suspend" | "reinstate"; reason: string };
export type SuspendShopResult = { ok: true; status: string } | { ok: false; code: string; message: string };

export async function suspendShop(input: SuspendShopInput): Promise<SuspendShopResult> {
  const { shopId, actorUserId, actorRole, action, reason } = input;

  if (action === "suspend" || action === "reinstate") {
    if (actorRole !== "platform_admin") {
      return { ok: false, code: "shop.forbidden", message: "Only platform admins can suspend or reinstate a shop." };
    }
  }

  const [shop] = await db.select().from(printerShop).where(eq(printerShop.id, shopId)).limit(1);
  if (!shop) {
    return { ok: false, code: "shop.not_found", message: "Shop not found." };
  }

  const targetStatus = action === "suspend" ? "suspended" : "published";

  try {
    await db
      .update(printerShop)
      .set({ status: targetStatus, suspensionReason: action === "suspend" ? reason : null, updatedAt: new Date() })
      .where(eq(printerShop.id, shopId));

    await db.insert(auditEvent).values({
      id: uuidv4(),
      actorUserId,
      targetType: "shop",
      targetId: shopId,
      action: action === "suspend" ? "shop.suspend" : "shop.reinstate",
      detailsJson: { reason },
    });
    return { ok: true, status: targetStatus };
  } catch (error) {
    logger.error("shop.suspend_failed", { event: "shop.suspend_failed", error: String(error) });
    return { ok: false, code: "shop.suspend_failed", message: "Could not update shop status." };
  }
}

export type AssignOrderInput = {
  shopId: string;
  actorUserId: string;
  orderId: string;
  staffMembershipId: string;
};

export type AssignOrderResult =
  | { ok: true; membershipId: string }
  | { ok: false; code: string; message: string };

export async function assignOrder(input: AssignOrderInput): Promise<AssignOrderResult> {
  const { shopId, actorUserId, orderId, staffMembershipId } = input;

  const [actorMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (!actorMembership || (actorMembership.role !== "owner" && actorMembership.role !== "manager")) {
    return { ok: false, code: "shop.forbidden", message: "Only owners and managers can assign orders." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }

  const [staffMembership] = await db
    .select()
    .from(shopMembership)
    .where(eq(shopMembership.id, staffMembershipId))
    .limit(1);
  if (
    !staffMembership ||
    staffMembership.shopId !== shopId ||
    staffMembership.role !== "staff" ||
    staffMembership.status !== "active"
  ) {
    return { ok: false, code: "shop.forbidden", message: "Staff member must be active in this shop." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ assignedMembershipId: staffMembershipId, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: uuidv4(),
        orderId,
        status: order.status,
        note: `Assigned to staff membership ${staffMembershipId}`,
        actorUserId,
      });

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "order",
        targetId: orderId,
        action: "order.assign",
        detailsJson: { staffMembershipId },
      });
    });
    return { ok: true, membershipId: staffMembershipId };
  } catch (error) {
    logger.error("order.assign_failed", { event: "order.assign_failed", error: String(error) });
    return { ok: false, code: "order.assign_failed", message: "Could not assign order." };
  }
}

export type FulfillmentTransitionInput = {
  shopId: string;
  actorUserId: string;
  orderId: string;
  toStatus: "in_production" | "shipped" | "completed";
  trackingNumber?: string | null;
};

export type FulfillmentTransitionResult =
  | { ok: true; status: string }
  | { ok: false; code: string; message: string };

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  paid: ["in_production"],
  in_production: ["shipped"],
  shipped: ["completed"],
};

export async function fulfillOrderTransition(input: FulfillmentTransitionInput): Promise<FulfillmentTransitionResult> {
  const { shopId, actorUserId, orderId, toStatus, trackingNumber } = input;

  const [actorMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (
    !actorMembership ||
    (actorMembership.role !== "owner" &&
      actorMembership.role !== "manager" &&
      actorMembership.role !== "staff")
  ) {
    return { ok: false, code: "shop.forbidden", message: "Not allowed to transition orders." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed || !allowed.includes(toStatus)) {
    return {
      ok: false,
      code: "order.invalid_transition",
      message: `Cannot move order from ${order.status} to ${toStatus}.`,
    };
  }

  if (toStatus === "shipped" && order.deliveryMethod !== "pickup" && !trackingNumber) {
    return {
      ok: false,
      code: "order.tracking_required",
      message: "Delivery orders require a tracking number before shipping.",
    };
  }

  if (actorMembership.role === "staff") {
    const [membership] = await db
      .select()
      .from(shopMembership)
      .where(eq(shopMembership.id, order.assignedMembershipId ?? ""))
      .limit(1);
    if (!membership || membership.userId !== actorUserId) {
      return { ok: false, code: "shop.forbidden", message: "Staff can only transition assigned orders." };
    }
  }

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: toStatus,
          ...(trackingNumber ? { trackingNumber } : {}),
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: uuidv4(),
        orderId,
        status: toStatus,
        note: trackingNumber ? `Tracking ${trackingNumber}` : undefined,
        actorUserId,
      });

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "order",
        targetId: orderId,
        action: `order.${toStatus}`,
        detailsJson: { trackingNumber },
      });
    });
    return { ok: true, status: toStatus };
  } catch (error) {
    logger.error("order.transition_failed", { event: "order.transition_failed", error: String(error) });
    return { ok: false, code: "order.transition_failed", message: "Could not update order status." };
  }
}

export type OrderDetail = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  subtotalKobo: number;
  deliveryKobo: number;
  vatKobo: number;
  totalKobo: number;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    productName: string;
    variantLabel: string;
    color: string | null;
    size: string | null;
    quantity: number;
    unitPriceKobo: number;
    lineTotalKobo: number;
  }[];
};

export async function getOrderDetail(shopId: string, orderId: string): Promise<OrderDetail | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) return null;

  const [customer] = await db
    .select({ userId: shopCustomers.userId })
    .from(shopCustomers)
    .where(eq(shopCustomers.id, order.customerId))
    .limit(1);

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    subtotalKobo: Number(order.subtotalKobo),
    deliveryKobo: Number(order.deliveryKobo),
    vatKobo: Number(order.vatKobo),
    totalKobo: Number(order.totalKobo),
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    contactEmail: order.contactEmail,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2,
    city: order.city,
    state: order.state,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: itemRows.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantLabel: i.variantLabel,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      unitPriceKobo: Number(i.unitPriceKobo),
      lineTotalKobo: Number(i.lineTotalKobo),
    })),
  };
}

export type RequestRefundInput = {
  shopId: string;
  actorUserId: string;
  orderId: string;
  reason: string;
};

export type RequestRefundResult =
  | { ok: true; refundId: string }
  | { ok: false; code: string; message: string };

export async function requestRefund(input: RequestRefundInput): Promise<RequestRefundResult> {
  const { shopId, actorUserId, orderId, reason } = input;

  const [actorMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (
    !actorMembership ||
    (actorMembership.role !== "owner" && actorMembership.role !== "manager")
  ) {
    return { ok: false, code: "shop.forbidden", message: "Only owners and managers can request refunds." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }
  if (order.paymentStatus !== "paid") {
    return { ok: false, code: "order.not_paid", message: "Only paid orders can be refunded." }
  }
  if (order.status !== "awaiting_auth" && order.status !== "paid") {
    return { ok: false, code: "order.in_production_or_later", message: "Refunds are only allowed before production starts." };
  }

  const [existingRefund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);
  if (existingRefund) {
    return { ok: false, code: "order.refund_exists", message: "A refund already exists for this order." };
  }

  const [payout] = await db.select().from(payouts).where(eq(payouts.orderId, orderId)).limit(1);
  if (payout && payout.status === "settled") {
    return { ok: false, code: "order.payout_settled", message: "Cannot refund an order with a settled payout." };
  }

  try {
    await db.transaction(async (tx) => {
      const [refundRow] = await tx
        .insert(refunds)
        .values({ id: uuidv4(), orderId, amountKobo: order.totalKobo, reason, requestingUserId: actorUserId })
        .returning();

      const paystackConfigured = isPaystackConfigured();
      const attemptStatus = paystackConfigured ? "pending" : "pending";

      await tx.insert(refundAttempts).values({
        id: uuidv4(),
        refundId: refundRow.id,
        idempotencyKey: uuidv4(),
        paystackReference: null,
        status: attemptStatus,
        providerResultJson: null,
      });

      await tx
        .update(orders)
        .set({ status: "refund_pending", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: uuidv4(),
        orderId,
        status: "refund_pending",
        note: `Refund requested: ${reason}`,
        actorUserId,
      });

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "order",
        targetId: orderId,
        action: "order.refund_request",
        detailsJson: { reason, amountKobo: order.totalKobo },
      });
    });
    return { ok: true, refundId: orderId };
  } catch (error) {
    logger.error("order.refund_request_failed", { event: "order.refund_request_failed", error: String(error) });
    return { ok: false, code: "order.refund_request_failed", message: "Could not request refund." };
  }
}

export type CheckRefundInput = {
  shopId: string;
  actorUserId: string;
  orderId: string;
};

export type CheckRefundResult =
  | { ok: true; status: string; providerStatus: string | null }
  | { ok: false; code: string; message: string };

export async function checkRefundStatus(input: CheckRefundInput): Promise<CheckRefundResult> {
  const { shopId, actorUserId, orderId } = input;

  const [actorMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (
    !actorMembership ||
    (actorMembership.role !== "owner" && actorMembership.role !== "manager")
  ) {
    return { ok: false, code: "shop.forbidden", message: "Only owners and managers can check refund status." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }

  const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);
  if (!refundRow) {
    return { ok: false, code: "order.no_refund", message: "No refund exists for this order." };
  }

  const [attempt] = await db
    .select()
    .from(refundAttempts)
    .where(eq(refundAttempts.refundId, refundRow.id))
    .orderBy(desc(refundAttempts.createdAt))
    .limit(1);

  let providerStatus = attempt?.paystackReference ? (attempt.status as string) : null;

  if (isPaystackConfigured() && attempt?.paystackReference) {
    const provider = await fetchRefund(attempt.paystackReference);
    if (provider.ok) {
      providerStatus = provider.data.status;
      try {
        await db.update(refundAttempts).set({ providerResultJson: provider.data }).where(eq(refundAttempts.id, attempt.id));
      } catch {}
    }
  }

  return { ok: true, status: refundRow.status, providerStatus };
}

export type RetryRefundInput = {
  shopId: string;
  actorUserId: string;
  orderId: string;
};

export type RetryRefundResult =
  | { ok: true; refundId: string }
  | { ok: false; code: string; message: string };

export async function retryRefund(input: RetryRefundInput): Promise<RetryRefundResult> {
  const { shopId, actorUserId, orderId } = input;

  const [actorMembership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (
    !actorMembership ||
    (actorMembership.role !== "owner" && actorMembership.role !== "manager")
  ) {
    return { ok: false, code: "shop.forbidden", message: "Only owners and managers can retry refunds." };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.shopId !== shopId) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }

  const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);
  if (!refundRow) {
    return { ok: false, code: "order.no_refund", message: "No refund exists for this order." };
  }
  if (refundRow.status !== "failed") {
    return { ok: false, code: "order.refund_not_failed", message: "Only failed refunds can be retried." };
  }

  const [lastAttempt] = await db
    .select()
    .from(refundAttempts)
    .where(eq(refundAttempts.refundId, refundRow.id))
    .orderBy(desc(refundAttempts.createdAt))
    .limit(1);
  if (!lastAttempt || lastAttempt.status !== "failed") {
    return { ok: false, code: "order.no_failed_attempt", message: "No failed attempt to retry from." };
  }

  let paystackReference: string | null = null;

  if (isPaystackConfigured()) {
    const created = await createRefund({ transaction: order.id, amount: Number(order.totalKobo) });
    if (!created.ok) {
      return { ok: false, code: "order.refund_provider_failed", message: created.error };
    }
    paystackReference = created.data.reference;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(refundAttempts).values({
        id: uuidv4(),
        refundId: refundRow.id,
        idempotencyKey: uuidv4(),
        paystackReference,
        status: "pending",
        providerResultJson: null,
      });

      await tx
        .update(refunds)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(refunds.id, refundRow.id));

      await tx
        .update(orders)
        .set({ status: "refund_pending", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: uuidv4(),
        orderId,
        status: "refund_pending",
        note: "Refund retried",
        actorUserId,
      });

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "order",
        targetId: orderId,
        action: "order.refund_retry",
        detailsJson: null,
      });
    });
    return { ok: true, refundId: refundRow.id };
  } catch (error) {
    logger.error("order.refund_retry_failed", { event: "order.refund_retry_failed", error: String(error) });
    return { ok: false, code: "order.refund_retry_failed", message: "Could not retry refund." };
  }
}

export type CompleteRefundInput = {
  orderId: string;
  refundStatus: "succeeded" | "failed";
  paystackReference?: string | null;
  actorUserId?: string | null;
};

export type CompleteRefundResult = { ok: true } | { ok: false; code: string; message: string };

export async function completeRefund(input: CompleteRefundInput): Promise<CompleteRefundResult> {
  const { orderId, refundStatus, paystackReference, actorUserId } = input;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return { ok: false, code: "order.not_found", message: "Order not found." };
  }

  const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);
  if (!refundRow) {
    return { ok: false, code: "order.no_refund", message: "No refund exists for this order." };
  }

  const [latestAttempt] = await db
    .select()
    .from(refundAttempts)
    .where(eq(refundAttempts.refundId, refundRow.id))
    .orderBy(desc(refundAttempts.createdAt))
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({ status: refundStatus, updatedAt: new Date() })
        .where(eq(refunds.id, refundRow.id));

      if (paystackReference && latestAttempt) {
        await tx
          .update(refundAttempts)
          .set({ paystackReference, status: refundStatus, verifiedAt: new Date() })
          .where(eq(refundAttempts.id, latestAttempt.id));
      }
      if (refundStatus === "succeeded") {
        await tx
          .update(payments)
          .set({ verified: true, providerStatus: "succeeded" })
          .where(eq(payments.orderId, orderId));

        await tx
          .update(payouts)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(payouts.orderId, orderId), eq(payouts.status, "pending")));

        await tx
          .update(orders)
          .set({ status: "refunded", paymentStatus: "refunded", updatedAt: new Date() })
          .where(eq(orders.id, orderId));
      } else {
        await tx
          .update(orders)
          .set({ status: "refund_failed", updatedAt: new Date() })
          .where(eq(orders.id, orderId));
      }

      await tx.insert(orderStatusHistory).values({
        id: uuidv4(),
        orderId,
        status: refundStatus === "succeeded" ? "refunded" : "refund_failed",
        note: refundStatus === "succeeded" ? "Refund completed" : "Refund failed",
        actorUserId: actorUserId ?? null,
      });

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId: actorUserId ?? null,
        targetType: "order",
        targetId: orderId,
        action: `order.refund_${refundStatus}`,
        detailsJson: { paystackReference },
      });
    });
    return { ok: true };
  } catch (error) {
    logger.error("order.refund_complete_failed", { event: "order.refund_complete_failed", error: String(error) });
    return { ok: false, code: "order.refund_complete_failed", message: "Could not complete refund." };
  }
}

export type CustomerOrderTracking = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  totalKobo: number;
  createdAt: Date;
  refundStatus: string | null;
  refundReason: string | null;
};

export async function getCustomerOrderTracking(
  customerUserId: string,
  orderId: string,
): Promise<CustomerOrderTracking | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerUserId, customerUserId)))
    .limit(1);
  if (!order) return null;

  const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalKobo: Number(order.totalKobo),
    createdAt: order.createdAt,
    refundStatus: refundRow?.status ?? null,
    refundReason: refundRow?.reason ?? null,
  };
}

export type ListCustomerOrdersInput = { customerUserId: string; page?: number };
export type ListCustomerOrdersResult = {
  orders: CustomerOrderTracking[];
  page: number;
  pageCount: number;
  hasNext: boolean;
};

export async function listCustomerOrders(input: ListCustomerOrdersInput): Promise<ListCustomerOrdersResult> {
  const page = Math.max(1, input.page ?? 1);

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.customerUserId, input.customerUserId))
    .orderBy(desc(orders.createdAt))
    .limit(25 + 1);

  const hasNext = orderRows.length > 25;
  const pageOrders = orderRows.slice(0, 25);

  const orderIds = pageOrders.map((o) => o.id);
  const refundByOrder = new Map<string, { status: string; reason: string }>();
  if (orderIds.length > 0) {
    const refundRows = await db.select().from(refunds).where(inArray(refunds.orderId, orderIds));
    for (const r of refundRows) {
      refundByOrder.set(r.orderId, { status: r.status, reason: r.reason });
    }
  }

  return {
    orders: pageOrders.map((o) => {
      const refund = refundByOrder.get(o.id);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalKobo: Number(o.totalKobo),
        createdAt: o.createdAt,
        refundStatus: refund?.status ?? null,
        refundReason: refund?.reason ?? null,
      };
    }),
    page,
    pageCount: Math.max(1, Math.ceil((pageOrders.length + (hasNext ? 1 : 0)) / 25)),
    hasNext,
  };
}

export type ShopMemberCard = {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  role: string;
  status: string;
};

export async function listShopMemberships(shopId: string): Promise<ShopMemberCard[]> {
  const rows = await db
    .select({
      membershipId: shopMembership.id,
      userId: shopMembership.userId,
      role: shopMembership.role,
      status: shopMembership.status,
      userName: user.name,
      userEmail: user.email,
    })
    .from(shopMembership)
    .innerJoin(user, eq(user.id, shopMembership.userId))
    .where(eq(shopMembership.shopId, shopId))
    .orderBy(shopMembership.createdAt);

  return rows.map((r) => ({
    membershipId: r.membershipId,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    role: r.role,
    status: r.status,
  }));
}

export type CreateProductInput = {
  shopId: string;
  actorUserId: string;
  name: string;
  slug: string;
  category: string | null;
  artworkKind: string | null;
  description: string | null;
  basePriceKobo: number | null;
  sizes: string[] | null;
  colors: string[] | null;
  status: "draft" | "published" | "archived";
  variants: Array<{
    material: string;
    finish: string;
    priceAddonKobo: number;
    minimumQuantity: number;
  }>;
};

export type CreateProductResult = Result<{ productId: string }, PrinterError>;

const PRODUCT_CATEGORIES = ["caps", "apparel", "bags", "other"];

export async function createProduct(input: CreateProductInput): Promise<CreateProductResult> {
  const {
    shopId,
    actorUserId,
    name,
    slug: rawSlug,
    category,
    artworkKind,
    description,
    basePriceKobo,
    sizes,
    colors,
    status,
    variants,
  } = input;

  const slug = normalizeSlug(rawSlug);
  if (!name.trim() || !slug) {
    return err({ code: "product.invalid_input", message: "Product name and slug are required." });
  }

  const [membership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);
  if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
    return err({ code: "shop.forbidden", message: "Only owners and managers can create products." });
  }

  const [shop] = await db.select().from(printerShop).where(eq(printerShop.id, shopId)).limit(1);
  if (!shop) {
    return err({ code: "shop.not_found", message: "Shop not found." });
  }
  if (shop.status === "suspended") {
    return err({ code: "shop.suspended", message: "A suspended shop cannot add products." });
  }

  if (status === "published") {
    if (!category || !PRODUCT_CATEGORIES.includes(category)) {
      return err({ code: "product.invalid_input", message: "Category is required for publication." });
    }
    if (!basePriceKobo || basePriceKobo <= 0) {
      return err({ code: "product.invalid_input", message: "Base price is required for publication." });
    }
  }

  if (!variants || variants.length === 0) {
    return err({ code: "product.invalid_input", message: "At least one variant is required." });
  }

  const normalizedVariants = variants.map((v) => ({
    material: v.material.trim(),
    finish: v.finish.trim(),
    priceAddonKobo: Math.max(0, Math.floor(Number(v.priceAddonKobo) || 0)),
    minimumQuantity: Math.max(1, Math.floor(Number(v.minimumQuantity) || 1)),
  }));

  const seen = new Set<string>();
  for (const v of normalizedVariants) {
    if (!v.material || !v.finish) {
      return err({ code: "product.invalid_input", message: "Material and finish are required for each variant." });
    }
    const key = `${v.material.toLowerCase()}|${v.finish.toLowerCase()}`;
    if (seen.has(key)) {
      return err({ code: "product.invalid_input", message: "Duplicate material and finish combination." });
    }
    seen.add(key);
    if (status === "published" && (basePriceKobo ?? 0) + v.priceAddonKobo <= 0) {
      return err({ code: "product.invalid_input", message: "Published variants must have a positive price." });
    }
  }

  const [slugTaken] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.shopId, shopId), eq(products.slug, slug)))
    .limit(1);
  if (slugTaken) {
    return err({ code: "product.slug_taken", message: "That product slug is already taken." });
  }

  const productId = uuidv4();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: productId,
        shopId,
        slug,
        name: name.trim(),
        category: status === "published" ? category : null,
        artworkKind: artworkKind ?? null,
        description: description ?? null,
        basePriceKobo: status === "published" ? basePriceKobo : null,
        sizes: sizes ?? null,
        colors: colors ?? null,
        status,
      });

      for (const v of normalizedVariants) {
        await tx.insert(productVariants).values({
          id: uuidv4(),
          productId,
          material: v.material,
          finish: v.finish,
          priceAddonKobo: v.priceAddonKobo,
          minimumQuantity: v.minimumQuantity,
        });
      }

      await tx.insert(auditEvent).values({
        id: uuidv4(),
        actorUserId,
        targetType: "product",
        targetId: productId,
        action: "product.create",
        detailsJson: { slug, status, variantCount: normalizedVariants.length },
      });
    });
    logger.info("product.created", { event: "product.created", productId, shopId, slug });
    return ok({ productId });
  } catch (error) {
    logger.error("product.create_failed", { event: "product.create_failed", error: String(error) });
    return err({ code: "product.create_failed", message: "Could not create product." });
  }
}

