import { Client } from 'pg';
import apps from '../../../data/apps_universe.json';

export async function seedUniverse() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`🌱 Seeding Universe of ${apps.length} apps...`);

    for (const app of apps) {
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
    }
    console.log('✅ Universe seeded successfully.');
  } catch (err) {
    console.error('❌ Universe seeding failed:', err);
  } finally {
    await client.end();
  }
}
