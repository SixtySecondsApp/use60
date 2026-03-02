import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

Deno.serve(async (req) => {
  try {
    // Create a Supabase client with the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get all profiles that don't have auth.users records
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, created_at, updated_at')
      .order('created_at')

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`)
    }

    console.log(`Found ${profiles.length} profiles`)

    // Get existing auth users to check which profiles need users
    const { data: { users: existingUsers }, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (usersError) {
      throw new Error(`Failed to list users: ${usersError.message}`)
    }

    const existingUserIds = new Set(existingUsers.map(u => u.id))
    const profilesToCreate = profiles.filter(p => !existingUserIds.has(p.id))

    console.log(`Need to create ${profilesToCreate.length} users`)

    // Temporarily delete the corresponding profiles to avoid conflict
    const results = []
    let successCount = 0
    let errorCount = 0

    for (const profile of profilesToCreate) {
      try {
        // Step 1: Delete the profile temporarily
        const { error: deleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', profile.id)

        if (deleteError) {
          console.error(`Failed to delete profile ${profile.email}:`, deleteError)
          results.push({ email: profile.email, status: 'error', error: deleteError.message })
          errorCount++
          continue
        }

        // Step 2: Create the auth user (this will auto-create the profile via trigger)
        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: profile.email,
          email_confirm: true,
          user_metadata: {
            full_name: profile.full_name || profile.email
          },
          password: 'TempPassword123!' // Users will need to reset
        })

        if (createError) {
          console.error(`Failed to create user ${profile.email}:`, createError)

          // Restore the profile if user creation failed
          await supabaseAdmin
            .from('profiles')
            .insert([{
              id: profile.id,
              email: profile.email,
              full_name: profile.full_name,
              created_at: profile.created_at,
              updated_at: profile.updated_at
            }])

          results.push({ email: profile.email, status: 'error', error: createError.message })
          errorCount++
          continue
        }

        // Step 3: Update the auto-created profile to match the original data
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: profile.full_name,
            created_at: profile.created_at,
            updated_at: profile.updated_at
          })
          .eq('id', userData.user.id)

        if (updateError) {
          console.error(`Failed to update profile ${profile.email}:`, updateError)
        }

        results.push({ email: profile.email, status: 'success', user_id: userData.user.id })
        successCount++

      } catch (error) {
        console.error(`Unexpected error for ${profile.email}:`, error)
        results.push({ email: profile.email, status: 'error', error: error.message })
        errorCount++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${successCount} users, ${errorCount} errors`,
        successCount,
        errorCount,
        totalProfiles: profiles.length,
        results
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
