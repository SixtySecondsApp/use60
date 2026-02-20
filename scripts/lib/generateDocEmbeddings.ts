import type { SupabaseClient } from '@supabase/supabase-js'

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 20
const CONTENT_TRUNCATE_CHARS = 8000

interface DocArticle {
  id: string
  slug: string
  title: string
  category: string
  content: string
  content_embedding: number[] | null
}

interface EmbeddingResult {
  articleSlug: string
  success: boolean
  error?: string
  skipped?: boolean
}

interface GenerateDocEmbeddingsOptions {
  force?: boolean
  dryRun?: boolean
}

async function callOpenAIEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${error}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }

  // Sort by index to maintain order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding)
}

function buildEmbeddingText(article: DocArticle): string {
  const truncatedContent = article.content.slice(0, CONTENT_TRUNCATE_CHARS)
  return `${article.title}: ${article.category} — ${truncatedContent}`
}

export async function generateSingleDocEmbedding(
  supabase: SupabaseClient,
  articleId: string
): Promise<EmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      articleSlug: articleId,
      success: false,
      error: 'OPENAI_API_KEY not set',
    }
  }

  const { data: article, error: fetchError } = await supabase
    .from('docs_articles')
    .select('id, slug, title, category, content, content_embedding')
    .eq('id', articleId)
    .eq('published', true)
    .maybeSingle()

  if (fetchError) {
    return {
      articleSlug: articleId,
      success: false,
      error: fetchError.message,
    }
  }

  if (!article) {
    return {
      articleSlug: articleId,
      success: false,
      error: 'Article not found or not published',
    }
  }

  const typedArticle = article as DocArticle

  try {
    const embeddingText = buildEmbeddingText(typedArticle)
    const [embedding] = await callOpenAIEmbeddings([embeddingText], apiKey)

    const { error: updateError } = await supabase
      .from('docs_articles')
      .update({ content_embedding: embedding })
      .eq('id', typedArticle.id)

    if (updateError) {
      return {
        articleSlug: typedArticle.slug,
        success: false,
        error: updateError.message,
      }
    }

    return { articleSlug: typedArticle.slug, success: true }
  } catch (err) {
    return {
      articleSlug: typedArticle.slug,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function generateDocEmbeddings(
  supabase: SupabaseClient,
  slugs?: string[],
  options: GenerateDocEmbeddingsOptions = {}
): Promise<EmbeddingResult[]> {
  const { force = false, dryRun = false } = options

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — skipping doc embedding generation')
    return []
  }

  // Build query
  let query = supabase
    .from('docs_articles')
    .select('id, slug, title, category, content, content_embedding')
    .eq('published', true)

  if (slugs && slugs.length > 0) {
    query = query.in('slug', slugs)
  }

  const { data: articles, error: fetchError } = await query

  if (fetchError) {
    throw new Error(`Failed to fetch docs_articles: ${fetchError.message}`)
  }

  if (!articles || articles.length === 0) {
    console.log('No published docs articles found.')
    return []
  }

  const typedArticles = articles as DocArticle[]

  // Filter out already-embedded articles unless force is set
  const articlesToProcess = force
    ? typedArticles
    : typedArticles.filter((a) => !a.content_embedding)

  const skippedArticles = typedArticles.filter(
    (a) => !force && a.content_embedding
  )

  const results: EmbeddingResult[] = skippedArticles.map((a) => ({
    articleSlug: a.slug,
    success: true,
    skipped: true,
  }))

  if (articlesToProcess.length === 0) {
    console.log(
      `All ${typedArticles.length} articles already have embeddings. Use --force to regenerate.`
    )
    return results
  }

  console.log(
    `Generating embeddings for ${articlesToProcess.length} article(s)${skippedArticles.length > 0 ? ` (skipping ${skippedArticles.length} already embedded)` : ''}...`
  )

  if (dryRun) {
    console.log('[dry-run] Would process:')
    articlesToProcess.forEach((a) => console.log(`  - ${a.slug}`))
    return results
  }

  // Process in batches
  for (let i = 0; i < articlesToProcess.length; i += BATCH_SIZE) {
    const batch = articlesToProcess.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(articlesToProcess.length / BATCH_SIZE)

    console.log(
      `  Batch ${batchNum}/${totalBatches}: ${batch.map((a) => a.slug).join(', ')}`
    )

    try {
      const embeddingTexts = batch.map(buildEmbeddingText)
      const embeddings = await callOpenAIEmbeddings(embeddingTexts, apiKey)

      for (let j = 0; j < batch.length; j++) {
        const article = batch[j]
        const embedding = embeddings[j]

        const { error: updateError } = await supabase
          .from('docs_articles')
          .update({ content_embedding: embedding })
          .eq('id', article.id)

        if (updateError) {
          console.error(
            `  Failed to save embedding for "${article.slug}": ${updateError.message}`
          )
          results.push({
            articleSlug: article.slug,
            success: false,
            error: updateError.message,
          })
        } else {
          results.push({ articleSlug: article.slug, success: true })
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`  Batch ${batchNum} failed: ${errorMessage}`)

      for (const article of batch) {
        results.push({
          articleSlug: article.slug,
          success: false,
          error: errorMessage,
        })
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < articlesToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  const succeeded = results.filter((r) => r.success && !r.skipped).length
  const failed = results.filter((r) => !r.success).length
  const skipped = results.filter((r) => r.skipped).length

  console.log(
    `\nDoc embeddings complete: ${succeeded} generated, ${skipped} skipped, ${failed} failed`
  )

  return results
}
