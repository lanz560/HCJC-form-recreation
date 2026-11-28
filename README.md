# Commission on Judicial Conduct form recreation

The form sends submissions to `POST /api/complaints`. The Node server validates the visible, required answers and uses Prisma to save the complaint and its PDF attachments together in Supabase PostgreSQL. A successful response includes the saved submission ID; failures leave the form available to retry.

## Setup

Requires Node.js 22.18+ and pnpm.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env` (or add its database variables to your existing `.env`).
3. In Supabase's **Connect** panel, copy the transaction pooler connection string (port 6543) into `DATABASE_URL` and the session pooler (port 5432) or direct connection string into `DIRECT_URL`. For a persistent Node server, the session pooler URL can be used for both variables. Fill in the database password, URL-encoding special characters. Append `sslmode=verify-full&sslrootcert=server/certs/supabase-ca.crt` as shown in `.env.example` to encrypt connections and verify the server certificate. Use the `postgres` role or a server role with permission to create and access these tables and bypass RLS. The public Supabase URL and publishable key cannot authenticate Prisma.
4. Run `pnpm db:generate` and `pnpm db:migrate` to generate the client and apply the committed migration.
5. Run `pnpm dev` and open `http://localhost:8080`.

For production, run `pnpm build`, apply `pnpm db:migrate`, then run `pnpm start`. Set `DATABASE_URL` in the server environment and `DIRECT_URL` in the migration environment. `PORT` defaults to 8080. Serve over HTTPS in production. The app requires its Node server; a static file server cannot save submissions. Deploy `server/`, `scripts/`, `dist/`, the generated Prisma client, and runtime dependencies together.

Run commands from the project root so the certificate path resolves. `server/certs/supabase-ca.crt` is Supabase's public root CA, downloaded from [Supabase's certificate distribution](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). It is safe to commit and must be included in deployments. See [Supabase's TLS configuration guide](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Database

`prisma/schema.prisma` defines:

- `complaint_submissions`: UUID, submission time, form template UUID, name, optional email, and all active form answers in JSON. Each answer includes its question label, submitted values, and selected option labels where applicable. Hidden answers are discarded.
- `complaint_attachments`: filename, byte size, PDF bytes, and a foreign key to the submission. Attachments are limited to five PDFs of 5 MB each. The complaint and attachments are inserted atomically.

The migration enables row-level security and revokes access from Supabase's public `anon` and `authenticated` roles. Only the server database role should access these records. No submission list or attachment download is publicly exposed. Database URLs stay outside the browser and are ignored by Git. View saved records in the Supabase Table Editor or run `pnpm db:studio` locally.

To change the schema, edit `prisma/schema.prisma`, run `pnpm exec prisma migrate dev --name describe_change` against a development database, and commit the generated migration. Deploy migrations with `pnpm db:migrate`; avoid `db push` so the access controls in migration SQL are applied.

## Checks

Run `pnpm test`, `pnpm db:validate`, and `pnpm build`. API tests use an injected persistence function and do not write to Supabase.

This is a recreation and does not file complaints with the Commission's official portal. The original CAPTCHA and Jira service are not connected. Some role choices were absent from the reference page data and still need verification before production use.

Connection guidance: [Supabase's Prisma integration](https://supabase.com/docs/guides/database/prisma).
