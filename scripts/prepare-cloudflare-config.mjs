import { readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const databaseName =
  process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "team-progress-checklist-db";
const databaseId =
  process.env.CLOUDFLARE_D1_DATABASE_ID ??
  "f6269837-168c-4774-922f-b04ca08eb9cf";

if (!databaseId) {
  console.error(
    [
      "CLOUDFLARE_D1_DATABASE_ID is required before deploying.",
      "Create a D1 database first:",
      "  npm run cf:d1:create",
      "Then set CLOUDFLARE_D1_DATABASE_ID to the database_id shown by Wrangler.",
    ].join("\n")
  );
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf8"));
config.name = process.env.CLOUDFLARE_WORKER_NAME ?? "team-progress-checklist";
config.topLevelName = config.name;
config.d1_databases = [
  {
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
  },
];
// Daily deadline-alert webhook: 00:00 UTC = 09:00 KST, weekdays.
config.triggers = {
  crons: [process.env.CLOUDFLARE_ALERT_CRON ?? "0 0 * * 1-5"],
};

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `Prepared Cloudflare config for ${config.name} using D1 ${databaseName}.`
);
