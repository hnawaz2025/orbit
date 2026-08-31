// Entry point for running Orbit as a long-lived server.
//
// The app itself lives in app.ts so that a serverless handler can import it
// without starting a listener.
import "dotenv/config";
import { app } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const port = env.PORT ? Number(env.PORT) : 4000;

app.listen(port, () => {
  console.log(`Orbit server listening on port ${port}`);
});
