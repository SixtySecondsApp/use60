#!/bin/bash

# Deploy Async Recording Processing System
# This script deploys the new async architecture for handling long recordings

set -e  # Exit on error

PROJECT_REF="${1:-caerqjzvuerejfrdtygb}"  # Default to staging

echo "🚀 Deploying Async Recording Processing to project: $PROJECT_REF"
echo ""

# Step 1: Link to project and run database migration
echo "📊 Step 1: Linking to project and running database migration..."
supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true
supabase db push
echo "✅ Migration complete"
echo ""

# Step 2: Deploy process-gladia-webhook function
echo "📦 Step 2: Deploying process-gladia-webhook function..."
supabase functions deploy process-gladia-webhook \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt
echo "✅ process-gladia-webhook deployed"
echo ""

# Step 3: Deploy process-ai-analysis function
echo "📦 Step 3: Deploying process-ai-analysis function..."
supabase functions deploy process-ai-analysis \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt
echo "✅ process-ai-analysis deployed"
echo ""

# Step 4: Redeploy updated meetingbaas-webhook
echo "📦 Step 4: Redeploying meetingbaas-webhook with async changes..."
supabase functions deploy meetingbaas-webhook \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt
echo "✅ meetingbaas-webhook redeployed"
echo ""

echo "✨ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Test with a short recording (5 min) to verify the async flow"
echo "   2. Monitor function logs for any errors"
echo "   3. Check the Gladia dashboard for job status"
echo ""
echo "🔍 Webhook URLs:"
echo "   Gladia webhook: https://$PROJECT_REF.supabase.co/functions/v1/process-gladia-webhook"
echo "   MeetingBaaS webhook: https://$PROJECT_REF.supabase.co/functions/v1/meetingbaas-webhook"
echo ""
echo "🧪 To test the failed recording from earlier:"
echo "   It's stuck in 'processing' state with no S3 upload."
echo "   You'll need to manually trigger a new recording or use the"
echo "   MeetingBaaS URLs from the webhook (they expire after 4 hours)."
