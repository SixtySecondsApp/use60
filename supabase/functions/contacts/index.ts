import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== 'contacts')
    let contactId = pathSegments[0]
    
    // Also check for id in query params (for compatibility)
    const queryId = url.searchParams.get('id')
    
    if (req.method === 'GET') {
      // Check if this is a single contact request
      if (queryId && !contactId) {
        // GET /contacts?id=xxx - Single contact (query param style)
        return await handleSingleContact(supabaseClient, queryId, url)
      } else if (contactId) {
        // GET /contacts/:id - Single contact (path style)
        return await handleSingleContact(supabaseClient, contactId, url)
      } else {
        // GET /contacts - List contacts
        return await handleContactsList(supabaseClient, url)
      }
    } else if (req.method === 'POST') {
      // POST /contacts - Create contact
      const body = await req.json()
      return await handleCreateContact(supabaseClient, body)
    } else if (req.method === 'PUT') {
      // PUT /contacts/:id - Update contact
      if (!contactId) {
        return new Response(JSON.stringify({ error: 'Contact ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const body = await req.json()
      return await handleUpdateContact(supabaseClient, contactId, body)
    } else if (req.method === 'DELETE') {
      // DELETE /contacts/:id - Delete contact
      if (!contactId) {
        return new Response(JSON.stringify({ error: 'Contact ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return await handleDeleteContact(supabaseClient, contactId)
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// List contacts
async function handleContactsList(supabaseClient: any, url: URL) {
  try {
    const includeCompany = url.searchParams.get('includeCompany') === 'true'
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const search = url.searchParams.get('search') || ''
    const companyId = url.searchParams.get('company_id') || ''
    const ownerId = url.searchParams.get('owner_id') || ''

    let query = supabaseClient
      .from('contacts')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    // Apply filters
    if (search) {
      // Validate and sanitize search term
      const sanitized = search.trim();
      if (!/^[a-zA-Z0-9\s\-_@.'"\(\)&\[\]]+$/.test(sanitized) || sanitized.length > 500) {
        return new Response(
          JSON.stringify({ error: 'Invalid search term' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      query = query.or(`first_name.ilike."%${sanitized}%",last_name.ilike."%${sanitized}%",full_name.ilike."%${sanitized}%",email.ilike."%${sanitized}%"`)
    }
    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }

    const { data: contacts, error, count } = await query

    if (error) {
      throw error
    }

    // If includeCompany is true, fetch companies for all contacts
    let enrichedContacts = contacts
    if (includeCompany && contacts && contacts.length > 0) {
      // Get unique company IDs
      const companyIds = [...new Set(contacts
        .filter(c => c.company_id)
        .map(c => c.company_id))]
      
      if (companyIds.length > 0) {
        // Fetch all companies at once
        const { data: companies, error: companiesError } = await supabaseClient
          .from('companies')
          .select('*')
          .in('id', companyIds)
        
        if (!companiesError && companies) {
          // Create a map for quick lookup
          const companiesMap = new Map(companies.map(c => [c.id, c]))
          
          // Enrich contacts with company data
          enrichedContacts = contacts.map(contact => ({
            ...contact,
            company: contact.company_id ? companiesMap.get(contact.company_id) : undefined
          }))
        }
      }
    }

    return new Response(JSON.stringify({
      data: enrichedContacts,
      count: count || 0,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: [],
      error: error.message,
      count: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Get single contact
async function handleSingleContact(supabaseClient: any, contactId: string, url?: URL) {
  try {
    const includeCompany = url?.searchParams.get('includeCompany') === 'true'
    
    // First get the contact
    const { data: contact, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (error) {
      throw error
    }

    if (!contact) {
      return new Response(JSON.stringify({ error: 'Contact not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // If includeCompany is true and contact has company_id, fetch the company
    if (includeCompany && contact.company_id) {
      const { data: company, error: companyError } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('id', contact.company_id)
        .single()
      
      if (!companyError && company) {
        // Add company data (using 'company' key as per updated frontend)
        contact.company = company
      }
    }

    return new Response(JSON.stringify({
      data: contact,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Create contact
async function handleCreateContact(supabaseClient: any, body: any) {
  try {
    const { data: contact, error } = await supabaseClient
      .from('contacts')
      .insert(body)
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: contact,
      error: null
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Update contact
async function handleUpdateContact(supabaseClient: any, contactId: string, body: any) {
  try {
    const { data: contact, error } = await supabaseClient
      .from('contacts')
      .update(body)
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: contact,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Delete contact
async function handleDeleteContact(supabaseClient: any, contactId: string) {
  try {
    const { error } = await supabaseClient
      .from('contacts')
      .delete()
      .eq('id', contactId)

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: { id: contactId },
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
} 