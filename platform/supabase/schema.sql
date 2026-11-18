-- Prepared offline from the current D1 migrations. Fresh target only.
-- Keep local authentication and private R2 documents for the first cutover.
BEGIN;
SET LOCAL standard_conforming_strings = on;
CREATE TABLE public."users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" text NOT NULL,
  "role" text NOT NULL DEFAULT 'empresa',
  "phone" text,
  "phone_verified_at" text,
  "phone_channel" text NOT NULL DEFAULT 'none',
  "notify_loads" bigint NOT NULL DEFAULT 0,
  "notify_documents" bigint NOT NULL DEFAULT 0,
  "phone_consent_at" text
);
CREATE UNIQUE INDEX "users_email_unique" ON public."users" ("email");
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."users" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."users" TO service_role;
CREATE TABLE public."bank_accounts" (
  "user_id" text PRIMARY KEY NOT NULL,
  "bank_name" text NOT NULL,
  "holder_name" text NOT NULL,
  "account_type" text NOT NULL,
  "currency" text NOT NULL,
  "encrypted_number" text NOT NULL,
  "last_four" text NOT NULL,
  "consent_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "share_for_direct_transfer" bigint NOT NULL DEFAULT 0
);
ALTER TABLE public."bank_accounts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."bank_accounts" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."bank_accounts" TO service_role;
CREATE TABLE public."auth_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "attempts" bigint NOT NULL,
  "expires_at" bigint NOT NULL
);
CREATE INDEX "auth_limits_expiry_idx" ON public."auth_limits" ("expires_at");
ALTER TABLE public."auth_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."auth_limits" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."auth_limits" TO service_role;
CREATE TABLE public."sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "expires_at" bigint NOT NULL
);
CREATE INDEX "sessions_user_idx" ON public."sessions" ("user_id");
CREATE INDEX "sessions_expiry_idx" ON public."sessions" ("expires_at");
ALTER TABLE public."sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sessions" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."sessions" TO service_role;
CREATE TABLE public."carrier_profiles" (
  "user_id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "legal_name" text NOT NULL,
  "consent_at" text NOT NULL
);
ALTER TABLE public."carrier_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."carrier_profiles" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."carrier_profiles" TO service_role;
CREATE TABLE public."carrier_drivers" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "categories" text NOT NULL
);
ALTER TABLE public."carrier_drivers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."carrier_drivers" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."carrier_drivers" TO service_role;
CREATE TABLE public."carrier_vehicles" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "driver_id" text NOT NULL,
  "plate" text NOT NULL,
  "description" text NOT NULL,
  "equipment" text NOT NULL,
  "capacity_kg" double precision NOT NULL,
  "required_category" text NOT NULL
);
ALTER TABLE public."carrier_vehicles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."carrier_vehicles" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."carrier_vehicles" TO service_role;
CREATE TABLE public."carrier_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "type" text NOT NULL,
  "object_key" text,
  "mime" text,
  "size" bigint,
  "issued_at" text,
  "expires_at" text,
  "no_expiry" bigint NOT NULL DEFAULT 0,
  "exemption" text,
  "status" text NOT NULL DEFAULT 'pending',
  "revision" text NOT NULL,
  "uploaded_at" text NOT NULL,
  "reviewed_at" text,
  "reviewed_by" text,
  "review_note" text,
  "ocr_status" text NOT NULL DEFAULT 'not_started',
  "ocr_revision" text,
  "ocr_operation_id" text,
  "ocr_summary" text,
  "ocr_updated_at" text
);
CREATE UNIQUE INDEX "carrier_documents_slot_idx" ON public."carrier_documents" ("user_id", "entity_type", "entity_id", "type");
CREATE INDEX "carrier_documents_user_idx" ON public."carrier_documents" ("user_id");
ALTER TABLE public."carrier_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."carrier_documents" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."carrier_documents" TO service_role;
CREATE TABLE public."loads" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "pickup_date" text NOT NULL,
  "equipment" text NOT NULL,
  "weight" double precision NOT NULL,
  "pay" double precision NOT NULL,
  "company" text NOT NULL,
  "email" text NOT NULL,
  "created_at" text NOT NULL,
  "status" text NOT NULL DEFAULT 'disponible',
  "carrier_id" text,
  "assigned_at" text,
  "accepted_at" text,
  "delivered_at" text,
  "completed_at" text,
  "fee_rate_bps" bigint NOT NULL DEFAULT 0,
  "fee_cents" bigint NOT NULL DEFAULT 0,
  "fee_accepted_at" text,
  "transport_vehicle_id" text,
  "transport_driver_id" text,
  "delivery_evidence_id" text,
  "currency" text NOT NULL DEFAULT 'NIO'
);
CREATE INDEX "loads_owner_created_idx" ON public."loads" ("owner_id", "created_at");
CREATE INDEX "loads_pickup_date_idx" ON public."loads" ("pickup_date");
ALTER TABLE public."loads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."loads" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."loads" TO service_role;
CREATE TABLE public."commissions" (
  "id" text PRIMARY KEY NOT NULL,
  "load_id" text NOT NULL,
  "payer_id" text NOT NULL,
  "carrier_id" text NOT NULL,
  "fare_cents" bigint NOT NULL,
  "rate_bps" bigint NOT NULL,
  "amount_cents" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" text NOT NULL,
  "paid_at" text,
  "payment_reference" text,
  "recorded_by" text
);
CREATE INDEX "commissions_payer_idx" ON public."commissions" ("payer_id");
CREATE INDEX "commissions_status_idx" ON public."commissions" ("status");
CREATE UNIQUE INDEX "commissions_load_id_unique" ON public."commissions" ("load_id");
ALTER TABLE public."commissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."commissions" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."commissions" TO service_role;
CREATE TABLE public."carrier_notice_reads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "document_id" text NOT NULL,
  "read_at" text NOT NULL
);
CREATE INDEX "carrier_notice_reads_user_idx" ON public."carrier_notice_reads" ("user_id");
ALTER TABLE public."carrier_notice_reads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."carrier_notice_reads" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."carrier_notice_reads" TO service_role;
CREATE TABLE public."load_notice_reads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "load_id" text NOT NULL,
  "read_at" text NOT NULL
);
CREATE INDEX "load_notice_reads_user_idx" ON public."load_notice_reads" ("user_id");
ALTER TABLE public."load_notice_reads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."load_notice_reads" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."load_notice_reads" TO service_role;
CREATE TABLE public."phone_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "event_type" text NOT NULL,
  "event_id" text NOT NULL,
  "channel" text NOT NULL,
  "phone" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  "provider_id" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
CREATE INDEX "phone_deliveries_state_idx" ON public."phone_deliveries" ("state");
ALTER TABLE public."phone_deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."phone_deliveries" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."phone_deliveries" TO service_role;
CREATE TABLE public."subscription_payments" (
  "reference" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "plan" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "created_at" text NOT NULL,
  "verified_at" text,
  "verified_by" text,
  "bank_reference" text,
  "starts_at" text,
  "ends_at" text
);
CREATE INDEX "subscription_user_period" ON public."subscription_payments" ("user_id", "ends_at");
CREATE UNIQUE INDEX "subscription_one_pending" ON public."subscription_payments" ("user_id") WHERE "subscription_payments"."verified_at" IS NULL;
CREATE UNIQUE INDEX "subscription_payments_bank_reference_unique" ON public."subscription_payments" ("bank_reference");
ALTER TABLE public."subscription_payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."subscription_payments" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."subscription_payments" TO service_role;
CREATE TABLE public."load_publications" (
  "load_id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "created_at" text NOT NULL
);
CREATE INDEX "load_publications_owner_date" ON public."load_publications" ("owner_id", "created_at");
ALTER TABLE public."load_publications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."load_publications" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."load_publications" TO service_role;
CREATE TABLE public."load_quotes" (
  "id" text PRIMARY KEY NOT NULL,
  "load_id" text NOT NULL,
  "carrier_id" text NOT NULL,
  "amount_cents" bigint NOT NULL,
  "created_at" text NOT NULL,
  "priority" bigint NOT NULL
);
CREATE INDEX "load_quotes_carrier_date" ON public."load_quotes" ("carrier_id", "created_at");
CREATE UNIQUE INDEX "load_quotes_carrier_load" ON public."load_quotes" ("carrier_id", "load_id");
ALTER TABLE public."load_quotes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."load_quotes" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."load_quotes" TO service_role;
ALTER TABLE public."bank_accounts" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."sessions" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."carrier_profiles" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."carrier_drivers" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."carrier_vehicles" ADD FOREIGN KEY ("driver_id") REFERENCES public."carrier_drivers" ("id") ON DELETE RESTRICT;
ALTER TABLE public."carrier_vehicles" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."carrier_documents" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."loads" ADD FOREIGN KEY ("transport_driver_id") REFERENCES public."carrier_drivers" ("id") ON DELETE NO ACTION;
ALTER TABLE public."loads" ADD FOREIGN KEY ("transport_vehicle_id") REFERENCES public."carrier_vehicles" ("id") ON DELETE NO ACTION;
ALTER TABLE public."loads" ADD FOREIGN KEY ("carrier_id") REFERENCES public."users" ("id") ON DELETE NO ACTION;
ALTER TABLE public."commissions" ADD FOREIGN KEY ("recorded_by") REFERENCES public."users" ("id") ON DELETE RESTRICT;
ALTER TABLE public."commissions" ADD FOREIGN KEY ("carrier_id") REFERENCES public."users" ("id") ON DELETE RESTRICT;
ALTER TABLE public."commissions" ADD FOREIGN KEY ("payer_id") REFERENCES public."users" ("id") ON DELETE RESTRICT;
ALTER TABLE public."commissions" ADD FOREIGN KEY ("load_id") REFERENCES public."loads" ("id") ON DELETE RESTRICT;
ALTER TABLE public."carrier_notice_reads" ADD FOREIGN KEY ("document_id") REFERENCES public."carrier_documents" ("id") ON DELETE CASCADE;
ALTER TABLE public."carrier_notice_reads" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."load_notice_reads" ADD FOREIGN KEY ("load_id") REFERENCES public."loads" ("id") ON DELETE CASCADE;
ALTER TABLE public."load_notice_reads" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."phone_deliveries" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
ALTER TABLE public."subscription_payments" ADD FOREIGN KEY ("verified_by") REFERENCES public."users" ("id") ON DELETE NO ACTION;
ALTER TABLE public."subscription_payments" ADD FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE NO ACTION;
ALTER TABLE public."load_quotes" ADD FOREIGN KEY ("carrier_id") REFERENCES public."users" ("id") ON DELETE CASCADE;
COMMIT;
