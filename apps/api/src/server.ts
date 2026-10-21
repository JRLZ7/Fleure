import { createApp } from "./app.js";
const { app } = createApp(
  process.env.DATABASE_PATH || "fleure.db",
  process.env.DEMO_PASSWORD,
);
const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () =>
  console.log(`Fleure API listening at http://${host}:${port}`),
);
