import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const dataPath = path.join(process.cwd(), 'data', 'apps_universe.json');
  const apps = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log(`🚀 Starting bulk import of ${apps.length} apps into Neuralia...`);

  await client.connect();

  for (const app of apps) {
    try {
      await client.query(`
        INSERT INTO organism.products (
          id, name, class, niche, medium_pub, target_keywords, target_subreddits, description
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          class = EXCLUDED.class,
          niche = EXCLUDED.niche,
          medium_pub = EXCLUDED.medium_pub,
          target_keywords = EXCLUDED.target_keywords,
          target_subreddits = EXCLUDED.target_subreddits,
          description = EXCLUDED.description;
      `, [
        app.id,
        app.name,
        app.class,
        app.niche,
        app.medium_pub,
        app.target_keywords,
        app.target_subreddits,
        app.description
      ]);
      console.log(`✅ Imported: ${app.name}`);
    } catch (error) {
      console.error(`❌ Failed: ${app.name}`, error);
    }
  }

  await client.end();
  console.log('🏁 Bulk import complete.');
  process.exit(0);
}

main();
