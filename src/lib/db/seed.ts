import { db } from '../db'
import apps from '../../../data/apps_universe.json'

export async function seedUniverse() {
  const sb = db()
  console.log(`Seeding ${apps.length} products...`)

  for (const app of apps) {
    await sb.from('organism_products').upsert(
      {
        id: app.id,
        name: app.name,
        class: app.class,
        niche: app.niche,
        medium_pub: app.medium_pub,
        target_keywords: app.target_keywords,
        target_subreddits: app.target_subreddits,
        description: app.description,
        active: true,  // explicitly set so getProducts() filter works
      },
      { onConflict: 'id' }
    )
  }

  console.log('Seed complete.')
}
