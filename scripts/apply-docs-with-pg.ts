import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use development database URL
const dbUrl = 'postgres://postgres.wbgmnyekgqklggilgqag:Gi7JO1tz2NupAzHt@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new Client({ connectionString: dbUrl });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Check if table exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'docs_articles'
      );
    `);

    if (checkResult.rows[0].exists) {
      console.log('✅ docs_articles table already exists');

      // Check for articles
      const articlesResult = await client.query(`
        SELECT id, title, published FROM docs_articles LIMIT 10;
      `);

      if (articlesResult.rows.length > 0) {
        console.log(`\n📚 Found ${articlesResult.rows.length} articles:\n`);
        articlesResult.rows.forEach((article: any) => {
          const status = article.published ? '✅' : '📝';
          console.log(`   ${status} ${article.title}`);
        });
        console.log(`\n🎉 All set! Visit http://localhost:5175/docs to see your articles`);
      } else {
        console.log('\n⚠️  No articles found, applying seed migration...\n');

        const seedSql = readFileSync(
          resolve(__dirname, '..', 'supabase', 'migrations', '20260206100001_seed_ops_intelligence_docs.sql'),
          'utf-8'
        );

        await client.query(seedSql);
        console.log('✅ Seed migration completed');
        console.log('🎉 Visit http://localhost:5175/docs to see your articles');
      }

      await client.end();
      return;
    }

    console.log('📄 Applying schema migration...\n');
    const schemaSql = readFileSync(
      resolve(__dirname, '..', 'supabase', 'migrations', '20260206100000_docs_cms_schema.sql'),
      'utf-8'
    );

    await client.query(schemaSql);
    console.log('✅ Schema migration completed\n');

    console.log('📄 Applying seed migration...\n');
    const seedSql = readFileSync(
      resolve(__dirname, '..', 'supabase', 'migrations', '20260206100001_seed_ops_intelligence_docs.sql'),
      'utf-8'
    );

    await client.query(seedSql);
    console.log('✅ Seed migration completed\n');

    console.log('🎉 All migrations applied successfully!');
    console.log('📝 Visit http://localhost:5175/docs to see your articles');

    await client.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

main();
