-- ORDOMOTIK Seed Users (pre-hashed passwords)
-- Admin: admin@qrdomotik.roomscan.pro / QrDomotik2024!
-- Demo:  demo@qrdomotik.roomscan.pro  / Demo2024!

-- Super Admin
INSERT OR IGNORE INTO "users" ("id", "email", "full_name", "password_hash", "role", "onboarding_completed", "created_at", "updated_at")
VALUES ('admin-001', 'admin@qrdomotik.roomscan.pro', 'Administrateur ORDOMOTIK', '$2b$12$39Ym5R1gda7geP7QOrqwGuD5Jn2TXEktUbNttYDAAvjL.HikHJ79q', 'superadmin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT("email") DO UPDATE SET "password_hash"='$2b$12$39Ym5R1gda7geP7QOrqwGuD5Jn2TXEktUbNttYDAAvjL.HikHJ79q', "full_name"='Administrateur ORDOMOTIK', "role"='superadmin';

-- Demo User
INSERT OR IGNORE INTO "users" ("id", "email", "full_name", "password_hash", "role", "onboarding_completed", "created_at", "updated_at")
VALUES ('demo-001', 'demo@qrdomotik.roomscan.pro', 'Utilisateur Demo', '$2b$12$a0fxaX9xsqvW364V.x9Dmuyy6V/iHr/3qAi10flofHKFkl9jB6STW', 'user', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT("email") DO UPDATE SET "password_hash"='$2b$12$a0fxaX9xsqvW364V.x9Dmuyy6V/iHr/3qAi10flofHKFkl9jB6STW', "full_name"='Utilisateur Demo';

-- Admin Home
INSERT OR IGNORE INTO "homes" ("id", "owner_id", "name", "address", "is_active", "created_at", "updated_at")
SELECT 'home-admin-001', "id", 'ORDOMOTIK HQ', 'Siege Social', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" WHERE "email"='admin@qrdomotik.roomscan.pro' AND NOT EXISTS (SELECT 1 FROM "homes" WHERE "owner_id"='admin-001');

-- Demo Home
INSERT OR IGNORE INTO "homes" ("id", "owner_id", "name", "address", "is_active", "created_at", "updated_at")
SELECT 'home-demo-001', "id", 'Ma Maison Demo', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" WHERE "email"='demo@qrdomotik.roomscan.pro' AND NOT EXISTS (SELECT 1 FROM "homes" WHERE "owner_id"='demo-001');
