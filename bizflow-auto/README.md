# BizFlow Auto

Garage management app built with Next.js, TypeScript, Prisma, and MySQL.

## Local setup

1. Install dependencies with `npm install`.
2. Create a MySQL database named `bizflow_auto` and a local application account with the SQL below. For this WAMP setup, MySQL listens on port `3308`; the separate MariaDB service listens on `3307`.
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to the application account connection string. Set `AUTH_SECRET` to a unique random secret with at least 32 characters. Choose a long random alphanumeric database password, or URL-encode special characters in the connection URL.
4. Generate the Prisma client and apply the database migrations:

   ```bash
   npm run db:generate
   npm run db:deploy
   ```

5. Start the development server with `npm run dev`.

Run once in MySQL Workbench or phpMyAdmin while signed in with a MySQL administrator account. Replace the password placeholder with a unique, strong password; do not share or commit it:

```sql
CREATE DATABASE IF NOT EXISTS bizflow_auto;
CREATE USER 'bizflow_app'@'localhost'
  IDENTIFIED WITH caching_sha2_password BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON bizflow_auto.* TO 'bizflow_app'@'localhost';
```

Then set `DATABASE_URL` in `.env.local` to `mysql://bizflow_app:YOUR_PASSWORD@localhost:3308/bizflow_auto`. This account is restricted to the local machine and the `bizflow_auto` database; its schema-level privileges allow Prisma to apply migrations.

Prisma models in `prisma/schema.prisma` are the source of truth for the database. Use `npm run db:studio` to inspect local records. For deployment, set the environment variables in the hosting provider and run `npm run db:deploy`.

`db:deploy` applies the checked-in migrations and does not need permission to create a temporary database. `db:migrate` is for developing new migrations and Prisma needs a shadow database for it; the app account shown above intentionally has database-scoped permissions only. For this WAMP server, the initial migration explicitly creates business tables with InnoDB because the server's default engine is MyISAM. Ensure future generated migrations also create new tables with InnoDB, or change the MySQL server's default storage engine before developing further migrations.

To create the first administrator, set `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in your local shell and run `npm run db:create-admin`. The script loads `.env.local` for the database connection. In PowerShell:

```powershell
$env:ADMIN_NAME = "Garage Administrator"
$env:ADMIN_USERNAME = "garageadmin"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "choose-a-private-password-of-6-or-more-characters"
npm run db:create-admin
Remove-Item Env:ADMIN_NAME, Env:ADMIN_USERNAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

The one-time script creates an admin account only if its email and username are unused; it does not reset existing passwords. Passwords must be at least 6 characters. Never commit `.env.local` or administrator credentials.

To reset a local administrator password, run `npm run db:reset-admin-password` in an interactive PowerShell terminal. Enter the administrator username, then enter and confirm the new password at the hidden prompts. The script updates only that administrator account and does not print or store the new password.

Users sign in with their username, email, or full name and password. Users can request a single-use password reset link by email. Set `APP_URL` to the exact public app URL and configure Resend (`RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`) so reset emails can be delivered. Reset links expire after 30 minutes.

## Vehicle inspections, diagnostics, and image storage

After a vehicle has been checked in, staff can complete its standard digital inspection checklist, attach photos, and save diagnostic procedures, fault codes, symptoms, findings, and recommended repairs. Mechanics can access only inspections and diagnostics associated with their assigned jobs. Inspection and diagnostic records are available from the Inspections & Diagnostics module.

Reception and inspection photos are uploaded to a private S3-compatible bucket and are never served from a public bucket URL. Configure `RECEPTION_S3_BUCKET` and `RECEPTION_S3_REGION`. Set `RECEPTION_S3_ENDPOINT` for S3-compatible providers such as Cloudflare R2; set `RECEPTION_S3_FORCE_PATH_STYLE=true` if that provider requires path-style addressing. Supply `RECEPTION_S3_ACCESS_KEY_ID` and `RECEPTION_S3_SECRET_ACCESS_KEY` together, or leave both empty when the runtime uses an IAM role. Grant the application only the bucket permissions it needs to put, read, and delete objects under `receptions/` and `inspections/`.

Image files are restricted to JPEG, PNG, and WebP, with a maximum of five images and 15 MB total per reception or inspection. Image links are authorized by the app and signed for five minutes. Records without photos can be saved while storage is unconfigured; photo uploads and viewing return a clear configuration error until storage is available. Never place object-storage credentials in source control or send them in chat.

## Inventory and procurement

Authorized inventory staff can maintain suppliers, create draft purchase orders with multiple spare-part lines, place orders, and record partial or complete deliveries. Stock increases only when a purchase receipt is posted; each received line updates the purchase order, spare-part balance, inventory ledger, and audit log in one transaction. Purchase receipts cannot exceed ordered quantities.

The spare-parts module also supports stock issues, physical-count adjustments, low-stock alerts, and a searchable recent transaction ledger. The default reorder level is 10; admin and storekeeper dashboards flag counted parts when their available quantity reaches or falls below that level. Since this garage currently uses one overall quantity per part, a transfer records source and destination locations for traceability without changing the overall stock balance. Purchase-order and stock changes require inventory-write permission; mechanics can only consume parts included in an approved quotation.

The vehicle catalog seed command (`npm run db:seed-catalog`) adds common car, bicycle, and motorbike parts plus services grouped by vehicle type, category, and mechanic specialty. It is safe to rerun: existing part balances and configured prices are not overwritten. Seeded parts show **Not counted** and **Price not set** until staff record a physical count and enter a price; parts cannot be issued or quoted before those checks. Seeded services show **Price after inspection** until a price is configured. The catalog is a practical starter list, not an exhaustive fitment database for every make and model.

Vehicle forms offer a make-to-model picker for common makes and models, with a manual option for vehicles outside the list. These are choices only; they do not create plate-less vehicle records. A registration number is still required when registering an actual customer vehicle.

## Staff leave requests

Staff can submit a leave application with a leave type (annual, sick, compassionate, maternity, paternity, unpaid, study, or other), dates, and reason from the Leave module. Applications are submitted to the in-app admin/manager review queue. Staff can view their own request history and cancel pending requests. Administrators and garage managers can review staff requests; reviewers cannot approve or reject their own request. Pending or approved date overlaps for the same employee are prevented, and submissions and decisions are recorded in the audit log.

## Workshop job-card workflow

Staff can follow each job card on the Workshop Board through waiting, inspection, diagnosis, customer approval, repair, quality check, invoicing, and delivery. Mechanics may record diagnosis before approval, but repair work and quoted-part consumption require an approved quotation. A failed quality check returns the job to repair; passing creates an invoice from the approved quote. Staff can record delivery only after the invoice is paid in full. Cancellation is limited to jobs that have not started repair work. Service reminders are calculated from delivery, not from the quality-check date.

## Safaricom Daraja sandbox payments

M-Pesa STK Push is sandbox-only until production readiness and credentials are configured. Add the following to `.env.local` from the Safaricom Daraja sandbox app dashboard: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, and `MPESA_PASSKEY`. Set `MPESA_ENVIRONMENT=sandbox`, `MPESA_CALLBACK_URL` to the public HTTPS URL `/api/payments/mpesa/callback`, and `MPESA_CALLBACK_TOKEN` to a new random secret. The callback path must be reachable from Safaricom; `localhost` is not reachable by the provider. Do not place these values in source control or send them in chat.

Customer STK requests charge only the remaining whole-shilling invoice balance (up to KSh 250,000). The app marks an invoice paid only after an authenticated callback matches its checkout, amount, and phone number. In the Daraja sandbox, complete testing with the test credentials and test phone numbers issued by Safaricom. No live payments are enabled by this configuration.

## Email notifications

Appointment requests, appointment changes, quality-check completion and vehicle delivery notifications, and quotation approval links use the Resend API. Set `RESEND_API_KEY` and a verified-domain `RESEND_FROM_EMAIL`; `APP_URL` must be the exact public HTTPS origin in production. Quotation approval links are random, one-time tokens stored only as hashes and expire with the quotation. Staff can still share the private link directly if email delivery is unavailable. Set `GARAGE_NOTIFICATION_EMAIL` for new-booking alerts. Customer email addresses are optional for general appointment notifications; a quotation cannot be sent without the customer's email address.

## Automatic WhatsApp and SMS service reminders

The app checks delivered services daily and sends one WhatsApp reminder and one SMS per opted-in vehicle when the next service is due within 30 days (90 days after the latest delivered job). WhatsApp and SMS delivery attempts are tracked independently, so a failure or missing provider configuration on one channel does not resend a successful notification on the other. Failed sends are recorded and retried by the next daily run. On Vercel the checked-in `vercel.json` schedules the route at 09:00 East Africa Time; set a strong `CRON_SECRET` so Vercel authenticates the scheduled request.

The admin's `0705712310` number must be registered as the WhatsApp Business sender in Meta Cloud API. Set `WHATSAPP_BUSINESS_NUMBER=254705712310`, its Meta `WHATSAPP_PHONE_NUMBER_ID`, and a server-side `WHATSAPP_ACCESS_TOKEN`. The scheduled route verifies that the configured phone-number ID belongs to that sender before sending. Create and get approval for a WhatsApp message template named by `WHATSAPP_SERVICE_REMINDER_TEMPLATE` (default `service_reminder`), in `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`), with exactly three body placeholders: customer name, vehicle registration, and due date. Customers must have valid Kenyan mobile numbers and have opted in to both WhatsApp and SMS messages. Public registration includes a shared opt-in checkbox; existing customers remain opted out unless their consent is confirmed and recorded by an administrator in Customers. Customers can opt in or out later from their dashboard. Do not put access tokens in source control or chat.

Set `AFRICASTALKING_USERNAME` and `AFRICASTALKING_API_KEY` from the Africa's Talking dashboard. Use username `sandbox` and a sandbox API key while testing. `AFRICASTALKING_SENDER_ID` is optional and should only be set to a sender ID registered to that account; sandbox testing may leave it empty. SMS uses the same customer opt-in as WhatsApp, and the registration/dashboard preference explains that consent covers both channels. The scheduler will continue sending on a configured channel if the other provider is not ready, and returns a configuration error so the missing provider is visible. Never put provider credentials in source control or chat.

Set `APP_URL` to the deployed HTTPS origin. For local testing, invoke `GET /api/cron/service-reminders` with `Authorization: Bearer <CRON_SECRET>` only after configuring Africa's Talking sandbox and Meta credentials with an approved template. Do not expose the cron secret or provide an unauthenticated public trigger.

## Deployment

For a Vercel deployment, connect this repository to a Vercel project and provision a managed MySQL database that is reachable over TLS from the deployed application. Configure `DATABASE_URL`, a unique `AUTH_SECRET` (at least 32 characters), and the required provider values as server-side environment variables for the intended deployment environment. Deploy schema changes with `npm run db:deploy` from a trusted release environment. Configure the M-Pesa callback URL to the deployed HTTPS host. Do not run live payment tests or publish a production deployment until the garage owner has reviewed the database, domain, Safaricom credentials, and payment terms.

Configure the hosting platform's uptime monitor to probe `GET /api/health`; it returns `200` only when the application can reach its database and `503` otherwise. The endpoint does not return environment values or infrastructure details. Configure alerts for failed health checks, deployment failures, scheduled reminder failures, and database backup failures. The repository is not linked to a Vercel project and contains no production domain, managed database URL, production provider credentials, or monitoring integration, so production deployment and external alerting still require setup in the owner's hosting accounts.

## API

- `POST /api/auth/register` creates a customer account and starts a session. Public registration is restricted to the `CUSTOMER` role; administrator and mechanic accounts must be created through a trusted administrative workflow. New accounts use a unique username and a password of at least 6 characters.
- `POST /api/auth/forgot-password` sends a single-use, 30-minute reset link to the account email without disclosing whether the account exists.
- `POST /api/auth/reset-password` validates a reset token and sets a new password of at least 6 characters.
- `GET /api/health` returns application/database health for external uptime probes; it exposes no configuration values.
- `GET /api/cron/service-reminders` sends scheduled WhatsApp and SMS service reminders; it requires `Authorization: Bearer <CRON_SECRET>`.
- `PATCH /api/customer/whatsapp-preference` updates only the signed-in customer's own reminder opt-in preference.
- `POST /api/auth/logout` clears the current session.
- `GET /api/auth/session` returns the signed-in user for same-origin session checks; responses are not cached.
- `/customer/dashboard` is the signed-in customer's private view of their own linked vehicles and appointments.
- `/dashboard` uses one shared dashboard layout for staff roles, with role-scoped metrics, activity charts, schedules, and quick actions; customer accounts use the same overview layout at `/customer/dashboard`. The global search returns only records allowed by the signed-in role.
- Staff sign in to `/dashboard`; the mechanic job workboard remains available at `/mechanic/dashboard`.
- `GET/POST /api/users` lets admins list accounts and create admin or mechanic accounts. Mechanic accounts receive a linked mechanic profile.
- `GET/POST /api/customer/vehicles` lets customers view and add only their own vehicles.
- `GET/POST /api/customer/appointments` lets customers request appointments only for their own vehicles and view their own job progress.
- `GET /api/customer/invoices` returns only the signed-in customer's invoices and payment records.
- `GET /api/customer/quotations` returns quotations belonging only to the signed-in customer's linked profile; `PATCH /api/customer/quotations/:id` records that customer's approval or rejection.
- `GET/POST /api/quotations` lists and creates staff quotations. `PATCH /api/quotations/:id` saves a draft or emails a private, expiring approval link. `GET/POST /api/quote-response` validates and records decisions from that link.
- `/quotations` is the staff quotation manager; `/customer/quotations` is the customer portal; `/quote-response` is the private email-link review page.
- `POST /api/payments/mpesa` starts a customer-owned Daraja sandbox STK Push; invoice payment status changes only after the callback is validated.
- `POST /api/payments/mpesa/callback` accepts Daraja callbacks protected by the configured random callback token.
- `GET/POST /api/payments` lists and records authorized staff-entered payments. Payment amount cannot exceed the outstanding invoice balance; completed payments receive a printable receipt.
- `GET /api/invoices` lists invoices for authorized staff. Invoices are created from the approved quotation when a staff member passes the job's quality check.
- `GET /api/job-cards` returns the staff workshop board. `PATCH /api/job-cards/:id` saves notes, records a quality-check result, cancels an eligible pre-repair job, or records delivery after payment.
- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` provides date-filtered revenue, expenses/net, payment-method and expense-category breakdowns, delivered-job and repair-time KPIs, vehicle/service summaries, and appointment status. The Reports page exports these metrics and charts to CSV or print/PDF.
- `GET /api/mechanic/jobs` returns only jobs assigned to the signed-in mechanic. `PATCH /api/mechanic/jobs/:id` updates diagnosis and, after quotation approval, work, repair status and quoted parts; stock reduction and inventory ledger updates are atomic. Mechanics hand finished work to the workshop quality-check queue; they do not create invoices.
- `GET/POST /api/appointments` list and create staff appointments with advisor and priority data. Status changes enforce the appointment lifecycle; mechanic assignment requires job-card-management permission.
- `GET/POST /api/receptions` lists and records vehicle condition, mileage, fuel, complaints, and optional private photos. Walk-ins create a checked-in appointment so they continue through the job workflow.
- `GET/POST /api/services` and `PATCH/DELETE /api/services/:id` provide the service catalog. Listing is available for customer booking; catalog changes require a staff permission.
- `GET/POST /api/spare-parts` allows authorized inventory staff to manage stock; mechanics can read stock levels.
- `GET/POST /api/suppliers` and `PATCH /api/suppliers/:id` manage supplier contacts and active status.
- `GET/POST /api/purchases` lists and creates draft purchase orders. `PATCH /api/purchases/:id` places or cancels an eligible order and records partial or complete receipts atomically with stock and transaction-ledger updates.
- `GET/POST /api/inventory-transactions` reads recent stock movements and records stock issues, physical-count adjustments, or location transfers; transfers do not change the single overall stock balance.
- Customer, vehicle, mechanic, appointment, finance, and inventory routes enforce their role permission on the server, independently of which links are displayed.
- `GET /api/customers` lists up to 100 customers for roles with customer-read permission.

## Role privileges

| Role | Allowed capabilities |
| --- | --- |
| **Super Admin / Admin** | Full access, including user provisioning and audit-log review. `ADMIN` remains a full-access compatibility role for existing accounts. |
| **Garage Manager** | Manage garage operations, staff profiles, appointments, vehicle reception, quotations, inventory, invoices, payments, and reports; cannot manage accounts or review audit logs. |
| **Service Advisor** | Manage customer/vehicle records, appointments, vehicle reception, quotations, and job-card assignment; can read mechanic and service catalogs; cannot delete customer or vehicle records. |
| **Mechanic** | View only assigned job cards; record diagnosis, then begin repair/work and consume quoted parts only after customer approval; hand completed repairs to quality check; stock reduction and inventory-ledger entries are atomic. |
| **Storekeeper** | Read and manage spare-part records and stock receipts; cannot manage finance or user accounts. |
| **Accountant** | Read reports and manage invoices and payments; cannot manage workshop inventory or user accounts. |
| **Customer** | Maintain their own vehicle list; request appointments for their own vehicles; view their own appointments, quotations, job updates, invoices, and payment status; approve or reject sent quotations. |

Sessions use signed, HTTP-only, SameSite=Lax cookies with a seven-day lifetime and HTTPS-only `Secure` cookies in production. Each protected request confirms the account and session version against the database so deleted accounts, password resets, lockouts, or logout invalidate previously issued tokens; logging out invalidates all active sessions for that account. Login accepts a unique username, email, or full name. If a full name matches multiple accounts, use the username or email instead. Five consecutive incorrect passwords lock an account for 15 minutes; a successful login clears the counter and updates the last-login timestamp. Successful/failed login attempts, account lockouts, user provisioning, operational changes, payments, inventory activity, and logout are written to the audit log. Audit records store action/record metadata and the proxy-reported `x-real-ip` when available; request bodies and passwords are not recorded. The audit-log page and API are restricted to Admin and Super Admin. Every protected page and API checks the role permission on the server; customer-owned resources are queried through the signed-in customer's database relation. Public registration always creates a customer account and cannot grant staff privileges. OTP is intentionally disabled.

## Role navigation

The shared dashboard shell and responsive sidebar use the same layout for every role. Dashboard content and navigation are filtered to the signed-in user's role: admins and garage managers see operational, finance, reporting, and permitted administration modules; advisors see customer, vehicle, booking, intake, inspection, quote, and job-assignment functions; mechanics see assigned jobs, inspections/diagnostics, and read-only stock; storekeepers see stock/procurement; accountants see invoices, payments, expenses, and reports; customers see their vehicles, booking form, quotes, reminders, bookings, and bills. Navigation uses compact icon-plus-label controls and keeps full accessible names. Server-side permission checks remain authoritative.

### Backup and recovery controls

Before production launch, enable automated encrypted backups and point-in-time recovery on the managed MySQL provider, with at least daily snapshots and a documented retention period approved by the garage owner. Store backups in a separate account/region from the application database, restrict restore access, and test a restore into an isolated database at least quarterly. Enable object versioning or an equivalent recovery policy for the private reception/inspection image bucket and include those objects in restore exercises. Record the recovery-point and recovery-time objectives, alert on failed backups, and never copy production data into local development. Backup jobs and provider retention have not been enabled from this codebase; they must be configured and verified in the chosen hosting and storage accounts.

### Chrome/local login troubleshooting

- Run the development server with `npm run dev`; it binds to port `3001` on all network interfaces. Open and use the app under the same origin, preferably `http://localhost:3001` for both registration and login (or `http://<your-LAN-IP>:3001` from another device). `localhost`, `127.0.0.1`, and a LAN IP are distinct cookie hosts and don't share sessions.
- The login form checks `/api/auth/session` after authentication and reports if the browser doesn't return its session cookie. Allow cookies for the local site if prompted or blocked by browser settings.
- Changing `AUTH_SECRET` invalidates sessions signed with the old value; sign in again after such a change.
