DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "product_variants"
		GROUP BY "product_id", lower(trim("material")), lower(trim("finish"))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot add normalized variant uniqueness while duplicate material and finish pairs exist';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_image_uploads"
		WHERE "size_bytes" <= 0
	) THEN
		RAISE EXCEPTION 'Cannot convert upload intents with a nonpositive file size';
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "asset_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"product_id" uuid,
	"uploader_id" uuid NOT NULL,
	"asset_type" text DEFAULT 'product_photo' NOT NULL,
	"temporary_object_key" text NOT NULL,
	"expected_content_type" text NOT NULL,
	"expected_size_bytes" integer NOT NULL,
	"alt_text" text,
	"attests_real_product" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"failure_code" text,
	"result_reference" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_upload_intents_temporary_object_key_unique" UNIQUE("temporary_object_key"),
	CONSTRAINT "asset_upload_intents_type_target_check" CHECK (("asset_upload_intents"."asset_type" = 'product_photo' and "asset_upload_intents"."product_id" is not null) or ("asset_upload_intents"."asset_type" in ('shop_logo', 'shop_banner') and "asset_upload_intents"."product_id" is null)),
	CONSTRAINT "asset_upload_intents_status_check" CHECK ("asset_upload_intents"."status" in ('reserved', 'uploading', 'processing', 'complete', 'failed', 'expired', 'cancelled')),
	CONSTRAINT "asset_upload_intents_expected_size_positive_check" CHECK ("asset_upload_intents"."expected_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "publication_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"product_id" uuid,
	"target_state" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_transitions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "publication_transitions_one_target_check" CHECK (("publication_transitions"."shop_id" is not null and "publication_transitions"."product_id" is null) or ("publication_transitions"."shop_id" is null and "publication_transitions"."product_id" is not null)),
	CONSTRAINT "publication_transitions_status_check" CHECK ("publication_transitions"."status" in ('queued', 'processing', 'retryable_failed', 'complete')),
	CONSTRAINT "publication_transitions_retry_count_check" CHECK ("publication_transitions"."retry_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_material_finish_uq";--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "material" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "finish" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "logo_object_key" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "logo_public_object_key" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "logo_alt_text" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "banner_object_key" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "banner_public_object_key" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "banner_alt_text" text;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "banner_decorative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_shops" ADD COLUMN "visibility_transition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "public_object_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "visibility_transition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_upload_intents" ADD CONSTRAINT "asset_upload_intents_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_upload_intents" ADD CONSTRAINT "asset_upload_intents_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_upload_intents" ADD CONSTRAINT "asset_upload_intents_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "asset_upload_intents" (
	"id",
	"shop_id",
	"product_id",
	"uploader_id",
	"asset_type",
	"temporary_object_key",
	"expected_content_type",
	"expected_size_bytes",
	"alt_text",
	"attests_real_product",
	"expires_at",
	"status",
	"completed_at",
	"created_at"
)
SELECT
	"id",
	"shop_id",
	"product_id",
	"uploader_id",
	'product_photo',
	"temporary_key",
	"content_type",
	"size_bytes",
	"alt_text",
	false,
	"expires_at",
	CASE
		WHEN "completed_at" IS NOT NULL THEN 'complete'
		WHEN "expires_at" <= now() THEN 'expired'
		ELSE 'reserved'
	END,
	"completed_at",
	"created_at"
FROM "product_image_uploads";--> statement-breakpoint
ALTER TABLE "publication_transitions" ADD CONSTRAINT "publication_transitions_shop_id_printer_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."printer_shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_transitions" ADD CONSTRAINT "publication_transitions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_upload_intents_shop_status_expiry_idx" ON "asset_upload_intents" USING btree ("shop_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "asset_upload_intents_product_status_expiry_idx" ON "asset_upload_intents" USING btree ("product_id","status","expires_at") WHERE "asset_upload_intents"."product_id" is not null;--> statement-breakpoint
CREATE INDEX "publication_transitions_status_created_idx" ON "publication_transitions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_transitions_active_shop_uq" ON "publication_transitions" USING btree ("shop_id") WHERE "publication_transitions"."shop_id" is not null and "publication_transitions"."status" in ('queued', 'processing', 'retryable_failed');--> statement-breakpoint
CREATE UNIQUE INDEX "publication_transitions_active_product_uq" ON "publication_transitions" USING btree ("product_id") WHERE "publication_transitions"."product_id" is not null and "publication_transitions"."status" in ('queued', 'processing', 'retryable_failed');--> statement-breakpoint
CREATE INDEX "printer_shops_status_location_idx" ON "printer_shops" USING btree ("status","state","city");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_normalized_material_finish_uq" ON "product_variants" USING btree ("product_id",lower(trim("material")),lower(trim("finish"))) WHERE "product_variants"."material" is not null and "product_variants"."finish" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_shop_status_updated_idx" ON "products" USING btree ("shop_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "products_shop_published_name_idx" ON "products" USING btree ("shop_id","name","id") WHERE "products"."status" = 'published' and "products"."visibility_transition" = false;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_public_object_key_unique" UNIQUE("public_object_key");--> statement-breakpoint
ALTER TABLE "printer_shops" ADD CONSTRAINT "printer_shops_description_length_check" CHECK ("printer_shops"."description" is null or char_length("printer_shops"."description") <= 2000);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_description_length_check" CHECK ("products"."description" is null or char_length("products"."description") <= 2000);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_version_positive_check" CHECK ("products"."version" > 0);