// Vercel entry point.
//
// The whole Express app behind one catch-all function. Vercel's Node runtime
// hands a standard (req, res) pair, which is exactly what an Express app is,
// so nothing about the routes changes -- the same server runs unmodified
// under `npm run dev` locally and as a function here.
//
// Deliberately not one function per route: the routes share the Prisma client,
// the rate limiters and the error handler, and splitting them would give each
// its own cold start and its own connection pool.
import { app } from "../server/src/app";

export default app;
