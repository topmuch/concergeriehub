-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "password_hash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "selected_plan" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "homes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pin_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "homes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "home_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "nickname" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "home_members_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "home_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rooms_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "qr_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "room_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "public_slug" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "pin_code" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "qr_codes_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qr_codes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "qr_contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qr_code_id" TEXT NOT NULL,
    "content_json" TEXT NOT NULL DEFAULT '{}',
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "qr_contents_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "qr_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL,
    "design_config" TEXT NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qr_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "physical_qr_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_id" TEXT NOT NULL,
    "activation_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "activated_by_user_id" TEXT,
    "activated_at" DATETIME,
    "dynamic_qr_code_id" TEXT,
    "design_config" TEXT NOT NULL DEFAULT '{}',
    "setup_token" TEXT,
    "is_claimed" BOOLEAN NOT NULL DEFAULT false,
    "hub_slug" TEXT,
    "claimed_by_user_id" TEXT,
    "claimed_at" DATETIME,
    "home_id" TEXT,
    CONSTRAINT "physical_qr_codes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "qr_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "physical_qr_codes_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "physical_qr_codes_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "physical_qr_codes_dynamic_qr_code_id_fkey" FOREIGN KEY ("dynamic_qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "physical_qr_codes_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "activation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "physical_qr_code_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activation_logs_physical_qr_code_id_fkey" FOREIGN KEY ("physical_qr_code_id") REFERENCES "physical_qr_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "guestbook_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qr_code_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guestbook_entries_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "qr_code_id" TEXT,
    "user_id" TEXT,
    "action_type" TEXT NOT NULL,
    "details_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "min_stock_threshold" INTEGER NOT NULL DEFAULT 1,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "is_on_shopping_list" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,
    "purchase_date" DATETIME,
    "expiry_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'fresh',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_instances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_instances_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "points_value" INTEGER NOT NULL DEFAULT 10,
    "frequency" TEXT NOT NULL DEFAULT 'once',
    "assigned_to_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chores_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chores_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chore_completions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chore_id" TEXT NOT NULL,
    "child_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "completed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending_validation',
    CONSTRAINT "chore_completions_chore_id_fkey" FOREIGN KEY ("chore_id") REFERENCES "chores" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chore_completions_child_user_id_fkey" FOREIGN KEY ("child_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chore_completions_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh_key" TEXT NOT NULL,
    "auth_key" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "merchants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "home_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "address" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "opening_hours" TEXT NOT NULL DEFAULT '{}',
    "logo_url" TEXT,
    "subscription_tier" TEXT NOT NULL DEFAULT 'free',
    "subscription_expires_at" DATETIME,
    "stripe_customer_id" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "rating_avg" REAL NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "merchants_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "promos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "original_price" REAL,
    "promo_price" REAL,
    "valid_from" DATETIME,
    "valid_until" DATETIME,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT,
    "is_flash_sale" BOOLEAN NOT NULL DEFAULT false,
    "flash_sale_triggered_at" DATETIME,
    "flash_sale_cost" REAL,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "redemptions_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promos_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "promo_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promo_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redeemed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commission_amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "promo_redemptions_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "scraping_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "store_location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "products_scraped" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "professionals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "description" TEXT,
    "location" TEXT,
    "service_radius_km" INTEGER NOT NULL DEFAULT 10,
    "hourly_rate" REAL,
    "is_urgent_available" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_documents" TEXT NOT NULL DEFAULT '[]',
    "portfolio_images" TEXT NOT NULL DEFAULT '[]',
    "subscription_status" TEXT NOT NULL DEFAULT 'free',
    "subscription_expires_at" DATETIME,
    "stripe_customer_id" TEXT,
    "rating_avg" REAL NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "response_time_minutes" INTEGER,
    "total_jobs_completed" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "professional_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price" REAL NOT NULL DEFAULT 0,
    "price_unit" TEXT NOT NULL DEFAULT 'flat_rate',
    "duration_minutes" INTEGER,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "services_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "service_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "service_id" TEXT,
    "qr_code_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "preferred_date" DATETIME,
    "urgency_level" TEXT NOT NULL DEFAULT 'normal',
    "address" TEXT,
    "final_price" REAL,
    "commission_amount" REAL,
    "paid_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_requests_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_requests_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "service_requests_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service_request_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "emergency_qr_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qr_code_id" TEXT NOT NULL,
    "emergency_category" TEXT NOT NULL,
    "equipment_info" TEXT NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "emergency_qr_codes_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriber_id" TEXT NOT NULL,
    "subscriber_type" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billing_cycle" TEXT NOT NULL DEFAULT 'annual',
    "max_homes" INTEGER NOT NULL DEFAULT 1,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" DATETIME,
    "current_period_end" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "merchants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "professionals" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payer_id" TEXT,
    "receiver_id" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripe_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "flash_sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promo_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "original_price" REAL,
    "flash_price" REAL NOT NULL,
    "geofence_radius_meters" INTEGER NOT NULL DEFAULT 500,
    "starts_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "max_redemptions" INTEGER,
    "current_redemptions" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cost_euros" REAL NOT NULL DEFAULT 0.5,
    "transaction_id" TEXT,
    "push_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "flash_sales_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flash_sales_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flash_sales_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coupons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "promo_id" TEXT,
    "flash_sale_id" TEXT,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qr_code_data" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL DEFAULT 'percentage',
    "discount_value" REAL NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "valid_from" DATETIME,
    "valid_until" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "commission_rate" REAL NOT NULL DEFAULT 5.0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupons_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "coupons_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "coupons_flash_sale_id_fkey" FOREIGN KEY ("flash_sale_id") REFERENCES "flash_sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coupon_scans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "scanned_by_user_id" TEXT,
    "commission_amount" REAL NOT NULL DEFAULT 0,
    "transaction_id" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_scans_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "coupon_scans_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "coupon_scans_scanned_by_user_id_fkey" FOREIGN KEY ("scanned_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "coupon_scans_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service_request_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'text',
    "attachment_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data_json" TEXT NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_via_push" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "merchant_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merchant_photos_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "scan_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qr_code_id" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,
    "visitor_ip" TEXT,
    "user_agent" TEXT,
    "locale" TEXT DEFAULT 'fr',
    "referrer" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_logs_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scan_logs_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "webhooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '["scan","doorbell","guestbook"]',
    "secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_trigger_at" DATETIME,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "webhooks_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "home_automations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'home_assistant',
    "base_url" TEXT NOT NULL,
    "api_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "home_automations_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "voice_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "home_id" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL DEFAULT 'guest',
    "audio_url" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "file_size_kb" INTEGER NOT NULL DEFAULT 0,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voice_messages_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_members_home_id_idx" ON "home_members"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_members_user_id_idx" ON "home_members"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_members_role_idx" ON "home_members"("role");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "home_members_home_id_user_id_key" ON "home_members"("home_id", "user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rooms_home_id_idx" ON "rooms"("home_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "qr_codes_public_slug_key" ON "qr_codes"("public_slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_codes_home_id_idx" ON "qr_codes"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_codes_room_id_idx" ON "qr_codes"("room_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_codes_type_idx" ON "qr_codes"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_codes_is_active_idx" ON "qr_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "qr_contents_qr_code_id_key" ON "qr_contents"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qr_batches_created_by_idx" ON "qr_batches"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "physical_qr_codes_activation_code_key" ON "physical_qr_codes"("activation_code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "physical_qr_codes_setup_token_key" ON "physical_qr_codes"("setup_token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "physical_qr_codes_hub_slug_key" ON "physical_qr_codes"("hub_slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_batch_id_idx" ON "physical_qr_codes"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_status_idx" ON "physical_qr_codes"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_activated_by_user_id_idx" ON "physical_qr_codes"("activated_by_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_dynamic_qr_code_id_idx" ON "physical_qr_codes"("dynamic_qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_is_claimed_idx" ON "physical_qr_codes"("is_claimed");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_claimed_by_user_id_idx" ON "physical_qr_codes"("claimed_by_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_home_id_idx" ON "physical_qr_codes"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "physical_qr_codes_setup_token_idx" ON "physical_qr_codes"("setup_token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activation_logs_physical_qr_code_id_idx" ON "activation_logs"("physical_qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activation_logs_user_id_idx" ON "activation_logs"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activation_logs_action_idx" ON "activation_logs"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "guestbook_entries_qr_code_id_idx" ON "guestbook_entries"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "guestbook_entries_created_at_idx" ON "guestbook_entries"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_home_id_idx" ON "activity_logs"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_qr_code_id_idx" ON "activity_logs"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_action_type_idx" ON "activity_logs"("action_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_home_id_idx" ON "products"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_is_on_shopping_list_idx" ON "products"("is_on_shopping_list");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_instances_product_id_idx" ON "product_instances"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_instances_home_id_idx" ON "product_instances"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_instances_status_idx" ON "product_instances"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_instances_expiry_date_idx" ON "product_instances"("expiry_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chores_home_id_idx" ON "chores"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chores_assigned_to_user_id_idx" ON "chores"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chores_frequency_idx" ON "chores"("frequency");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chores_is_active_idx" ON "chores"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chore_completions_chore_id_idx" ON "chore_completions"("chore_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chore_completions_child_user_id_idx" ON "chore_completions"("child_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chore_completions_validated_by_user_id_idx" ON "chore_completions"("validated_by_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chore_completions_status_idx" ON "chore_completions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chore_completions_completed_at_idx" ON "chore_completions"("completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_user_id_key" ON "merchants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_home_id_key" ON "merchants"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "merchants_category_idx" ON "merchants"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "merchants_subscription_tier_idx" ON "merchants"("subscription_tier");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "merchants_is_verified_idx" ON "merchants"("is_verified");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "merchants_is_active_idx" ON "merchants"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_merchant_id_idx" ON "promos"("merchant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_category_idx" ON "promos"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_source_idx" ON "promos"("source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_valid_from_idx" ON "promos"("valid_from");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_valid_until_idx" ON "promos"("valid_until");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promos_is_flash_sale_idx" ON "promos"("is_flash_sale");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promo_redemptions_promo_id_idx" ON "promo_redemptions"("promo_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promo_redemptions_user_id_idx" ON "promo_redemptions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promo_redemptions_redeemed_at_idx" ON "promo_redemptions"("redeemed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scraping_jobs_status_idx" ON "scraping_jobs"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scraping_jobs_started_at_idx" ON "scraping_jobs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_category_idx" ON "professionals"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_subcategory_idx" ON "professionals"("subcategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_subscription_status_idx" ON "professionals"("subscription_status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_is_verified_idx" ON "professionals"("is_verified");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_is_active_idx" ON "professionals"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "professionals_is_urgent_available_idx" ON "professionals"("is_urgent_available");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "services_professional_id_idx" ON "services"("professional_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "services_is_active_idx" ON "services"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "services_is_urgent_idx" ON "services"("is_urgent");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_home_id_idx" ON "service_requests"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_professional_id_idx" ON "service_requests"("professional_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_service_id_idx" ON "service_requests"("service_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_qr_code_id_idx" ON "service_requests"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_status_idx" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_urgency_level_idx" ON "service_requests"("urgency_level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requests_created_at_idx" ON "service_requests"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reviews_service_request_id_idx" ON "reviews"("service_request_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reviews_professional_id_idx" ON "reviews"("professional_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reviews_rating_idx" ON "reviews"("rating");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_qr_codes_qr_code_id_key" ON "emergency_qr_codes"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emergency_qr_codes_emergency_category_idx" ON "emergency_qr_codes"("emergency_category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emergency_qr_codes_is_active_idx" ON "emergency_qr_codes"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_subscriber_id_idx" ON "subscriptions"("subscriber_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_subscriber_type_idx" ON "subscriptions"("subscriber_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_payer_id_idx" ON "transactions"("payer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_receiver_id_idx" ON "transactions"("receiver_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_stripe_payment_id_idx" ON "transactions"("stripe_payment_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "flash_sales_promo_id_idx" ON "flash_sales"("promo_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "flash_sales_merchant_id_idx" ON "flash_sales"("merchant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "flash_sales_status_idx" ON "flash_sales"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "flash_sales_starts_at_idx" ON "flash_sales"("starts_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "flash_sales_ends_at_idx" ON "flash_sales"("ends_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_merchant_id_idx" ON "coupons"("merchant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_user_id_idx" ON "coupons"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_promo_id_idx" ON "coupons"("promo_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_flash_sale_id_idx" ON "coupons"("flash_sale_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupons_status_idx" ON "coupons"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupon_scans_coupon_id_idx" ON "coupon_scans"("coupon_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupon_scans_merchant_id_idx" ON "coupon_scans"("merchant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupon_scans_scanned_by_user_id_idx" ON "coupon_scans"("scanned_by_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coupon_scans_created_at_idx" ON "coupon_scans"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_service_request_id_idx" ON "chat_messages"("service_request_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_is_read_idx" ON "chat_messages"("is_read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "merchant_photos_merchant_id_idx" ON "merchant_photos"("merchant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scan_logs_qr_code_id_idx" ON "scan_logs"("qr_code_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scan_logs_home_id_idx" ON "scan_logs"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scan_logs_created_at_idx" ON "scan_logs"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhooks_home_id_idx" ON "webhooks"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhooks_is_active_idx" ON "webhooks"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_automations_home_id_idx" ON "home_automations"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_automations_provider_idx" ON "home_automations"("provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "home_automations_is_active_idx" ON "home_automations"("is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voice_messages_home_id_idx" ON "voice_messages"("home_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voice_messages_sender_type_idx" ON "voice_messages"("sender_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voice_messages_is_read_idx" ON "voice_messages"("is_read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "voice_messages_created_at_idx" ON "voice_messages"("created_at");
