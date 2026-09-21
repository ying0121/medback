# Database migrations

Schema changes go in versioned files under `src/db/migrations/`.

## Commands

```bash
npm run db:migrate          # apply pending migrations
npm run db:migrate:status   # list applied / pending
npm run db:sync             # sequelize.sync tables + run migrations + seeds
```

Startup (`initializeDatabase`) also runs pending migrations after `sequelize.sync()`.

## Adding a migration

1. Create `src/db/migrations/YYYYMMDD_NNN_short_name.js` (NNN = sequence for that day).
2. Export:

```js
const { addColumnIfMissing } = require("../migrationHelpers");

module.exports = {
  name: "YYYYMMDD_NNN_short_name", // must match filename without .js
  async up(_queryInterface, sequelize) {
    await addColumnIfMissing(sequelize, "clinics", "new_col", "VARCHAR(64) NULL");
  }
};
```

3. Prefer `addColumnIfMissing` / `modifyColumn` so migrations are safe on DBs that already have the change.
4. Run `npm run db:migrate`.

Applied migrations are recorded in the `schema_migrations` table.
