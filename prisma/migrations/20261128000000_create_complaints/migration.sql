BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "complaint_submissions" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formTemplateId" UUID NOT NULL,
    "firstName" VARCHAR(200) NOT NULL,
    "middleName" VARCHAR(200),
    "lastName" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320),
    "answers" JSONB NOT NULL,

    CONSTRAINT "complaint_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_attachments" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_submissions_createdAt_idx" ON "complaint_submissions"("createdAt");

-- CreateIndex
CREATE INDEX "complaint_attachments_submissionId_idx" ON "complaint_attachments"("submissionId");

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "complaint_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Complaints are accessible through the server's database role only.
ALTER TABLE "complaint_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaint_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "complaint_submissions", "complaint_attachments" FROM PUBLIC, anon, authenticated;

COMMIT;

