-- DropForeignKey
ALTER TABLE "auth"."identities" DROP CONSTRAINT "identities_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_amr_claims" DROP CONSTRAINT "mfa_amr_claims_session_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_challenges" DROP CONSTRAINT "mfa_challenges_auth_factor_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_factors" DROP CONSTRAINT "mfa_factors_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_authorizations" DROP CONSTRAINT "oauth_authorizations_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_authorizations" DROP CONSTRAINT "oauth_authorizations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_consents" DROP CONSTRAINT "oauth_consents_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_consents" DROP CONSTRAINT "oauth_consents_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."one_time_tokens" DROP CONSTRAINT "one_time_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."refresh_tokens" DROP CONSTRAINT "refresh_tokens_session_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_providers" DROP CONSTRAINT "saml_providers_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_relay_states" DROP CONSTRAINT "saml_relay_states_flow_state_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_relay_states" DROP CONSTRAINT "saml_relay_states_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sessions" DROP CONSTRAINT "sessions_oauth_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sso_domains" DROP CONSTRAINT "sso_domains_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_client_id_fkey";

-- DropForeignKey
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_user_id_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_user_id_fkey";

-- DropForeignKey
ALTER TABLE "hour_packages" DROP CONSTRAINT "hour_packages_client_id_fkey";

-- DropForeignKey
ALTER TABLE "hour_packages" DROP CONSTRAINT "hour_packages_project_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_time_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_client_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_client_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_project_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_task_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_user_id_fkey";

-- DropIndex
DROP INDEX "auth"."users_instance_id_idx";

-- DropIndex
DROP INDEX "auth"."users_is_anonymous_idx";

-- DropIndex
DROP INDEX "auth"."users_phone_key";

-- DropIndex
DROP INDEX "idx_client_users_email";

-- DropIndex
DROP INDEX "idx_clients_email";

-- DropIndex
DROP INDEX "idx_clients_name";

-- DropIndex
DROP INDEX "idx_hour_packages_expires_at";

-- DropIndex
DROP INDEX "idx_invoices_due_date";

-- DropIndex
DROP INDEX "idx_invoices_invoice_number";

-- DropIndex
DROP INDEX "idx_invoices_issue_date";

-- DropIndex
DROP INDEX "idx_projects_name";

-- DropIndex
DROP INDEX "idx_tasks_name";

-- DropIndex
DROP INDEX "idx_time_entries_billable";

-- DropIndex
DROP INDEX "idx_time_entries_created_at";

-- DropIndex
DROP INDEX "idx_time_entries_user_date";

-- AlterTable
ALTER TABLE "auth"."users" DROP COLUMN "aud",
DROP COLUMN "banned_until",
DROP COLUMN "confirmation_sent_at",
DROP COLUMN "confirmation_token",
DROP COLUMN "confirmed_at",
DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "email_change",
DROP COLUMN "email_change_confirm_status",
DROP COLUMN "email_change_sent_at",
DROP COLUMN "email_change_token_current",
DROP COLUMN "email_change_token_new",
DROP COLUMN "email_confirmed_at",
DROP COLUMN "encrypted_password",
DROP COLUMN "instance_id",
DROP COLUMN "invited_at",
DROP COLUMN "is_anonymous",
DROP COLUMN "is_sso_user",
DROP COLUMN "is_super_admin",
DROP COLUMN "last_sign_in_at",
DROP COLUMN "phone",
DROP COLUMN "phone_change",
DROP COLUMN "phone_change_sent_at",
DROP COLUMN "phone_change_token",
DROP COLUMN "phone_confirmed_at",
DROP COLUMN "raw_app_meta_data",
DROP COLUMN "raw_user_meta_data",
DROP COLUMN "reauthentication_sent_at",
DROP COLUMN "reauthentication_token",
DROP COLUMN "recovery_sent_at",
DROP COLUMN "recovery_token",
DROP COLUMN "role",
DROP COLUMN "updated_at",
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "client_users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "email" SET DATA TYPE TEXT,
DROP COLUMN "access_level",
ADD COLUMN     "access_level" "AccessLevel" NOT NULL DEFAULT 'read';

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "email" SET DATA TYPE TEXT,
ALTER COLUMN "phone" SET DATA TYPE TEXT,
ALTER COLUMN "currency" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "hour_packages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "currency" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
DROP COLUMN "type",
ADD COLUMN     "type" "InvoiceItemType" NOT NULL DEFAULT 'time';

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "invoice_number" SET DATA TYPE TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
ALTER COLUMN "tax_rate" DROP DEFAULT,
ALTER COLUMN "tax_amount" DROP DEFAULT,
ALTER COLUMN "currency" SET DATA TYPE TEXT,
ALTER COLUMN "issue_date" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "currency" SET DATA TYPE TEXT,
DROP COLUMN "billing_type",
ADD COLUMN     "billing_type" "BillingType" NOT NULL DEFAULT 'hourly',
DROP COLUMN "status",
ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "is_billed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- DropTable
DROP TABLE "auth"."audit_log_entries";

-- DropTable
DROP TABLE "auth"."flow_state";

-- DropTable
DROP TABLE "auth"."identities";

-- DropTable
DROP TABLE "auth"."instances";

-- DropTable
DROP TABLE "auth"."mfa_amr_claims";

-- DropTable
DROP TABLE "auth"."mfa_challenges";

-- DropTable
DROP TABLE "auth"."mfa_factors";

-- DropTable
DROP TABLE "auth"."oauth_authorizations";

-- DropTable
DROP TABLE "auth"."oauth_client_states";

-- DropTable
DROP TABLE "auth"."oauth_clients";

-- DropTable
DROP TABLE "auth"."oauth_consents";

-- DropTable
DROP TABLE "auth"."one_time_tokens";

-- DropTable
DROP TABLE "auth"."refresh_tokens";

-- DropTable
DROP TABLE "auth"."saml_providers";

-- DropTable
DROP TABLE "auth"."saml_relay_states";

-- DropTable
DROP TABLE "auth"."schema_migrations";

-- DropTable
DROP TABLE "auth"."sessions";

-- DropTable
DROP TABLE "auth"."sso_domains";

-- DropTable
DROP TABLE "auth"."sso_providers";

-- DropEnum
DROP TYPE "auth"."aal_level";

-- DropEnum
DROP TYPE "auth"."code_challenge_method";

-- DropEnum
DROP TYPE "auth"."factor_status";

-- DropEnum
DROP TYPE "auth"."factor_type";

-- DropEnum
DROP TYPE "auth"."oauth_authorization_status";

-- DropEnum
DROP TYPE "auth"."oauth_client_type";

-- DropEnum
DROP TYPE "auth"."oauth_registration_type";

-- DropEnum
DROP TYPE "auth"."oauth_response_type";

-- DropEnum
DROP TYPE "auth"."one_time_token_type";

-- DropEnum
DROP TYPE "access_level";

-- DropEnum
DROP TYPE "billing_type";

-- DropEnum
DROP TYPE "invoice_item_type";

-- DropEnum
DROP TYPE "invoice_status";

-- DropEnum
DROP TYPE "project_status";

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_packages" ADD CONSTRAINT "hour_packages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_packages" ADD CONSTRAINT "hour_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_client_users_client_id" RENAME TO "client_users_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_client_users_user_id" RENAME TO "client_users_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_clients_user_id" RENAME TO "clients_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_hour_packages_client_id" RENAME TO "hour_packages_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_hour_packages_project_id" RENAME TO "hour_packages_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_invoice_items_invoice_id" RENAME TO "invoice_items_invoice_id_idx";

-- RenameIndex
ALTER INDEX "idx_invoice_items_time_entry_id" RENAME TO "invoice_items_time_entry_id_idx";

-- RenameIndex
ALTER INDEX "idx_invoices_client_id" RENAME TO "invoices_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_invoices_status" RENAME TO "invoices_status_idx";

-- RenameIndex
ALTER INDEX "idx_projects_client_id" RENAME TO "projects_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_status" RENAME TO "projects_status_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_project_id" RENAME TO "tasks_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_time_entries_start_time" RENAME TO "time_entries_start_time_idx";

-- RenameIndex
ALTER INDEX "idx_time_entries_task_id" RENAME TO "time_entries_task_id_idx";

-- RenameIndex
ALTER INDEX "idx_time_entries_user_id" RENAME TO "time_entries_user_id_idx";

