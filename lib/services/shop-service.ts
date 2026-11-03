import { db } from "@/lib/db/client";
import { eq, and, sql, inArray, desc, count } from "drizzle-orm";
import { printerShop, shopMembership, member, organization, user } from "@/lib/db/schema";
import { logger } from "@/lib/log/logger";
import { v4 as uuidv4 } from "uuid";

export type CreateShopInput = {
  name: string;
  slug: string;
  ownerUserId: string;
  state: string;
  city: string;
  area: string | null;
};

export type CreateShopResult = { ok: true; shopId: string } | { ok: false; code: string; message: string };

export async function createShop(input: CreateShopInput): Promise<CreateShopResult> {
  const { name, slug, ownerUserId, state, city, area } = input;
  const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");

  if (!name.trim() || !normalizedSlug) {
    return { ok: false, code: "shop.invalid_input", message: "Shop name and slug are required." };
  }
  if (!state.trim() || !city.trim()) {
    return { ok: false, code: "shop.invalid_input", message: "State and city are required." };
  }

  try {
    const [existing] = await db
      .select()
      .from(printerShop)
      .where(eq(printerShop.slug, normalizedSlug))
      .limit(1);

    if (existing) {
      return { ok: false, code: "shop.slug_taken", message: "That shop slug is already taken." };
    }

    const shopId = uuidv4();

    await db.transaction(async (tx) => {
      await tx.insert(printerShop).values({
        id: shopId,
        ownerUserId,
        name: name.trim(),
        slug: normalizedSlug,
        status: "draft",
        state: state.trim(),
        city: city.trim(),
        area: area ?? null,
      });

      await tx.insert(shopMembership).values({
        shopId,
        userId: ownerUserId,
        role: "owner",
        status: "active",
      });
    });

    logger.info("shop.created", { event: "shop.created", shopId, slug: normalizedSlug });
    return { ok: true, shopId };
  } catch (err) {
    logger.error("shop.create_failed", { event: "shop.create_failed", error: String(err) });
    return { ok: false, code: "shop.create_failed", message: "Could not create shop." };
  }
}

export type InviteMemberInput = {
  shopId: string;
  email: string;
  role: "manager" | "staff";
  actorUserId: string;
};

export type InviteMemberResult = { ok: true; membershipId: string } | { ok: false; code: string; message: string };

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const { shopId, email, role, actorUserId } = input;

  const [membership] = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, actorUserId)))
    .limit(1);

  const canInvite = Boolean(membership) && (membership.role === "owner" || membership.role === "manager");
  if (!canInvite) {
    return { ok: false, code: "shop.forbidden", message: "You do not have permission to invite members." };
  }

  const targetUser = await db.select().from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  if (!targetUser[0]) {
    return { ok: false, code: "shop.user_not_found", message: "No account found with that email." };
  }

  const existing = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, targetUser[0].id)))
    .limit(1);

  if (existing[0]) {
    return { ok: false, code: "shop.already_member", message: "That user is already a member of this shop." };
  }

  const membershipId = uuidv4();
  await db.insert(shopMembership).values({
    id: membershipId,
    shopId,
    userId: targetUser[0].id,
    role,
    status: "active",
  });

  logger.info("shop.member_invited", { event: "shop.member_invited", shopId, email: targetUser[0].email });
  return { ok: true, membershipId };
}

export async function listShopMembers(shopId: string) {
  const rows = await db
    .select({
      membershipId: shopMembership.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: shopMembership.role,
      status: shopMembership.status,
      createdAt: shopMembership.createdAt,
    })
    .from(shopMembership)
    .innerJoin(user, eq(shopMembership.userId, user.id))
    .where(eq(shopMembership.shopId, shopId))
    .orderBy(shopMembership.createdAt);

  return rows;
}

export async function getShopForUser(shopId: string, userId: string) {
  const rows = await db
    .select()
    .from(printerShop)
    .where(and(eq(printerShop.id, shopId), eq(printerShop.ownerUserId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listShopsForUser(userId: string) {
  const rows = await db
    .select({
      shopId: printerShop.id,
      name: printerShop.name,
      slug: printerShop.slug,
      status: printerShop.status,
      membershipRole: shopMembership.role,
    })
    .from(shopMembership)
    .innerJoin(printerShop, eq(shopMembership.shopId, printerShop.id))
    .where(and(eq(shopMembership.userId, userId), eq(shopMembership.status, "active")))
    .orderBy(printerShop.createdAt);

  return rows;
}

export async function getShopBySlug(slug: string) {
  const rows = await db.select().from(printerShop).where(eq(printerShop.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function isShopMember(shopId: string, userId: string) {
  const rows = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.shopId, shopId), eq(shopMembership.userId, userId), eq(shopMembership.status, "active")))
    .limit(1);
  return Boolean(rows[0]);
}