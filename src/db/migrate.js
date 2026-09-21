#!/usr/bin/env node
/**
 * Apply pending DB migrations.
 * Usage: npm run db:migrate
 *        npm run db:migrate:status
 */
require("dotenv").config();

const { runMigrations, migrationStatus } = require("./migrator");

async function main() {
  const mode = process.argv[2] || "up";
  if (mode === "status") {
    const rows = await migrationStatus();
    for (const row of rows) {
      // eslint-disable-next-line no-console
      console.log(`${row.applied ? "✓" : "·"} ${row.name}`);
    }
    const pending = rows.filter((r) => !r.applied).length;
    // eslint-disable-next-line no-console
    console.log(pending ? `${pending} pending` : "All migrations applied.");
    process.exit(0);
  }

  const result = await runMigrations();
  // eslint-disable-next-line no-console
  console.log(
    result.applied.length
      ? `Applied ${result.applied.length} migration(s).`
      : "Database already up to date."
  );
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", err.message || err);
  process.exit(1);
});
