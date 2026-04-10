import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  'https://xxdisgtbkfrhfutxlwid.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4ZGlzZ3Ria2ZyaGZ1dHhsd2lkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc2ODgyMCwiZXhwIjoyMDkxMzQ0ODIwfQ.IWIHTGsUt31nJbQWZv2du2lmbdbhgwlZ3hUghNoZp_E',
  { db: { schema: 'organism' } }
);

async function main() {
  const dataPath = path.join(process.cwd(), 'data', 'apps_universe.json');
  const apps = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log(`🚀 Starting SDK bulk import of ${apps.length} apps into Neuralia...`);

  for (const app of apps) {
    const { error } = await supabase
      .from('products')
      .upsert({
        id: app.id,
        name: app.name,
        class: app.class,
        niche: app.niche,
        medium_pub: app.medium_pub,
        target_keywords: app.target_keywords,
        target_subreddits: app.target_subreddits,
        description: app.description
      }, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Failed: ${app.name}`, error);
    } else {
      console.log(`✅ Imported: ${app.name}`);
    }
  }

  console.log('🏁 SDK Bulk import complete.');
  process.exit(0);
}

main();
