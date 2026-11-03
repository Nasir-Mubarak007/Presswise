import {
  pgTable,
  text,
  uuid,
  boolean,
  timestamp,
  integer,
  json,
  unique,
  index,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Better Auth core
export const user = pgTable("user", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: uuid("active_organization_id"),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  identifier: text("identifier").notNull(),
});

export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lastRequest: timestamp("last_request", { withTimezone: true }).notNull().defaultNow(),
});

// Better Auth organization plugin
export const organization = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
  },
  (t) => [index("organization_slug_idx").on(t.slug)],
);

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [unique("member_org_user_uq").on(t.organizationId, t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    inviterId: uuid("inviter_id").references(() => user.id),
  },
);

// Presswise app tables
export const printerShop = pgTable(
  "printer_shops",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organization.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("draft"),
    suspensionReason: text("suspension_reason"),
    brandColor: text("brand_color"),
    theme: text("theme"),
    tagline: text("tagline"),
    state: text("state").notNull(),
    city: text("city").notNull(),
    area: text("area"),
    vatEnabled: boolean("vat_enabled").notNull().default(false),
    deliveryConfig: json("delivery_config"),
    paystackSubaccountCode: text("paystack_subaccount_code"),
    orderSeq: integer("order_seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("printer_shops_slug_idx").on(t.slug), unique("printer_shops_organization_id_unique").on(t.organizationId)],
);

export const shopMembership = pgTable(
  "shop_memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => printerShop.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("staff"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("shop_memberships_shop_user_uq").on(t.shopId, t.userId)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("user_roles_user_role_uq").on(t.userId, t.role)],
);

export const shopCustomers = pgTable(
  "shop_customers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => printerShop.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("shop_customers_shop_user_uq").on(t.shopId, t.userId)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const customerProfile = pgTable(
  "customer_profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    fullName: text("full_name"),
    phone: text("phone"),
    preferredCurrency: text("preferred_currency").notNull().default("NGN"),
    defaultAddressId: uuid("default_address_id").references(() => addresses.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const auditEvent = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    detailsJson: json("details_json"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => printerShop.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    artworkKind: text("artwork_kind"),
    basePriceKobo: bigint("base_price_kobo", { mode: "number" }),
    sizes: text("sizes").array(),
    colors: text("colors").array(),
    status: text("status").notNull().default("draft"),
    mockupUrl: text("mockup_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("products_shop_slug_uq").on(t.shopId, t.slug), index("products_shop_active_idx").on(t.shopId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    material: text("material").notNull(),
    finish: text("finish").notNull(),
    priceAddonKobo: bigint("price_addon_kobo", { mode: "number" }).notNull().default(0),
    minimumQuantity: integer("minimum_quantity").notNull().default(1),
    bulkTiers: json("bulk_tiers"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("product_variants_product_material_finish_uq").on(t.productId, t.material, t.finish)],
);

export const designs = pgTable(
  "designs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("draft"),
    frontArtworkJson: json("front_artwork_json"),
    backArtworkJson: json("back_artwork_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("designs_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => printerShop.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => shopCustomers.id, { onDelete: "restrict" }),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    orderNumber: integer("order_number").notNull(),
    status: text("status").notNull().default("awaiting_auth"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    deliveryMethod: text("delivery_method").notNull(),
    subtotalKobo: bigint("subtotal_kobo", { mode: "number" }).notNull(),
    deliveryKobo: bigint("delivery_kobo", { mode: "number" }).notNull(),
    vatKobo: bigint("vat_kobo", { mode: "number" }).notNull(),
    totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NGN"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    declineReason: text("decline_reason"),
    assignedMembershipId: uuid("assigned_membership_id").references(() => shopMembership.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("orders_shop_order_number_uq").on(t.shopId, t.orderNumber),
    index("orders_shop_status_idx").on(t.shopId, t.status),
    index("orders_customer_user_created_idx").on(t.customerUserId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    designId: uuid("design_id").references(() => designs.id, { onDelete: "set null" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label").notNull(),
    color: text("color"),
    size: text("size"),
    quantity: integer("quantity").notNull(),
    unitPriceKobo: bigint("unit_price_kobo", { mode: "number" }).notNull(),
    lineTotalKobo: bigint("line_total_kobo", { mode: "number" }).notNull(),
    designSnapshot: json("design_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_created_idx").on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    reference: text("reference").notNull().unique(),
    provider: text("provider").notNull().default("paystack"),
    channel: text("channel"),
    amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
    providerStatus: text("provider_status").notNull(),
    verified: boolean("verified").notNull().default(false),
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => printerShop.id, { onDelete: "restrict" }),
    grossKobo: bigint("gross_kobo", { mode: "number" }).notNull(),
    platformFeeKobo: bigint("platform_fee_kobo", { mode: "number" }).notNull(),
    netKobo: bigint("net_kobo", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    paystackSettlementReference: text("paystack_settlement_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("payouts_order_id_unique").on(t.orderId)],
);

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  altText: text("alt_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  attestedByUserId: uuid("attested_by_user_id").references(() => user.id, { onDelete: "set null" }),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("product_images_product_sort_uq").on(t.productId, t.sortOrder)]);

export const productImageUploads = pgTable("product_image_uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => printerShop.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  temporaryKey: text("temporary_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  altText: text("alt_text").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" })
    .unique(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  requestingUserId: uuid("requesting_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refundAttempts = pgTable("refund_attempts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  refundId: uuid("refund_id")
    .notNull()
    .references(() => refunds.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  paystackReference: text("paystack_reference"),
  status: text("status").notNull(),
  providerResultJson: json("provider_result_json"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("refund_attempts_refund_created_idx").on(t.refundId, t.createdAt)]);


