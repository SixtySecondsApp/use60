import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { generateDocEmbeddings } from './lib/generateDocEmbeddings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env file
config({ path: path.resolve(__dirname, '../.env') })

function parseArgs(args: string[]): {
  force: boolean
  slug: string | undefined
  dryRun: boolean
} {
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')

  const slugIndex = args.indexOf('--slug')
  const slug =
    slugIndex !== -1 && args[slugIndex + 1] ? args[slugIndex + 1] : undefined

  return { force, slug, dryRun }
}

async function main() {
  const args = process.argv.slice(2)
  const { force, slug, dryRun } = parseArgs(args)

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openAIKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl) {
    console.error('Error: SUPABASE_URL is not set in .env')
    process.exit(1)
  }

  if (!serviceRoleKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not set in .env')
    process.exit(1)
  }

  if (!openAIKey) {
    console.error('Error: OPENAI_API_KEY is not set in .env')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log('Docs Embedding Generator')
  console.log('========================')
  if (dryRun) console.log('[dry-run mode]')
  if (force) console.log('[force: regenerating all embeddings]')
  if (slug) console.log(`[filtering to slug: ${slug}]`)
  console.log()

  const slugFilter = slug ? [slug] : undefined

  try {
    const results = await generateDocEmbeddings(supabase, slugFilter, {
      force,
      dryRun,
    })

    if (results.length === 0) {
      console.log('No articles processed.')
      return
    }

    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      console.log('\nFailed articles:')
      failed.forEach((r) => {
        console.log(`  - ${r.articleSlug}: ${r.error}`)
      })
      process.exit(1)
    }
  } catch (err) {
    console.error(
      'Fatal error:',
      err instanceof Error ? err.message : String(err)
    )
    process.exit(1)
  }
}

main()
