import { PrismaClient } from "@prisma/client";

// One client for the whole process. PrismaClient owns a connection pool, so
// constructing it per-request or per-module would open pools that never get
// reused and eventually exhaust Postgres's connection limit.
export const prisma = new PrismaClient();
