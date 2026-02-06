import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wbgmnyekgqklggilgqag.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  console.error('Please set it in your .env file or run:');
  console.error('export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get database URL from environment
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function checkTableExists(tableName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(tableName)
    .select('id')
    .limit(1);

  // If table exists, query will succeed (even if empty)
  // If table doesn't exist, we'll get an error
  return !error;
}

async function executeSql(sql: string): Promise<boolean> {
  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      // Use raw SQL execution
      const { error } = await supabase.rpc('exec_sql', {
        sql_string: statement + ';'
      });

      if (error) {
        // Check if error is because table already exists
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Skipping: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    return true;
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Documentation CMS migrations...\n');

  // Check if docs_articles table already exists
  const docsTablesExist = await checkTableExists('docs_articles');

  if (docsTablesExist) {
    console.log('✅ docs_articles table already exists');
    console.log('✅ Migrations appear to be already applied!\n');

    // Check if we have any articles
    const { data: articles } = await supabase
      .from('docs_articles')
      .select('id, title')
      .limit(10);

    if (articles && articles.length > 0) {
      console.log(`📚 Found ${articles.length} articles:`);
      articles.forEach(a => console.log(`   - ${a.title}`));
    } else {
      console.log('⚠️  No articles found. Running seed migration...\n');

      const seedSql = readFileSync(
        resolve(__dirname, '..', 'supabase', 'migrations', '20260206100001_seed_ops_intelligence_docs.sql'),
        'utf-8'
      );

      await executeSql(seedSql);
      console.log('✅ Seed migration completed');
    }

    return;
  }

  console.log('📄 Applying schema migration...\n');
  const schemaSql = readFileSync(
    resolve(__dirname, '..', 'supabase', 'migrations', '20260206100000_docs_cms_schema.sql'),
    'utf-8'
  );

  const schemaSuccess = await executeSql(schemaSql);
  if (!schemaSuccess) {
    console.error('\n❌ Schema migration failed');
    process.exit(1);
  }

  console.log('✅ Schema migration completed\n');

  console.log('📄 Applying seed migration...\n');
  const seedSql = readFileSync(
    resolve(__dirname, '..', 'supabase', 'migrations', '20260206100001_seed_ops_intelligence_docs.sql'),
    'utf-8'
  );

  const seedSuccess = await executeSql(seedSql);
  if (!seedSuccess) {
    console.error('\n❌ Seed migration failed');
    process.exit(1);
  }

  console.log('✅ Seed migration completed\n');
  console.log('🎉 All migrations applied successfully!');
  console.log('📝 Visit http://localhost:5175/docs to see your articles');
}

main().catch(console.error);
