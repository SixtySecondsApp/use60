import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const BETTERCONTACT_FIELD_MAP: Record<string, string> = {
  email: 'contact_email_address',
  email_status: 'contact_email_address_status',
  phone: 'contact_phone_number',
  first_name: 'contact_first_name',
  last_name: 'contact_last_name',
  job_title: 'contact_job_title',
  gender: 'contact_gender',
  email_provider: 'email_provider',
};

export async function handleWebhook(req: Request): Promise<Response> {
  try {
    const payload = await req.json();
    console.log('[bettercontact-webhook] Received payload with status:', payload.status);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // The payload should have the same structure as GET /async/{id} response:
    // { id, status, credits_consumed, credits_left, summary, data: [...] }
    const requestId = payload.id;
    if (!requestId) {
      console.error('[bettercontact-webhook] No request ID in payload');
      return new Response(JSON.stringify({ error: 'Missing request ID' }), { status: 400 });
    }

    // Look up our tracking record
    const { data: bcRequest } = await serviceClient
      .from('bettercontact_requests')
      .select('id, organization_id, table_id, column_id, enrichment_job_id, enrich_email, enrich_phone, created_by')
      .eq('bettercontact_request_id', requestId)
      .maybeSingle();

    if (!bcRequest) {
      console.error('[bettercontact-webhook] Unknown request_id:', requestId);
      return new Response(JSON.stringify({ error: 'Unknown request_id' }), { status: 404 });
    }

    // Process results
    const results = payload.data || [];
    let processedCount = 0;
    let failedCount = 0;

    // Get the target column to know which property to extract
    const { data: targetCol } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, bettercontact_property_name')
      .eq('id', bcRequest.column_id)
      .maybeSingle();

    const propertyName = targetCol?.bettercontact_property_name || 'email';
    const fieldPath = BETTERCONTACT_FIELD_MAP[propertyName] || propertyName;

    for (const contact of results) {
      // Get row_id from custom_fields (we passed it when submitting)
      const rowId = contact.custom_fields?.row_id;
      if (!rowId) {
        console.warn('[bettercontact-webhook] Contact missing custom_fields.row_id, skipping');
        failedCount++;
        continue;
      }

      // Cache full response in source_data.bettercontact
      const { data: existingRow } = await serviceClient
        .from('dynamic_table_rows')
        .select('id, source_data')
        .eq('id', rowId)
        .maybeSingle();

      if (existingRow) {
        const updatedSourceData = {
          ...(existingRow.source_data || {}),
          bettercontact: contact,
        };

        await serviceClient
          .from('dynamic_table_rows')
          .update({ source_data: updatedSourceData })
          .eq('id', rowId);
      }

      // Extract target field value
      const value = contact[fieldPath] ?? null;
      const isEnriched = contact.enriched === true;

      // Upsert cell with result
      await serviceClient
        .from('dynamic_table_cells')
        .upsert({
          row_id: rowId,
          column_id: bcRequest.column_id,
          value: value ? String(value) : null,
          status: isEnriched && value ? 'complete' : 'failed',
          source: 'bettercontact',
          confidence: isEnriched ? 0.95 : 0,
          error_message: !isEnriched ? 'Not found by BetterContact' : null,
        }, { onConflict: 'row_id,column_id' });

      if (isEnriched && value) {
        processedCount++;
      } else {
        failedCount++;
      }
    }

    // Update enrichment_jobs
    if (bcRequest.enrichment_job_id) {
      await serviceClient
        .from('enrichment_jobs')
        .update({
          status: 'complete',
          processed_rows: processedCount,
          failed_rows: failedCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', bcRequest.enrichment_job_id);
    }

    // Update bettercontact_requests tracking
    await serviceClient
      .from('bettercontact_requests')
      .update({
        status: 'terminated',
        processed_contacts: processedCount + failedCount,
        credits_consumed: payload.credits_consumed || 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', bcRequest.id);

    console.log(`[bettercontact-webhook] Processed ${processedCount} contacts, ${failedCount} failed for request ${requestId}`);

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      failed: failedCount,
    }), { status: 200 });
  } catch (err: any) {
    console.error('[bettercontact-webhook] Error processing webhook:', err);
    return new Response(JSON.stringify({ error: err.message || 'Webhook processing failed' }), { status: 500 });
  }
}
