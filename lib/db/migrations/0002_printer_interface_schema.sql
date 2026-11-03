CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"front_artwork_json" json,
	"back_artwork_json" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"design_id" uuid,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"color" text,
	"size" text,
	"quantity" integer NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"line_total_kobo" bigint NOT NULL,
	"design_snapshot" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"status" text DEFAULT 'awaiting_auth' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"delivery_method" text NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"delivery_kobo" bigint NOT NULL,
	"vat_kobo" bigint NOT NULL,
	"total_kobo" bigint NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"carrier" text,
	"tracking_number" text,
	"decline_reason" text,
	"assigned_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_shop_order_number_uq" UNIQUE("shop_id","order_number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"provider" text DEFAULT 'paystack' NOT NULL,
	"channel" text,
	"amount_kobo" bigint NOT NULL,
	"provider_status" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"gross_kobo" bigint NOT NULL,
	"platform_fee_kobo" bigint NOT NULL,
	"net_kobo" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paystack_settlement_reference" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "product_image_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"temporary_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"alt_text" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_image_uploads_temporary_key_unique" UNIQUE("temporary_key")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"alt_text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"attested_by_user_id" uuid,
	"attested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "product_images_product_sort_uq" UNIQUE("product_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"material" text NOT NULL,
	"finish" text NOT NULL,
	"price_addon_kobo" bigint DEFAULT 0 NOT NULL,
	"minimum_quantity" integer DEFAULT 1 NOT NULL,
	"bulk_tiers" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_product_material_finish_uq" UNIQUE("product_id","material","finish")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"artwork_kind" text,
	"base_price_kobo" bigint,
	"sizes" text[],
	"colors" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"mockup_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_shop_slug_uq" UNIQUE("shop_id","slug")
);
--> statement-breakpoint
CREATE TABLE "refund_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"paystack_reference" text,
	"status" text NOT NULL,
	"provider_result_json" json,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_attempts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"reason" text NOT NULL,
	"requesting_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "shop_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_customers_shop_user_uq" UNIQUE("shop_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_role_uq" UNIQUE("user_id","role")
);
--> statement-breakpoint
ALTER TABLE "printer_shops" DROP CONSTRAINT "printer_shops_owner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "state" text NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "city" text NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "vat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "delivery_config" json;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "paystack_subaccount_code" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "order_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_membership_id_shop_memberships_id_fk" FOREIGN KEY ("assigned_membership_id") REFERENCES "public"."shop_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image_uploads" ADD CONSTRAINT "product_image_uploads_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image_uploads" ADD CONSTRAINT "product_image_uploads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image_uploads" ADD CONSTRAINT "product_image_uploads_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_attested_by_user_id_user_id_fk" FOREIGN KEY ("attested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requesting_user_id_user_id_fk" FOREIGN KEY ("requesting_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_customers" ADD CONSTRAINT "shop_customers_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_customers" ADD CONSTRAINT "shop_customers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designs_user_updated_idx" ON "designs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_shop_status_idx" ON "orders" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "orders_customer_user_created_idx" ON "orders" USING btree ("customer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "products_shop_active_idx" ON "products" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "refund_attempts_refund_created_idx" ON "refund_attempts" USING btree ("refund_id","created_at");--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_address_id_addresses_id_fk" FOREIGN KEY ("default_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD CONSTRAINT "printer_shops_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD CONSTRAINT "printer_shops_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD CONSTRAINT "printer_shops_organization_id_unique" UNIQUE("organization_id");