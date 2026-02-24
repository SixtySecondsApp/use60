#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg';

let testResults = [];
let errorCount = 0;
let successCount = 0;

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function recordTest(name, result, error = null) {
  const status = error ? 'FAILED' : 'PASSED';
  testResults.push({ name, status, error });
  if (error) {
    errorCount++;
    log(`❌ ${name}: ${error}`);
  } else {
    successCount++;
    log(`✓ ${name}: ${result}`);
  }
}

async function testConnection() {
  log('\n=== TEST 1: Supabase Connection ===');

  try {
    const serviceSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const anonSupabase = createClient(SUPABASE_URL, ANON_KEY);

    // Test service role connection
    const { data: serviceTest, error: serviceError } = await serviceSupabase
      .from('profiles')
      .select('count', { count: 'exact' });

    if (serviceError) {
      recordTest('Service Role Connection', null, `Service role error: ${serviceError.message}`);
    } else {
      recordTest('Service Role Connection', 'Connected successfully');
    }

    // Test anon connection
    const { data: anonTest, error: anonError } = await anonSupabase
      .from('profiles')
      .select('count', { count: 'exact' });

    if (anonError) {
      recordTest('Anon Key Connection', null, `Anon error: ${anonError.message}`);
    } else {
      recordTest('Anon Key Connection', 'Connected successfully');
    }

    return { serviceSupabase, anonSupabase };
  } catch (error) {
    recordTest('Connection Setup', null, error.message);
    throw error;
  }
}

async function testOrganizationInvitationsSchema(supabase) {
  log('\n=== TEST 2: Organization Invitations Schema ===');

  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('*')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      recordTest('Schema Access', null, `Error: ${error.message}`);
      return null;
    }

    recordTest('Schema Access', 'organization_invitations table exists');

    // Get column information by inspecting a real row
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      log('Table columns:', columns);
      recordTest('Column Discovery', `Found ${columns.length} columns: ${columns.join(', ')}`);
      return columns;
    } else {
      recordTest('Column Discovery', 'No data to inspect columns');
      return null;
    }
  } catch (error) {
    recordTest('Schema Discovery', null, error.message);
    return null;
  }
}

async function testInvitationData(supabase) {
  log('\n=== TEST 3: Invitation Data Retrieval ===');

  try {
    // Test 1: Count all invitations
    const { count: totalCount, error: countError } = await supabase
      .from('organization_invitations')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      recordTest('Total Invitations Count', `${totalCount} invitations exist`);
    } else {
      recordTest('Total Invitations Count', null, countError.message);
    }

    // Test 2: Get invitations by status
    const statuses = ['pending', 'accepted', 'expired', 'declined'];
    for (const status of statuses) {
      const { count, error } = await supabase
        .from('organization_invitations')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

      if (!error) {
        recordTest(`Invitations with status='${status}'`, `${count} found`);
      }
    }

    // Test 3: Get actual invitation data
    const { data: invitations, error: dataError } = await supabase
      .from('organization_invitations')
      .select('*')
      .limit(10);

    if (dataError) {
      recordTest('Retrieve Invitations', null, dataError.message);
      return null;
    }

    if (invitations && invitations.length > 0) {
      recordTest('Retrieve Recent Invitations', `Retrieved ${invitations.length} invitations`);
      log('\nFirst invitation (full data):');
      console.log(JSON.stringify(invitations[0], null, 2));

      return invitations;
    } else {
      recordTest('Retrieve Invitations', 'No invitations found');
      return [];
    }
  } catch (error) {
    recordTest('Invitation Data Retrieval', null, error.message);
    return null;
  }
}

async function testTokenValidation(supabase, invitations) {
  log('\n=== TEST 4: Token Validation ===');

  if (!invitations || invitations.length === 0) {
    log('No invitations to test tokens');
    recordTest('Token Validation', null, 'No invitations available');
    return;
  }

  try {
    // Check token fields
    const invitation = invitations[0];

    log('Checking token in first invitation:');
    log('token field:', invitation.token);
    log('token_hash field:', invitation.token_hash);

    // Test direct token query
    if (invitation.token) {
      const { data, error } = await supabase
        .from('organization_invitations')
        .select('id, email, token, status')
        .eq('token', invitation.token)
        .single();

      if (error) {
        recordTest('Direct Token Query', null, `Error: ${error.message}`);
      } else {
        recordTest('Direct Token Query', `Found invitation by token: ${data.email}`);
      }
    }

    // Test token format
    if (invitation.token) {
      const isHexFormat = /^[a-f0-9]{64}$/i.test(invitation.token);
      recordTest('Token Format Validation', isHexFormat ? 'Valid hex format (64 chars)' : `Invalid format: ${invitation.token}`);
    } else {
      recordTest('Token Format Validation', null, 'Token is NULL in database');
    }

    // Check for NULL tokens
    const { data: nullTokens, error: nullError } = await supabase
      .from('organization_invitations')
      .select('id, email, status', { count: 'exact', head: true })
      .is('token', null);

    if (!nullError) {
      recordTest('NULL Token Count', `${nullTokens ? 'Found invitations with NULL tokens' : 'No NULL tokens'}`);
    }
  } catch (error) {
    recordTest('Token Validation', null, error.message);
  }
}

async function testRLSPolicies(serviceSupabase, anonSupabase) {
  log('\n=== TEST 5: RLS Policy Testing ===');

  try {
    // Service role should have full access
    const { count: serviceCount, error: serviceError } = await serviceSupabase
      .from('organization_invitations')
      .select('*', { count: 'exact', head: true });

    if (serviceError) {
      recordTest('Service Role RLS', null, `Service role blocked: ${serviceError.message}`);
    } else {
      recordTest('Service Role RLS', `Service role can access ${serviceCount} invitations`);
    }

    // Anon key - check if restricted
    const { count: anonCount, error: anonError } = await anonSupabase
      .from('organization_invitations')
      .select('*', { count: 'exact', head: true });

    if (anonError) {
      recordTest('Anon Key RLS', `Correctly restricted: ${anonError.code} - ${anonError.message}`);
    } else {
      recordTest('Anon Key RLS', `Anon can access ${anonCount} invitations - SECURITY ISSUE?`);
    }
  } catch (error) {
    recordTest('RLS Policy Testing', null, error.message);
  }
}

async function testEmailTemplates(supabase) {
  log('\n=== TEST 6: Email Templates ===');

  try {
    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('id, name, template_type, subject')
      .limit(20);

    if (error) {
      recordTest('Email Templates Access', null, error.message);
      return;
    }

    recordTest('Email Templates Access', `Found ${templates ? templates.length : 0} templates`);

    if (templates && templates.length > 0) {
      // Look for invitation template
      const invitationTemplate = templates.find(t =>
        t.template_type === 'organization_invitation' ||
        t.name?.includes('invitation')
      );

      if (invitationTemplate) {
        recordTest('Organization Invitation Template', `Found: ${invitationTemplate.name}`);
      } else {
        recordTest('Organization Invitation Template', null, 'Template not found');
        log('Available templates:');
        templates.forEach(t => log(`  - ${t.name} (${t.template_type})`));
      }
    }
  } catch (error) {
    recordTest('Email Templates Test', null, error.message);
  }
}

async function testEdgeFunctionAccess(supabase) {
  log('\n=== TEST 7: Edge Function Configuration ===');

  try {
    // Check if edge function exists by checking the database
    const { data: functions, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .ilike('routine_name', '%organization%invitation%')
      .limit(20);

    recordTest('Edge Function Database Check', 'Checked for edge function references');
  } catch (error) {
    // This might fail due to schema access, which is expected
    recordTest('Edge Function Database Check', 'Skipped (schema access restricted)');
  }
}

async function testMagicLinkFlow(supabase, invitations) {
  log('\n=== TEST 8: Magic Link Flow Simulation ===');

  if (!invitations || invitations.length === 0) {
    recordTest('Magic Link Flow', null, 'No invitations to test');
    return;
  }

  try {
    const invitation = invitations[0];

    log('Testing with invitation:');
    log(`  Email: ${invitation.email}`);
    log(`  Token: ${invitation.token ? 'Present' : 'NULL'}`);
    log(`  Status: ${invitation.status}`);

    if (!invitation.token) {
      recordTest('Magic Link Token Present', null, 'Token is NULL - magic link cannot work');
      return;
    }

    // Simulate magic link lookup
    const { data: foundInvitation, error } = await supabase
      .from('organization_invitations')
      .select('*')
      .eq('token', invitation.token)
      .single();

    if (error) {
      recordTest('Magic Link Token Lookup', null, error.message);
    } else if (foundInvitation.status !== 'pending') {
      recordTest('Magic Link Status Check', null, `Invitation already ${foundInvitation.status}`);
    } else {
      recordTest('Magic Link Flow', 'Complete - valid pending invitation with token');
    }
  } catch (error) {
    recordTest('Magic Link Flow', null, error.message);
  }
}

async function testDirectSelectStatements(supabase) {
  log('\n=== TEST 9: Direct SELECT Statements ===');

  try {
    // Test 1: Basic select all
    const { data: all, error: allError } = await supabase
      .from('organization_invitations')
      .select('id, email, token, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (allError) {
      recordTest('Select All Invitations', null, allError.message);
    } else {
      recordTest('Select All Invitations', `Retrieved ${all.length} recent invitations`);
      log('Recent invitations:');
      all.forEach((inv, i) => {
        log(`  ${i + 1}. ${inv.email} - ${inv.status} (token: ${inv.token ? 'present' : 'NULL'})`);
      });
    }

    // Test 2: Select with WHERE clause
    const { data: pending, error: pendingError } = await supabase
      .from('organization_invitations')
      .select('*')
      .eq('status', 'pending')
      .limit(5);

    if (pendingError) {
      recordTest('Select Pending Invitations', null, pendingError.message);
    } else {
      recordTest('Select Pending Invitations', `Found ${pending.length} pending invitations`);
    }
  } catch (error) {
    recordTest('Direct SELECT Tests', null, error.message);
  }
}

async function testProfileCreationImpact(supabase) {
  log('\n=== TEST 10: Profile Creation Impact ===');

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, created_at')
      .limit(5);

    if (error) {
      recordTest('Profile Access', null, error.message);
      return;
    }

    recordTest('Profile Access', `Can access ${profiles.length} profiles`);

    // Check if profile emails match invitation emails
    const { data: invitations } = await supabase
      .from('organization_invitations')
      .select('email')
      .limit(5);

    if (invitations && profiles) {
      const profileEmails = new Set(profiles.map(p => p.email));
      const matchingInvitations = invitations.filter(inv => profileEmails.has(inv.email));
      recordTest('Profile-Invitation Overlap', `${matchingInvitations.length} invitations have matching profiles`);
    }
  } catch (error) {
    recordTest('Profile Creation Impact', null, error.message);
  }
}

async function testAuthenticationFlow(anonSupabase) {
  log('\n=== TEST 11: Authentication Flow ===');

  try {
    // Get current user (should be null for anon)
    const { data: { user }, error } = await anonSupabase.auth.getUser();

    if (error && error.status === 401) {
      recordTest('Anon Authentication', 'Correctly unauthenticated (401)');
    } else if (!user) {
      recordTest('Anon Authentication', 'No authenticated user (expected for anon)');
    } else {
      recordTest('Anon Authentication', `Unexpected user: ${user.email}`);
    }
  } catch (error) {
    recordTest('Authentication Flow', null, error.message);
  }
}

function generateReport() {
  log('\n\n=== DIAGNOSTIC TEST SUMMARY ===');
  log(`Total Tests: ${testResults.length}`);
  log(`Passed: ${successCount}`);
  log(`Failed: ${errorCount}`);
  log(`Success Rate: ${Math.round((successCount / testResults.length) * 100)}%`);

  console.log('\n=== DETAILED RESULTS ===');
  testResults.forEach((result, i) => {
    const icon = result.status === 'PASSED' ? '✓' : '✗';
    console.log(`${icon} ${result.name}: ${result.status}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  });

  return {
    summary: {
      total: testResults.length,
      passed: successCount,
      failed: errorCount,
      successRate: Math.round((successCount / testResults.length) * 100)
    },
    details: testResults
  };
}

async function main() {
  log('=== SUPABASE INVITATION DIAGNOSTIC TESTS ===');
  log(`URL: ${SUPABASE_URL}`);
  log(`Test started at: ${new Date().toISOString()}`);

  try {
    // Run all tests
    const { serviceSupabase, anonSupabase } = await testConnection();
    await testOrganizationInvitationsSchema(serviceSupabase);
    const invitations = await testInvitationData(serviceSupabase);
    await testTokenValidation(serviceSupabase, invitations);
    await testRLSPolicies(serviceSupabase, anonSupabase);
    await testEmailTemplates(serviceSupabase);
    await testEdgeFunctionAccess(serviceSupabase);
    await testMagicLinkFlow(serviceSupabase, invitations);
    await testDirectSelectStatements(serviceSupabase);
    await testProfileCreationImpact(serviceSupabase);
    await testAuthenticationFlow(anonSupabase);

    const report = generateReport();

    return report;
  } catch (error) {
    log('Fatal error during tests:', error);
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
