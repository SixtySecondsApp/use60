/**
 * Direct test of company-research skill execution
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const envContent = fs.readFileSync('.env.staging', 'utf8');
const env = dotenv.parse(envContent);

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_ORG_ID = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
const TEST_DOMAIN = 'conturae.com';

async function testSkill() {
  console.log('🧪 Testing company-research skill execution\n');

  // Import the skill executor
  const agentSkillExecutorPath = './supabase/functions/_shared/agentSkillExecutor.ts';
  console.log(`Importing from: ${agentSkillExecutorPath}`);

  try {
    const { executeAgentSkillWithContract } = await import('../' + agentSkillExecutorPath);

    console.log('✅ Import successful\n');
    console.log('📝 Executing skill with:');
    console.log(`   Organization: ${TEST_ORG_ID}`);
    console.log(`   Domain: ${TEST_DOMAIN}\n`);

    const skillInput = {
      company_website: TEST_DOMAIN,
      company_name: 'Conturae',
    };

    const result = await executeAgentSkillWithContract(supabase, {
      organizationId: TEST_ORG_ID,
      userId: null,
      skillKey: 'company-research',
      context: skillInput,
      dryRun: false,
    });

    console.log('📊 Skill execution result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Has outputs: ${!!result.outputs}`);

    if (result.status === 'failed') {
      console.error('\n❌ Skill execution failed:');
      console.error(result.error);
      process.exit(1);
    }

    if (result.outputs) {
      console.log('\n✅ Skill execution successful!');
      console.log('\nOutput fields:');
      console.log(JSON.stringify(result.outputs, null, 2));
    } else {
      console.log('\n⚠️ No outputs returned');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testSkill();
