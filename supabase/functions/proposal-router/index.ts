import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAssembleContext } from './handlers/assemble-context.ts'
import { handleComposeV2 } from './handlers/compose-v2.ts'
import { handleDeliver } from './handlers/deliver.ts'
import { handleEnrichDeal } from './handlers/enrich-deal.ts'
import { handleGenerateDocx } from './handlers/generate-docx.ts'
import { handleGeneratePdf } from './handlers/generate-pdf.ts'
import { handleParseDocument } from './handlers/parse-document.ts'
import { handlePipelineV2 } from './handlers/pipeline-v2.ts'
import { handleRenderGotenberg } from './handlers/render-gotenberg.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  assemble_context: handleAssembleContext,
  compose_v2: handleComposeV2,
  deliver: handleDeliver,
  enrich_deal: handleEnrichDeal,
  generate_docx: handleGenerateDocx,
  generate_pdf: handleGeneratePdf,
  parse_document: handleParseDocument,
  pipeline_v2: handlePipelineV2,
  render_gotenberg: handleRenderGotenberg,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const bodyText = await req.text()
    const body = JSON.parse(bodyText)
    const action = body.action as string | undefined

    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    // Re-create the request so the handler can read the body again
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    })

    return await HANDLERS[action](handlerReq)
  } catch (err) {
    console.error('[proposal-router] Fatal error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
