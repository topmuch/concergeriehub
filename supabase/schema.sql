-- ==============================================================
-- QR DOMOTIK - SCHEMA SQL SUPABASE COMPLET (V1 + V2 + V3)
-- Version: 1.0.0
-- Description: Schéma complet pour la plateforme SaaS QR Domotik
-- Base: PostgreSQL 15+ avec PostGIS, Supabase Auth
-- ==============================================================

-- ==============================================================
-- EXTENSIONS
-- ==============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ==============================================================
-- FONCTIONS UTILITAIRES
-- ==============================================================

-- Trigger: mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: mise à jour automatique de timestamps
CREATE OR REPLACE FUNCTION set_created_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS NULL THEN
        NEW.created_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================
-- TABLE 1: users
-- Remarque: Supabase gère l'auth via auth.users, cette table étend les métadonnées
-- ==============================================================
CREATE TABLE public.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

COMMENT ON TABLE public.users IS 'Utilisateurs de la plateforme QR Domotik';
COMMENT ON COLUMN public.users.role IS 'Rôle: user ou superadmin';

-- ==============================================================
-- TABLE 2: profiles
-- ==============================================================
CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    avatar_url      TEXT,
    phone           VARCHAR(30),
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_profiles_user_id UNIQUE (user_id)
);

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);

COMMENT ON TABLE public.profiles IS 'Profils détaillés des utilisateurs';

-- ==============================================================
-- TABLE 3: homes
-- ==============================================================
CREATE TABLE public.homes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    location        GEOGRAPHY(POINT, 4326),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER homes_updated_at
    BEFORE UPDATE ON public.homes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_homes_owner_id ON public.homes(owner_id);
CREATE INDEX idx_homes_is_active ON public.homes(is_active);
CREATE INDEX idx_homes_location ON public.homes USING GIST(location);

COMMENT ON TABLE public.homes IS 'Maisons / foyers gérés par les utilisateurs';

-- ==============================================================
-- TABLE 4: home_members
-- ==============================================================
CREATE TABLE public.home_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id         UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'child')),
    nickname        VARCHAR(100),
    points          INTEGER NOT NULL DEFAULT 0,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_home_members UNIQUE (home_id, user_id)
);

CREATE INDEX idx_home_members_home_id ON public.home_members(home_id);
CREATE INDEX idx_home_members_user_id ON public.home_members(user_id);
CREATE INDEX idx_home_members_role ON public.home_members(role);

COMMENT ON TABLE public.home_members IS 'Membres d\'un foyer avec rôles et système de points';
COMMENT ON COLUMN public.home_members.points IS 'Points gagnés par les enfants via les corvées';

-- ==============================================================
-- TABLE 5: rooms
-- ==============================================================
CREATE TABLE public.rooms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id         UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    icon            VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_home_id ON public.rooms(home_id);

COMMENT ON TABLE public.rooms IS 'Pièces d\'une maison';

-- ==============================================================
-- TABLE 6: qr_codes (Dynamiques - V1)
-- ==============================================================
CREATE TABLE public.qr_codes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id         UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    room_id         UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(100) NOT NULL,
    public_slug     VARCHAR(255) UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_private      BOOLEAN NOT NULL DEFAULT false,
    pin_code        VARCHAR(10),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER qr_codes_updated_at
    BEFORE UPDATE ON public.qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_qr_codes_home_id ON public.qr_codes(home_id);
CREATE INDEX idx_qr_codes_room_id ON public.qr_codes(room_id);
CREATE INDEX idx_qr_codes_public_slug ON public.qr_codes(public_slug);
CREATE INDEX idx_qr_codes_type ON public.qr_codes(type);
CREATE INDEX idx_qr_codes_is_active ON public.qr_codes(is_active);

COMMENT ON TABLE public.qr_codes IS 'QR codes dynamiques liés à une maison et un module';
COMMENT ON COLUMN public.qr_codes.public_slug IS 'Slug public unique pour l\'accès via URL /r/[slug]';
COMMENT ON COLUMN public.qr_codes.type IS 'Type de module: wifi, guestbook, doorbell, shopping_list, etc.';

-- ==============================================================
-- TABLE 7: qr_contents
-- ==============================================================
CREATE TABLE public.qr_contents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id      UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    content_json    JSONB NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_qr_contents_qr_code_id UNIQUE (qr_code_id)
);

CREATE TRIGGER qr_contents_updated_at
    BEFORE UPDATE ON public.qr_contents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.qr_contents IS 'Contenu dynamique de chaque QR code (JSONB flexible)';

-- ==============================================================
-- TABLE 8: qr_batches
-- ==============================================================
CREATE TABLE public.qr_batches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quantity        INTEGER NOT NULL CHECK (quantity IN (10, 15, 20)),
    design_config   JSONB NOT NULL DEFAULT '{}',
    created_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_batches_created_by ON public.qr_batches(created_by);

COMMENT ON TABLE public.qr_batches IS 'Lots de QR codes physiques générés par les admins';
COMMENT ON COLUMN public.qr_batches.quantity IS 'Nombre de QR codes dans le lot (10, 15 ou 20)';

-- ==============================================================
-- TABLE 9: physical_qr_codes
-- ==============================================================
CREATE TABLE public.physical_qr_codes (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id                UUID NOT NULL REFERENCES public.qr_batches(id) ON DELETE CASCADE,
    activation_code         VARCHAR(11) NOT NULL UNIQUE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'inactive' 
                            CHECK (status IN ('inactive', 'active', 'lost', 'cancelled')),
    activated_by_user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    activated_at            TIMESTAMPTZ,
    dynamic_qr_code_id      UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL,
    design_config           JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_physical_qr_codes_batch_id ON public.physical_qr_codes(batch_id);
CREATE INDEX idx_physical_qr_codes_activation_code ON public.physical_qr_codes(activation_code);
CREATE INDEX idx_physical_qr_codes_status ON public.physical_qr_codes(status);
CREATE INDEX idx_physical_qr_codes_activated_by ON public.physical_qr_codes(activated_by_user_id);
CREATE INDEX idx_physical_qr_codes_dynamic_qr_code_id ON public.physical_qr_codes(dynamic_qr_code_id);

COMMENT ON TABLE public.physical_qr_codes IS 'QR codes physiques avec code d\'activation à 11 caractères';
COMMENT ON COLUMN public.physical_qr_codes.activation_code IS 'Code unique imprimé sur le QR physique (ex: QRD-A1B2C3D4E5)';

-- ==============================================================
-- TABLE 10: activation_logs
-- ==============================================================
CREATE TABLE public.activation_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    physical_qr_code_id UUID NOT NULL REFERENCES public.physical_qr_codes(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action              VARCHAR(20) NOT NULL CHECK (action IN ('activated', 'deactivated', 'marked_lost')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activation_logs_physical_qr_code_id ON public.activation_logs(physical_qr_code_id);
CREATE INDEX idx_activation_logs_user_id ON public.activation_logs(user_id);
CREATE INDEX idx_activation_logs_action ON public.activation_logs(action);

COMMENT ON TABLE public.activation_logs IS 'Journal de toutes les activations/désactivations de QR physiques';

-- ==============================================================
-- TABLE 11: guestbook_entries (Module V1)
-- ==============================================================
CREATE TABLE public.guestbook_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id      UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    guest_name      VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guestbook_entries_qr_code_id ON public.guestbook_entries(qr_code_id);
CREATE INDEX idx_guestbook_entries_created_at ON public.guestbook_entries(created_at);

COMMENT ON TABLE public.guestbook_entries IS 'Module Livre d\'or - entrées des visiteurs';

-- ==============================================================
-- TABLE 12: activity_logs (Module V2)
-- ==============================================================
CREATE TABLE public.activity_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id         UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    qr_code_id      UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action_type     VARCHAR(100) NOT NULL,
    details_json    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_home_id ON public.activity_logs(home_id);
CREATE INDEX idx_activity_logs_qr_code_id ON public.activity_logs(qr_code_id);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at);

COMMENT ON TABLE public.activity_logs IS 'Journal d\'activité global pour le dashboard';

-- ==============================================================
-- TABLE 13: products (Module V2 - Gestion de stock)
-- ==============================================================
CREATE TABLE public.products (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id                 UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    name                    VARCHAR(255) NOT NULL,
    category                VARCHAR(100),
    min_stock_threshold     INTEGER NOT NULL DEFAULT 1,
    current_stock           INTEGER NOT NULL DEFAULT 0,
    is_on_shopping_list     BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_products_home_id ON public.products(home_id);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_is_on_shopping_list ON public.products(is_on_shopping_list);

COMMENT ON TABLE public.products IS 'Produits du foyer avec gestion de stock';

-- ==============================================================
-- TABLE 14: product_instances
-- ==============================================================
CREATE TABLE public.product_instances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    home_id         UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    purchase_date   DATE,
    expiry_date     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'fresh' 
                    CHECK (status IN ('fresh', 'warning', 'critical', 'expired', 'consumed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_instances_product_id ON public.product_instances(product_id);
CREATE INDEX idx_product_instances_home_id ON public.product_instances(home_id);
CREATE INDEX idx_product_instances_status ON public.product_instances(status);
CREATE INDEX idx_product_instances_expiry_date ON public.product_instances(expiry_date);

COMMENT ON TABLE public.product_instances IS 'Instances individuelles de produits avec dates de péremption';

-- ==============================================================
-- TABLE 15: chores (Module V2 - Corvées)
-- ==============================================================
CREATE TABLE public.chores (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id             UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    points_value        INTEGER NOT NULL DEFAULT 10,
    frequency           VARCHAR(20) NOT NULL DEFAULT 'once' CHECK (frequency IN ('daily', 'weekly', 'once')),
    assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chores_home_id ON public.chores(home_id);
CREATE INDEX idx_chores_assigned_to ON public.chores(assigned_to_user_id);
CREATE INDEX idx_chores_frequency ON public.chores(frequency);
CREATE INDEX idx_chores_is_active ON public.chores(is_active);

COMMENT ON TABLE public.chores IS 'Corvées avec système de points pour enfants';

-- ==============================================================
-- TABLE 16: chore_completions
-- ==============================================================
CREATE TABLE public.chore_completions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chore_id            UUID NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
    child_user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    validated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    points_earned       INTEGER NOT NULL DEFAULT 0,
    completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at        TIMESTAMPTZ,
    status              VARCHAR(30) NOT NULL DEFAULT 'pending_validation' 
                        CHECK (status IN ('pending_validation', 'validated', 'rejected'))
);

CREATE INDEX idx_chore_completions_chore_id ON public.chore_completions(chore_id);
CREATE INDEX idx_chore_completions_child_user_id ON public.chore_completions(child_user_id);
CREATE INDEX idx_chore_completions_validated_by ON public.chore_completions(validated_by_user_id);
CREATE INDEX idx_chore_completions_status ON public.chore_completions(status);
CREATE INDEX idx_chore_completions_completed_at ON public.chore_completions(completed_at);

COMMENT ON TABLE public.chore_completions IS 'Complétions de corvées avec validation parentale';

-- ==============================================================
-- TABLE 17: push_subscriptions (Module V2 - Notifications)
-- ==============================================================
CREATE TABLE public.push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL,
    p256dh_key      TEXT NOT NULL,
    auth_key        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

COMMENT ON TABLE public.push_subscriptions IS 'Abonnements push (Web Push API) pour notifications';

-- ==============================================================
-- TABLE 18: merchants (Module V3 - Marketplace)
-- ==============================================================
CREATE TABLE public.merchants (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    home_id                     UUID REFERENCES public.homes(id) ON DELETE SET NULL,
    name                        VARCHAR(255) NOT NULL,
    category                    VARCHAR(100),
    description                 TEXT,
    address                     TEXT,
    location                    GEOGRAPHY(POINT, 4326),
    phone                       VARCHAR(30),
    website                     TEXT,
    opening_hours               JSONB NOT NULL DEFAULT '{}',
    logo_url                    TEXT,
    subscription_tier           VARCHAR(20) NOT NULL DEFAULT 'free' 
                                CHECK (subscription_tier IN ('free', 'premium', 'featured')),
    subscription_expires_at     TIMESTAMPTZ,
    stripe_customer_id          VARCHAR(255),
    is_verified                 BOOLEAN NOT NULL DEFAULT false,
    rating_avg                  DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    total_reviews               INTEGER NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER merchants_updated_at
    BEFORE UPDATE ON public.merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_merchants_user_id ON public.merchants(user_id);
CREATE INDEX idx_merchants_home_id ON public.merchants(home_id);
CREATE INDEX idx_merchants_category ON public.merchants(category);
CREATE INDEX idx_merchants_subscription_tier ON public.merchants(subscription_tier);
CREATE INDEX idx_merchants_is_verified ON public.merchants(is_verified);
CREATE INDEX idx_merchants_is_active ON public.merchants(is_active);
CREATE INDEX idx_merchants_location ON public.merchants USING GIST (location);
CREATE INDEX idx_merchants_rating ON public.merchants(rating_avg DESC);

COMMENT ON TABLE public.merchants IS 'Commerçants locaux du quartier (Marketplace V3)';
COMMENT ON COLUMN public.merchants.location IS 'Coordonnées GPS PostGIS (SRID 4326)';

-- ==============================================================
-- TABLE 19: promos
-- ==============================================================
CREATE TABLE public.promos (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id                 UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
    source                      VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'scraped')),
    title                       VARCHAR(500) NOT NULL,
    description                 TEXT,
    image_url                   TEXT,
    original_price              DECIMAL(10,2),
    promo_price                 DECIMAL(10,2),
    valid_from                  TIMESTAMPTZ,
    valid_until                 TIMESTAMPTZ,
    keywords                    TEXT[],
    category                    VARCHAR(100),
    is_flash_sale               BOOLEAN NOT NULL DEFAULT false,
    flash_sale_triggered_at     TIMESTAMPTZ,
    flash_sale_cost             DECIMAL(10,2),
    views_count                 INTEGER NOT NULL DEFAULT 0,
    redemptions_count           INTEGER NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promos_merchant_id ON public.promos(merchant_id);
CREATE INDEX idx_promos_category ON public.promos(category);
CREATE INDEX idx_promos_source ON public.promos(source);
CREATE INDEX idx_promos_valid_from ON public.promos(valid_from);
CREATE INDEX idx_promos_valid_until ON public.promos(valid_until);
CREATE INDEX idx_promos_is_flash_sale ON public.promos(is_flash_sale);
CREATE INDEX idx_promos_keywords ON public.promos USING GIN (keywords);

COMMENT ON TABLE public.promos IS 'Promotions et offres des commerçants';
COMMENT ON COLUMN public.promos.keywords IS 'Mots-clés pour recherche textuelle (index GIN)';

-- ==============================================================
-- TABLE 20: promo_redemptions
-- ==============================================================
CREATE TABLE public.promo_redemptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id            UUID NOT NULL REFERENCES public.promos(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    redeemed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commission_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

CREATE INDEX idx_promo_redemptions_promo_id ON public.promo_redemptions(promo_id);
CREATE INDEX idx_promo_redemptions_user_id ON public.promo_redemptions(user_id);
CREATE INDEX idx_promo_redemptions_redeemed_at ON public.promo_redemptions(redeemed_at);

COMMENT ON TABLE public.promo_redemptions IS 'Utilisations de promotions avec commission';

-- ==============================================================
-- TABLE 21: scraping_jobs
-- ==============================================================
CREATE TABLE public.scraping_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source              VARCHAR(255) NOT NULL,
    store_location      TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'running' 
                        CHECK (status IN ('running', 'success', 'failed')),
    products_scraped    INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at         TIMESTAMPTZ
);

CREATE INDEX idx_scraping_jobs_status ON public.scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_started_at ON public.scraping_jobs(started_at);

COMMENT ON TABLE public.scraping_jobs IS 'Jobs de scraping automatique des promotions';

-- ==============================================================
-- TABLE 22: professionals (Module V3 - Artisans)
-- ==============================================================
CREATE TABLE public.professionals (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_name               VARCHAR(255) NOT NULL,
    category                    VARCHAR(100) NOT NULL,
    subcategory                 VARCHAR(100),
    description                 TEXT,
    location                    GEOGRAPHY(POINT, 4326),
    service_radius_km           INTEGER NOT NULL DEFAULT 10,
    hourly_rate                 DECIMAL(10,2),
    is_urgent_available         BOOLEAN NOT NULL DEFAULT false,
    is_verified                 BOOLEAN NOT NULL DEFAULT false,
    verification_documents      JSONB NOT NULL DEFAULT '[]',
    portfolio_images            TEXT[] NOT NULL DEFAULT '{}',
    subscription_status         VARCHAR(20) NOT NULL DEFAULT 'free' 
                                CHECK (subscription_status IN ('free', 'premium', 'featured')),
    subscription_expires_at     TIMESTAMPTZ,
    stripe_customer_id          VARCHAR(255),
    rating_avg                  DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    total_reviews               INTEGER NOT NULL DEFAULT 0,
    response_time_minutes       INTEGER,
    total_jobs_completed        INTEGER NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER professionals_updated_at
    BEFORE UPDATE ON public.professionals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_professionals_user_id ON public.professionals(user_id);
CREATE INDEX idx_professionals_category ON public.professionals(category);
CREATE INDEX idx_professionals_subcategory ON public.professionals(subcategory);
CREATE INDEX idx_professionals_subscription_status ON public.professionals(subscription_status);
CREATE INDEX idx_professionals_is_verified ON public.professionals(is_verified);
CREATE INDEX idx_professionals_is_active ON public.professionals(is_active);
CREATE INDEX idx_professionals_location ON public.professionals USING GIST (location);
CREATE INDEX idx_professionals_rating ON public.professionals(rating_avg DESC);
CREATE INDEX idx_professionals_is_urgent_available ON public.professionals(is_urgent_available);

COMMENT ON TABLE public.professionals IS 'Artisans et professionnels de services';
COMMENT ON COLUMN public.professionals.location IS 'Coordonnées GPS PostGIS (SRID 4326)';

-- ==============================================================
-- TABLE 23: services
-- ==============================================================
CREATE TABLE public.services (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    professional_id     UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    base_price          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    price_unit          VARCHAR(20) NOT NULL DEFAULT 'flat_rate' 
                        CHECK (price_unit IN ('hour', 'flat_rate', 'estimate')),
    duration_minutes    INTEGER,
    is_urgent           BOOLEAN NOT NULL DEFAULT false,
    is_active           BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_services_professional_id ON public.services(professional_id);
CREATE INDEX idx_services_is_active ON public.services(is_active);
CREATE INDEX idx_services_is_urgent ON public.services(is_urgent);

COMMENT ON TABLE public.services IS 'Services proposés par les professionnels';

-- ==============================================================
-- TABLE 24: service_requests
-- ==============================================================
CREATE TABLE public.service_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id             UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    professional_id     UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    service_id          UUID REFERENCES public.services(id) ON DELETE SET NULL,
    qr_code_id          UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' 
                        CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed')),
    description         TEXT,
    photos              TEXT[] NOT NULL DEFAULT '{}',
    preferred_date      TIMESTAMPTZ,
    urgency_level       VARCHAR(20) NOT NULL DEFAULT 'normal' 
                        CHECK (urgency_level IN ('normal', 'urgent', 'emergency')),
    address             TEXT,
    final_price         DECIMAL(10,2),
    commission_amount   DECIMAL(10,2),
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_requests_home_id ON public.service_requests(home_id);
CREATE INDEX idx_service_requests_professional_id ON public.service_requests(professional_id);
CREATE INDEX idx_service_requests_service_id ON public.service_requests(service_id);
CREATE INDEX idx_service_requests_qr_code_id ON public.service_requests(qr_code_id);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
CREATE INDEX idx_service_requests_urgency_level ON public.service_requests(urgency_level);
CREATE INDEX idx_service_requests_created_at ON public.service_requests(created_at);

COMMENT ON TABLE public.service_requests IS 'Demandes de services entre foyers et professionnels';

-- ==============================================================
-- TABLE 25: reviews
-- ==============================================================
CREATE TABLE public.reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_request_id  UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    professional_id     UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating              INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_service_request_id ON public.reviews(service_request_id);
CREATE INDEX idx_reviews_professional_id ON public.reviews(professional_id);
CREATE INDEX idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX idx_reviews_rating ON public.reviews(rating);

COMMENT ON TABLE public.reviews IS 'Avis sur les professionnels';

-- ==============================================================
-- TABLE 26: emergency_qr_codes
-- ==============================================================
CREATE TABLE public.emergency_qr_codes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id          UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    emergency_category  VARCHAR(100) NOT NULL,
    equipment_info      JSONB NOT NULL DEFAULT '{}',
    is_active           BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_emergency_qr_codes_qr_code_id ON public.emergency_qr_codes(qr_code_id);
CREATE INDEX idx_emergency_qr_codes_emergency_category ON public.emergency_qr_codes(emergency_category);
CREATE INDEX idx_emergency_qr_codes_is_active ON public.emergency_qr_codes(is_active);

COMMENT ON TABLE public.emergency_qr_codes IS 'QR codes d\'urgence avec infos équipements';

-- ==============================================================
-- TABLE 27: subscriptions (Monétisation)
-- ==============================================================
CREATE TABLE public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscriber_id           UUID NOT NULL,
    subscriber_type         VARCHAR(20) NOT NULL CHECK (subscriber_type IN ('merchant', 'professional')),
    plan                    VARCHAR(50) NOT NULL,
    amount                  DECIMAL(10,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'EUR',
    stripe_subscription_id  VARCHAR(255),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active' 
                            CHECK (status IN ('active', 'cancelled', 'past_due')),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_subscriber_id ON public.subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_subscriber_type ON public.subscriptions(subscriber_type);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);

COMMENT ON TABLE public.subscriptions IS 'Abonnements payants (Stripe) des commerçants et artisans';

-- ==============================================================
-- TABLE 28: transactions (Monétisation)
-- ==============================================================
CREATE TABLE public.transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type                VARCHAR(20) NOT NULL CHECK (type IN ('flash_sale', 'commission', 'subscription', 'redemption')),
    payer_id            UUID,
    receiver_id         UUID,
    amount              DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'EUR',
    stripe_payment_id   VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' 
                        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    reference_id        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_payer_id ON public.transactions(payer_id);
CREATE INDEX idx_transactions_receiver_id ON public.transactions(receiver_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_stripe_payment_id ON public.transactions(stripe_payment_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);

COMMENT ON TABLE public.transactions IS 'Transactions financières de la plateforme';

-- ==============================================================
-- FONCTIONS V3: Auto-expiration des ventes flash
-- ==============================================================
CREATE OR REPLACE FUNCTION expire_flash_sales()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ends_at <= NOW() AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;
    IF NEW.starts_at <= NOW() AND NEW.status = 'scheduled' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flash_sales_auto_expire
    BEFORE UPDATE ON public.flash_sales
    FOR EACH ROW EXECUTE FUNCTION expire_flash_sales();

-- Trigger on insert too
CREATE TRIGGER flash_sales_auto_expire_insert
    BEFORE INSERT ON public.flash_sales
    FOR EACH ROW EXECUTE FUNCTION expire_flash_sales();

-- ==============================================================
-- TABLE 29: flash_sales (V3 - Ventes Flash)
-- ==============================================================
CREATE TABLE public.flash_sales (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id                UUID NOT NULL REFERENCES public.promos(id) ON DELETE CASCADE,
    merchant_id             UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    title                   VARCHAR(255) NOT NULL,
    description             TEXT,
    image_url               TEXT,
    original_price          DECIMAL(10,2),
    flash_price             DECIMAL(10,2) NOT NULL,
    geofence_radius_meters  INTEGER NOT NULL DEFAULT 500,
    starts_at               TIMESTAMPTZ NOT NULL,
    ends_at                 TIMESTAMPTZ NOT NULL,
    max_redemptions         INTEGER,
    current_redemptions     INTEGER NOT NULL DEFAULT 0,
    status                  VARCHAR(20) NOT NULL DEFAULT 'scheduled' 
                            CHECK (status IN ('scheduled', 'active', 'expired', 'cancelled')),
    cost_euros              DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    transaction_id          UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    push_sent               BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER flash_sales_updated_at
    BEFORE UPDATE ON public.flash_sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_flash_sales_promo_id ON public.flash_sales(promo_id);
CREATE INDEX idx_flash_sales_merchant_id ON public.flash_sales(merchant_id);
CREATE INDEX idx_flash_sales_status ON public.flash_sales(status);
CREATE INDEX idx_flash_sales_starts_at ON public.flash_sales(starts_at);
CREATE INDEX idx_flash_sales_ends_at ON public.flash_sales(ends_at);
CREATE INDEX idx_flash_sales_location ON public.flash_sales USING GIST(
    (SELECT location FROM public.merchants WHERE merchants.id = flash_sales.merchant_id)
);

COMMENT ON TABLE public.flash_sales IS 'Ventes flash déclenchées par les commerçants avec géorepérage';

-- ==============================================================
-- TABLE 30: coupons (V3 - Coupons numériques)
-- ==============================================================
CREATE TABLE public.coupons (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id             UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    promo_id                UUID REFERENCES public.promos(id) ON DELETE SET NULL,
    flash_sale_id           UUID REFERENCES public.flash_sales(id) ON DELETE SET NULL,
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    code                    VARCHAR(16) NOT NULL UNIQUE,
    qr_code_data            TEXT NOT NULL,
    discount_type           VARCHAR(20) NOT NULL DEFAULT 'percentage' 
                            CHECK (discount_type IN ('percentage', 'fixed', 'bogof')),
    discount_value          DECIMAL(10,2) NOT NULL,
    max_uses                INTEGER NOT NULL DEFAULT 1,
    current_uses            INTEGER NOT NULL DEFAULT 0,
    valid_from              TIMESTAMPTZ,
    valid_until             TIMESTAMPTZ,
    status                  VARCHAR(20) NOT NULL DEFAULT 'active' 
                            CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
    commission_rate         DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_merchant_id ON public.coupons(merchant_id);
CREATE INDEX idx_coupons_user_id ON public.coupons(user_id);
CREATE INDEX idx_coupons_promo_id ON public.coupons(promo_id);
CREATE INDEX idx_coupons_flash_sale_id ON public.coupons(flash_sale_id);
CREATE INDEX idx_coupons_code ON public.coupons(code);
CREATE INDEX idx_coupons_status ON public.coupons(status);

COMMENT ON TABLE public.coupons IS 'Coupons numériques avec QR code unique pour validation commerçant';

-- ==============================================================
-- TABLE 31: coupon_scans (V3 - Validation coupons)
-- ==============================================================
CREATE TABLE public.coupon_scans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id               UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    merchant_id             UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    scanned_by_user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    commission_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
    transaction_id          UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupon_scans_coupon_id ON public.coupon_scans(coupon_id);
CREATE INDEX idx_coupon_scans_merchant_id ON public.coupon_scans(merchant_id);
CREATE INDEX idx_coupon_scans_scanned_by ON public.coupon_scans(scanned_by_user_id);
CREATE INDEX idx_coupon_scans_created_at ON public.coupon_scans(created_at);

COMMENT ON TABLE public.coupon_scans IS 'Scans et validations de coupons par les commerçants';

-- ==============================================================
-- TABLE 32: chat_messages (V3 - Chat service requests)
-- ==============================================================
CREATE TABLE public.chat_messages (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_request_id      UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    sender_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_type             VARCHAR(20) NOT NULL CHECK (sender_type IN ('homeowner', 'professional')),
    content                 TEXT NOT NULL,
    message_type            VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'system')),
    attachment_url          TEXT,
    is_read                 BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_service_request_id ON public.chat_messages(service_request_id);
CREATE INDEX idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX idx_chat_messages_is_read ON public.chat_messages(is_read);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

COMMENT ON TABLE public.chat_messages IS 'Messages du chat intégré aux demandes de service';

-- ==============================================================
-- TABLE 33: notifications (V3 - Notifications push)
-- ==============================================================
CREATE TABLE public.notifications (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type                    VARCHAR(50) NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    body                    TEXT,
    data_json               JSONB NOT NULL DEFAULT '{}',
    is_read                 BOOLEAN NOT NULL DEFAULT false,
    sent_via_push           BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_type ON public.notifications(type);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);

COMMENT ON TABLE public.notifications IS 'File de notifications push et in-app';

-- ==============================================================
-- TABLE 34: merchant_photos (V3 - Galerie photos commerçant)
-- ==============================================================
CREATE TABLE public.merchant_photos (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id             UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    url                     TEXT NOT NULL,
    alt_text                VARCHAR(255),
    sort_order              INTEGER NOT NULL DEFAULT 0,
    is_cover                BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchant_photos_merchant_id ON public.merchant_photos(merchant_id);
CREATE INDEX idx_merchant_photos_sort_order ON public.merchant_photos(merchant_id, sort_order);

COMMENT ON TABLE public.merchant_photos IS 'Photos de la galerie commerçant (boutique, produits, vitrine)';


-- ==============================================================
-- ==============================================================
-- POLITIQUES RLS (ROW LEVEL SECURITY)
-- ==============================================================
-- ==============================================================

-- ==============================================================
-- HELPER: Fonctions pour RLS
-- ==============================================================

-- Vérifie si l'utilisateur courant est superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'superadmin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Retourne les IDs des homes dont l'utilisateur est membre
CREATE OR REPLACE FUNCTION user_home_ids()
RETURNS UUID[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT home_id FROM public.home_members 
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Vérifie si l'utilisateur est membre d'un home donné
CREATE OR REPLACE FUNCTION is_home_member(p_home_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.home_members 
        WHERE home_id = p_home_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Vérifie si l'utilisateur est owner/admin d'un home donné
CREATE OR REPLACE FUNCTION is_home_admin(p_home_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.home_members 
        WHERE home_id = p_home_id AND user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================
-- ENABLE RLS SUR TOUTES LES TABLES
-- ==============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guestbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_photos ENABLE ROW LEVEL SECURITY;

-- ==============================================================
-- RLS: users - Un user voit son profil, superadmin voit tout
-- ==============================================================
CREATE POLICY "users_self_read" ON public.users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_self_update" ON public.users
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "users_superadmin_all" ON public.users
    FOR ALL USING (is_superadmin());

CREATE POLICY "users_self_insert" ON public.users
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================
-- RLS: profiles - User voit son profil, superadmin voit tout
-- ==============================================================
CREATE POLICY "profiles_self_read" ON public.profiles
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "profiles_self_update" ON public.profiles
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "profiles_self_insert" ON public.profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_superadmin_all" ON public.profiles
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: homes - Owner et membres voient leurs homes
-- ==============================================================
CREATE POLICY "homes_members_read" ON public.homes
    FOR SELECT USING (
        owner_id = auth.uid() 
        OR is_home_member(id)
        OR is_superadmin()
    );

CREATE POLICY "homes_owner_insert" ON public.homes
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "homes_admin_update" ON public.homes
    FOR UPDATE USING (
        owner_id = auth.uid() 
        OR is_home_admin(id)
        OR is_superadmin()
    );

CREATE POLICY "homes_owner_delete" ON public.homes
    FOR DELETE USING (owner_id = auth.uid() OR is_superadmin());

-- ==============================================================
-- RLS: home_members - Membres voient les membres de leurs homes
-- ==============================================================
CREATE POLICY "home_members_read" ON public.home_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR is_home_member(home_id)
        OR is_superadmin()
    );

CREATE POLICY "home_members_admin_insert" ON public.home_members
    FOR INSERT WITH CHECK (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "home_members_admin_update" ON public.home_members
    FOR UPDATE USING (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "home_members_admin_delete" ON public.home_members
    FOR DELETE USING (is_home_admin(home_id) OR is_superadmin());

-- ==============================================================
-- RLS: rooms - Membres du home voient les pièces
-- ==============================================================
CREATE POLICY "rooms_members_read" ON public.rooms
    FOR SELECT USING (is_home_member(home_id) OR is_superadmin());

CREATE POLICY "rooms_admin_insert" ON public.rooms
    FOR INSERT WITH CHECK (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "rooms_admin_update" ON public.rooms
    FOR UPDATE USING (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "rooms_admin_delete" ON public.rooms
    FOR DELETE USING (is_home_admin(home_id) OR is_superadmin());

-- ==============================================================
-- RLS: qr_codes - Membres voient les QR de leurs homes
-- (Les pages publiques /r/[slug] utilisent un service key côté serveur)
-- ==============================================================
CREATE POLICY "qr_codes_members_read" ON public.qr_codes
    FOR SELECT USING (
        is_home_member(home_id) 
        OR is_superadmin()
        OR (NOT is_private AND is_active)  -- QR publics actifs visibles par tous
    );

CREATE POLICY "qr_codes_admin_insert" ON public.qr_codes
    FOR INSERT WITH CHECK (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "qr_codes_admin_update" ON public.qr_codes
    FOR UPDATE USING (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "qr_codes_admin_delete" ON public.qr_codes
    FOR DELETE USING (is_home_admin(home_id) OR is_superadmin());

-- ==============================================================
-- RLS: qr_contents - Lié aux qr_codes
-- ==============================================================
CREATE POLICY "qr_contents_members_read" ON public.qr_contents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = qr_contents.qr_code_id
            AND (is_home_member(qc.home_id) OR is_superadmin() OR (NOT qc.is_private AND qc.is_active))
        )
    );

CREATE POLICY "qr_contents_admin_insert" ON public.qr_contents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = qr_contents.qr_code_id
            AND (is_home_admin(qc.home_id) OR is_superadmin())
        )
    );

CREATE POLICY "qr_contents_admin_update" ON public.qr_contents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = qr_contents.qr_code_id
            AND (is_home_admin(qc.home_id) OR is_superadmin())
        )
    );

CREATE POLICY "qr_contents_admin_delete" ON public.qr_contents
    FOR DELETE USING (is_superadmin());

-- ==============================================================
-- RLS: qr_batches - Superadmin uniquement (génération de lots)
-- ==============================================================
CREATE POLICY "qr_batches_superadmin_all" ON public.qr_batches
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: physical_qr_codes - Superadmin gère, user voit les siens
-- ==============================================================
CREATE POLICY "physical_qr_superadmin_all" ON public.physical_qr_codes
    FOR ALL USING (is_superadmin());

CREATE POLICY "physical_qr_user_read" ON public.physical_qr_codes
    FOR SELECT USING (activated_by_user_id = auth.uid());

CREATE POLICY "physical_qr_user_update" ON public.physical_qr_codes
    FOR UPDATE USING (activated_by_user_id = auth.uid());

-- ==============================================================
-- RLS: activation_logs - User voit ses propres activations
-- ==============================================================
CREATE POLICY "activation_logs_superadmin_all" ON public.activation_logs
    FOR ALL USING (is_superadmin());

CREATE POLICY "activation_logs_user_read" ON public.activation_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "activation_logs_user_insert" ON public.activation_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================
-- RLS: guestbook_entries - Membres du home + invités (public)
-- ==============================================================
CREATE POLICY "guestbook_members_read" ON public.guestbook_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = guestbook_entries.qr_code_id
            AND (is_home_member(qc.home_id) OR is_superadmin() OR (NOT qc.is_private AND qc.is_active))
        )
    );

CREATE POLICY "guestbook_public_insert" ON public.guestbook_entries
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = guestbook_entries.qr_code_id
            AND (NOT qc.is_private AND qc.is_active)
        )
    );

CREATE POLICY "guestbook_admin_delete" ON public.guestbook_entries
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = guestbook_entries.qr_code_id
            AND (is_home_admin(qc.home_id) OR is_superadmin())
        )
    );

-- ==============================================================
-- RLS: activity_logs - Membres du home
-- ==============================================================
CREATE POLICY "activity_logs_members_read" ON public.activity_logs
    FOR SELECT USING (
        is_home_member(home_id) OR is_superadmin()
    );

CREATE POLICY "activity_logs_members_insert" ON public.activity_logs
    FOR INSERT WITH CHECK (
        is_home_member(home_id) OR is_superadmin()
    );

-- ==============================================================
-- RLS: products - Membres du home
-- ==============================================================
CREATE POLICY "products_members_all" ON public.products
    FOR ALL USING (
        is_home_member(home_id) OR is_superadmin()
    );

-- ==============================================================
-- RLS: product_instances - Membres du home
-- ==============================================================
CREATE POLICY "product_instances_members_all" ON public.product_instances
    FOR ALL USING (
        is_home_member(home_id) OR is_superadmin()
    );

-- ==============================================================
-- RLS: chores - Admin/parent voient toutes les corvées du home
-- ENFANTS: ne voient que les corvées qui leur sont assignées
-- ==============================================================
CREATE POLICY "chores_admin_read" ON public.chores
    FOR SELECT USING (
        is_home_admin(home_id) 
        OR is_superadmin()
        OR assigned_to_user_id = auth.uid()  -- enfants voient les leurs
    );

CREATE POLICY "chores_admin_insert" ON public.chores
    FOR INSERT WITH CHECK (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "chores_admin_update" ON public.chores
    FOR UPDATE USING (is_home_admin(home_id) OR is_superadmin());

CREATE POLICY "chores_admin_delete" ON public.chores
    FOR DELETE USING (is_home_admin(home_id) OR is_superadmin());

-- ==============================================================
-- RLS: chore_completions - Enfants voient les leurs, parents/admins valident
-- ==============================================================
CREATE POLICY "chore_completions_child_read" ON public.chore_completions
    FOR SELECT USING (
        child_user_id = auth.uid()  -- l'enfant voit ses complétions
        OR is_superadmin()
        OR EXISTS (
            SELECT 1 FROM public.chores c
            WHERE c.id = chore_completions.chore_id
            AND is_home_admin(c.home_id)
        )
    );

CREATE POLICY "chore_completions_child_insert" ON public.chore_completions
    FOR INSERT WITH CHECK (child_user_id = auth.uid());

CREATE POLICY "chore_completions_parent_update" ON public.chore_completions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.chores c
            WHERE c.id = chore_completions.chore_id
            AND (is_home_admin(c.home_id) OR is_superadmin())
        )
    );

-- ==============================================================
-- RLS: push_subscriptions - User gère ses propres abonnements
-- ==============================================================
CREATE POLICY "push_subscriptions_user_all" ON public.push_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- ==============================================================
-- RLS: merchants - Public read, merchant gère le sien
-- ==============================================================
CREATE POLICY "merchants_public_read" ON public.merchants
    FOR SELECT USING (is_active OR is_superadmin());

CREATE POLICY "merchants_own_insert" ON public.merchants
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "merchants_own_update" ON public.merchants
    FOR UPDATE USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "merchants_superadmin_all" ON public.merchants
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: promos - Public read, merchant gère les siennes
-- ==============================================================
CREATE POLICY "promos_public_read" ON public.promos
    FOR SELECT USING (true);  -- Tout le monde voit les promos actives

CREATE POLICY "promos_merchant_insert" ON public.promos
    FOR INSERT WITH CHECK (
        merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "promos_merchant_update" ON public.promos
    FOR UPDATE USING (
        merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "promos_merchant_delete" ON public.promos
    FOR DELETE USING (
        merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid())
        OR is_superadmin()
    );

-- ==============================================================
-- RLS: promo_redemptions - User voit les siennes, admin voit tout
-- ==============================================================
CREATE POLICY "promo_redemptions_user_read" ON public.promo_redemptions
    FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "promo_redemptions_user_insert" ON public.promo_redemptions
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ==============================================================
-- RLS: scraping_jobs - Superadmin uniquement
-- ==============================================================
CREATE POLICY "scraping_jobs_superadmin_all" ON public.scraping_jobs
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: professionals - Public read, pro gère le sien
-- ==============================================================
CREATE POLICY "professionals_public_read" ON public.professionals
    FOR SELECT USING (is_active OR is_superadmin());

CREATE POLICY "professionals_own_insert" ON public.professionals
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "professionals_own_update" ON public.professionals
    FOR UPDATE USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "professionals_superadmin_all" ON public.professionals
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: services - Lié aux professionnels
-- ==============================================================
CREATE POLICY "services_public_read" ON public.services
    FOR SELECT USING (is_active);

CREATE POLICY "services_pro_insert" ON public.services
    FOR INSERT WITH CHECK (
        professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "services_pro_update" ON public.services
    FOR UPDATE USING (
        professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "services_pro_delete" ON public.services
    FOR DELETE USING (
        professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        OR is_superadmin()
    );

-- ==============================================================
-- RLS: service_requests - Home member + professional voient les leurs
-- ==============================================================
CREATE POLICY "service_requests_member_read" ON public.service_requests
    FOR SELECT USING (
        is_home_member(home_id)
        OR professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "service_requests_member_insert" ON public.service_requests
    FOR INSERT WITH CHECK (is_home_member(home_id));

CREATE POLICY "service_requests_member_update" ON public.service_requests
    FOR UPDATE USING (
        is_home_member(home_id)
        OR professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        OR is_superadmin()
    );

-- ==============================================================
-- RLS: reviews - Public read, auteur et pro voient les leurs
-- ==============================================================
CREATE POLICY "reviews_public_read" ON public.reviews
    FOR SELECT USING (true);

CREATE POLICY "reviews_user_insert" ON public.reviews
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reviews_user_update" ON public.reviews
    FOR UPDATE USING (user_id = auth.uid() OR is_superadmin());

-- ==============================================================
-- RLS: emergency_qr_codes - Membres du home
-- ==============================================================
CREATE POLICY "emergency_qr_members_read" ON public.emergency_qr_codes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = emergency_qr_codes.qr_code_id
            AND (is_home_member(qc.home_id) OR is_superadmin())
        )
    );

CREATE POLICY "emergency_qr_admin_insert" ON public.emergency_qr_codes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = emergency_qr_codes.qr_code_id
            AND (is_home_admin(qc.home_id) OR is_superadmin())
        )
    );

CREATE POLICY "emergency_qr_admin_update" ON public.emergency_qr_codes
    FOR UPDATE USING (is_superadmin());

CREATE POLICY "emergency_qr_admin_delete" ON public.emergency_qr_codes
    FOR DELETE USING (is_superadmin());

-- ==============================================================
-- RLS: subscriptions - Subscriber + superadmin
-- ==============================================================
CREATE POLICY "subscriptions_subscriber_read" ON public.subscriptions
    FOR SELECT USING (
        subscriber_id = auth.uid() OR is_superadmin()
    );

CREATE POLICY "subscriptions_subscriber_insert" ON public.subscriptions
    FOR INSERT WITH CHECK (subscriber_id = auth.uid() OR is_superadmin());

CREATE POLICY "subscriptions_superadmin_all" ON public.subscriptions
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- RLS: transactions - Superadmin uniquement
-- ==============================================================
CREATE POLICY "transactions_superadmin_all" ON public.transactions
    FOR ALL USING (is_superadmin());

-- RLS: flash_sales - Public read, merchant gère les siennes
CREATE POLICY "flash_sales_public_read" ON public.flash_sales
    FOR SELECT USING (true);

CREATE POLICY "flash_sales_merchant_insert" ON public.flash_sales
    FOR INSERT WITH CHECK (
        merchant_id = (SELECT id FROM public.merchants WHERE user_id = auth.uid())
    );

CREATE POLICY "flash_sales_merchant_update" ON public.flash_sales
    FOR UPDATE USING (
        merchant_id = (SELECT id FROM public.merchants WHERE user_id = auth.uid())
    );

CREATE POLICY "flash_sales_superadmin_all" ON public.flash_sales
    FOR ALL USING (is_superadmin());

-- RLS: coupons - User voit ses coupons, merchant voit ceux de sa boutique
CREATE POLICY "coupons_user_read" ON public.coupons
    FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "coupons_auto_insert" ON public.coupons
    FOR INSERT WITH CHECK (true);

CREATE POLICY "coupons_user_update" ON public.coupons
    FOR UPDATE USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "coupons_merchant_read" ON public.coupons
    FOR SELECT USING (
        merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid())
    );

-- RLS: coupon_scans - Merchant et user voient les leurs
CREATE POLICY "coupon_scans_merchant_read" ON public.coupon_scans
    FOR SELECT USING (
        merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid())
        OR is_superadmin()
    );

CREATE POLICY "coupon_scans_auto_insert" ON public.coupon_scans
    FOR INSERT WITH CHECK (true);

-- RLS: chat_messages - Participants de la demande de service
CREATE POLICY "chat_messages_participant_read" ON public.chat_messages
    FOR SELECT USING (
        service_request_id IN (
            SELECT id FROM public.service_requests sr
            WHERE sr.home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
            OR sr.professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        )
        OR is_superadmin()
    );

CREATE POLICY "chat_messages_participant_insert" ON public.chat_messages
    FOR INSERT WITH CHECK (
        service_request_id IN (
            SELECT id FROM public.service_requests sr
            WHERE sr.home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid())
            OR sr.professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "chat_messages_participant_update" ON public.chat_messages
    FOR UPDATE USING (
        sender_id = auth.uid()
    );

-- RLS: notifications - User voit ses propres notifications
CREATE POLICY "notifications_user_read" ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_user_update" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications_auto_insert" ON public.notifications
    FOR INSERT WITH CHECK (true);

-- RLS: merchant_photos - Public read, merchant gère les siennes
CREATE POLICY "merchant_photos_public_read" ON public.merchant_photos
    FOR SELECT USING (true);

CREATE POLICY "merchant_photos_merchant_insert" ON public.merchant_photos
    FOR INSERT WITH CHECK (
        merchant_id = (SELECT id FROM public.merchants WHERE user_id = auth.uid())
    );

CREATE POLICY "merchant_photos_merchant_delete" ON public.merchant_photos
    FOR DELETE USING (
        merchant_id = (SELECT id FROM public.merchants WHERE user_id = auth.uid())
    );

CREATE POLICY "merchant_photos_superadmin_all" ON public.merchant_photos
    FOR ALL USING (is_superadmin());

-- ==============================================================
-- POLITIQUES SPÉCIALES: Pages publiques (/r/[slug])
-- Ces politiques utilisent l'anon key côté client, mais les données
-- sensibles restent protégées par is_private
-- ==============================================================

-- Les QR codes publics et actifs sont lisibles par tout le monde (anonymes inclus)
CREATE POLICY "qr_codes_public_read" ON public.qr_codes
    FOR SELECT USING (NOT is_private AND is_active);

-- Les contenus des QR publics sont lisibles par tout le monde
CREATE POLICY "qr_contents_public_read" ON public.qr_contents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes qc
            WHERE qc.id = qr_contents.qr_code_id
            AND NOT qc.is_private AND qc.is_active
        )
    );

-- ==============================================================
-- TRIGGERS SUPPLÉMENTAIRES
-- ==============================================================

-- Met à jour rating_avg et total_reviews sur les merchants quand un avis est ajouté
CREATE OR REPLACE FUNCTION update_merchant_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.merchants 
        SET rating_avg = (
            SELECT AVG(r.rating) FROM public.reviews r WHERE r.professional_id = NEW.professional_id
        ),
        total_reviews = (
            SELECT COUNT(*) FROM public.reviews r WHERE r.professional_id = NEW.professional_id
        )
        WHERE id = NEW.professional_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.merchants 
        SET rating_avg = (
            SELECT AVG(r.rating) FROM public.reviews r WHERE r.professional_id = NEW.professional_id
        ),
        total_reviews = (
            SELECT COUNT(*) FROM public.reviews r WHERE r.professional_id = NEW.professional_id
        )
        WHERE id = NEW.professional_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.merchants 
        SET rating_avg = (
            SELECT AVG(r.rating) FROM public.reviews r WHERE r.professional_id = OLD.professional_id
        ),
        total_reviews = (
            SELECT COUNT(*) FROM public.reviews r WHERE r.professional_id = OLD.professional_id
        )
        WHERE id = OLD.professional_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_professional_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION update_merchant_rating();

-- Met à jour les points du membre quand une corvée est validée
CREATE OR REPLACE FUNCTION update_child_points()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'validated' AND (OLD.status IS NULL OR OLD.status != 'validated') THEN
        UPDATE public.home_members 
        SET points = points + NEW.points_earned
        WHERE user_id = NEW.child_user_id
        AND home_id = (SELECT home_id FROM public.chores WHERE id = NEW.chore_id);
    ELSIF NEW.status = 'rejected' AND OLD.status = 'validated' THEN
        UPDATE public.home_members 
        SET points = points - NEW.points_earned
        WHERE user_id = NEW.child_user_id
        AND home_id = (SELECT home_id FROM public.chores WHERE id = NEW.chore_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_child_points
    AFTER UPDATE ON public.chore_completions
    FOR EACH ROW EXECUTE FUNCTION update_child_points();

-- Met à jour le stock du produit quand une instance est ajoutée
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status NOT IN ('expired', 'consumed') THEN
        UPDATE public.products 
        SET current_stock = current_stock + 1
        WHERE id = NEW.product_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.status NOT IN ('expired', 'consumed')) AND (NEW.status IN ('expired', 'consumed')) THEN
            UPDATE public.products SET current_stock = current_stock - 1 WHERE id = NEW.product_id;
        ELSIF (OLD.status IN ('expired', 'consumed')) AND (NEW.status NOT IN ('expired', 'consumed')) THEN
            UPDATE public.products SET current_stock = current_stock + 1 WHERE id = NEW.product_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_product_stock
    AFTER INSERT OR UPDATE ON public.product_instances
    FOR EACH ROW EXECUTE FUNCTION update_product_stock();

-- Incrémente views_count quand une promo est consultée
CREATE OR REPLACE FUNCTION increment_promo_views()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.promos SET views_count = views_count + 1 WHERE id = NEW.promo_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_increment_promo_views
    AFTER INSERT ON public.promo_redemptions
    FOR EACH ROW EXECUTE FUNCTION increment_promo_views();


-- ==============================================================
-- DONNÉES DE RÉFÉRENCE (SEED DATA)
-- ==============================================================

-- Types de QR codes disponibles (référence pour l'application)
-- Ceci est un commentaire de référence, les types sont gérés côté applicatif
/*
Types de modules QR Domotik:

V1 - Modules de base:
- wifi: Partage Wi-Fi
- guestbook: Livre d'or
- doorbell: Portier virtuel
- emergency: Urgences
- note: Notes rapides
- contact: Carte de contact

V2 - Modules avancés:
- shopping_list: Liste de courses
- inventory: Inventaire produits
- chore: Corvées
- checklist: Checklists
- timer: Minuterie
- recipe: Recettes
- medication: Médicaments
- pet_info: Info animaux
- plant_care: Soins plantes
- home_manual: Manuel maison
- visitor_info: Info visiteurs
- delivery: Instructions livraison
- baby_sitter: Info babysitter
- house_rules: Règles maison
- wifi_reset: Réinitialisation Wi-Fi
- appliance_manual: Manuel appareil
- energy_monitor: Monitoring énergie
- cleaning_schedule: Planning ménage
- meal_planner: Planificateur repas
- shared_calendar: Calendrier partagé
- key_location: Localisation clés
- garage_instructions: Instructions garage
- laundry_guide: Guide lavage
- recycling_info: Info recyclage
- utility_shutoff: Coupure utilités
- first_aid: Premiers secours
- pet_sitter: Info pet-sitter
- rental_guest: Info locataire
- airbnb_guest: Info Airbnb
- emergency_contacts: Contacts d'urgence
- package_tracking: Suivi colis
- home_network: Réseau maison
- entertainment: Divertissement
- music_room: Chambre musique
- game_room: Salle de jeux
- library: Bibliothèque
- photo_gallery: Galerie photos
- family_board: Tableau famille
- announcement: Annonces
- mood_tracker: Suivi humeur
- habit_tracker: Suivi habitudes
- weather_station: Station météo
- smart_home_control: Contrôle domotique
- voice_assistant: Assistant vocal

V3 - Marketplace:
- merchant: Fiche commerçant
- service_request: Demande de service
- promo: Promotion
- flash_sale: Vente flash
- coupon: Coupon numérique
- emergency_service: Service d'urgence (QR)
- artisan_directory: Annuaire artisans
*/

-- ==============================================================
-- FIN DU SCHÉMA
-- ==============================================================
-- Résumé:
-- 34 tables créées
-- 70+ index (dont GIN pour keywords, GiST pour location PostGIS)
-- 60+ politiques RLS
-- 6 triggers métier (updated_at, rating, points, stock, flash_sales auto)
-- 5 fonctions utilitaires RLS
-- ==============================================================