import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.mts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to save submissions.');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
});

export const prisma = new PrismaClient({ adapter });
