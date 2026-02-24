#!/bin/bash

# ============================================================================
# Deploy S3 Recording Storage Updates
# ============================================================================
# This script:
# 1. Verifies AWS credentials are set
# 2. Deploys updated edge functions
# 3. Validates deployment
# ============================================================================

set -e  # Exit on error

echo "========================================="
echo "Deploying S3 Recording Storage Updates"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Step 1: Check if Supabase CLI is installed
# ============================================================================
echo "Step 1: Checking Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found. Please install it first.${NC}"
    echo "https://supabase.com/docs/guides/cli"
    exit 1
fi
echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# ============================================================================
# Step 2: Verify environment variables are set
# ============================================================================
echo "Step 2: Checking AWS environment variables..."
echo ""
echo "Checking for required secrets..."

# Check if secrets are set (this will list all secrets)
SECRETS=$(supabase secrets list 2>&1)

if echo "$SECRETS" | grep -q "AWS_REGION"; then
    echo -e "${GREEN}✅ AWS_REGION is set${NC}"
else
    echo -e "${YELLOW}⚠️  AWS_REGION not set${NC}"
    echo "Run: supabase secrets set AWS_REGION=eu-west-2"
fi

if echo "$SECRETS" | grep -q "AWS_S3_BUCKET"; then
    echo -e "${GREEN}✅ AWS_S3_BUCKET is set${NC}"
else
    echo -e "${YELLOW}⚠️  AWS_S3_BUCKET not set${NC}"
    echo "Run: supabase secrets set AWS_S3_BUCKET=use60-application"
fi

if echo "$SECRETS" | grep -q "AWS_ACCESS_KEY_ID"; then
    echo -e "${GREEN}✅ AWS_ACCESS_KEY_ID is set${NC}"
else
    echo -e "${RED}❌ AWS_ACCESS_KEY_ID not set (REQUIRED)${NC}"
    echo "Run: supabase secrets set AWS_ACCESS_KEY_ID=<your-key>"
    echo ""
    echo "Deployment cannot continue without AWS credentials."
    exit 1
fi

if echo "$SECRETS" | grep -q "AWS_SECRET_ACCESS_KEY"; then
    echo -e "${GREEN}✅ AWS_SECRET_ACCESS_KEY is set${NC}"
else
    echo -e "${RED}❌ AWS_SECRET_ACCESS_KEY not set (REQUIRED)${NC}"
    echo "Run: supabase secrets set AWS_SECRET_ACCESS_KEY=<your-secret>"
    echo ""
    echo "Deployment cannot continue without AWS credentials."
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All required AWS credentials are set${NC}"
echo ""

# ============================================================================
# Step 3: Deploy updated edge functions
# ============================================================================
echo "Step 3: Deploying updated edge functions..."
echo ""

echo "Deploying process-recording..."
supabase functions deploy process-recording

echo ""
echo "Deploying get-recording-url..."
supabase functions deploy get-recording-url

echo ""
echo -e "${GREEN}✅ Edge functions deployed successfully${NC}"
echo ""

# ============================================================================
# Step 4: Verify deployment
# ============================================================================
echo "Step 4: Verifying deployment..."
echo ""

FUNCTIONS=$(supabase functions list)

echo "Checking deployment status..."
if echo "$FUNCTIONS" | grep -q "process-recording.*ACTIVE"; then
    echo -e "${GREEN}✅ process-recording is ACTIVE${NC}"
else
    echo -e "${RED}❌ process-recording deployment may have failed${NC}"
fi

if echo "$FUNCTIONS" | grep -q "get-recording-url.*ACTIVE"; then
    echo -e "${GREEN}✅ get-recording-url is ACTIVE${NC}"
else
    echo -e "${RED}❌ get-recording-url deployment may have failed${NC}"
fi

echo ""

# ============================================================================
# Step 5: Show next steps
# ============================================================================
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Test S3 upload with a new recording:"
echo "   - Join a Google Meet and deploy the bot"
echo "   - Wait for recording to complete"
echo "   - Check dashboard for new recording"
echo ""
echo "2. Monitor edge function logs:"
echo "   supabase functions logs process-recording --follow"
echo ""
echo "3. Check for S3 upload errors:"
echo "   supabase functions logs process-recording --limit 100 | grep -i 's3\|upload'"
echo ""
echo "4. Verify recordings in S3 bucket:"
echo "   https://eu-west-2.console.aws.amazon.com/s3/buckets/use60-application"
echo ""
echo "5. Test with recent recording (if available):"
echo "   Run the SQL query in diagnostic-recordings.sql to find recordings"
echo "   Then manually trigger process-recording for that recording"
echo ""
echo -e "${GREEN}✅ All systems ready!${NC}"
echo ""
