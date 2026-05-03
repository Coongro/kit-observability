import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [],
  out: './drizzle',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
});
