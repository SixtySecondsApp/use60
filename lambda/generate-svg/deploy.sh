#!/bin/bash
# Deploy generate-svg Lambda with Function URL
# Usage: GEMINI_API_KEY=AIza... ./deploy.sh
set -euo pipefail

FUNCTION_NAME="sixty-generate-svg"
RUNTIME="nodejs20.x"
REGION="${AWS_REGION:-eu-west-2}"
TIMEOUT=300
MEMORY=256
ROLE_NAME="${FUNCTION_NAME}-role"

echo "=== Deploying $FUNCTION_NAME to $REGION ==="

# --- 1. Create IAM role (idempotent) ---
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || true)

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "None" ]; then
  echo "Creating IAM role..."
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query 'Role.Arn' --output text)
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  echo "Waiting for role propagation..."
  sleep 10
fi

echo "Role ARN: $ROLE_ARN"

# --- 2. Package ---
echo "Packaging..."
cd "$(dirname "$0")"
zip -j /tmp/generate-svg.zip index.mjs

# --- 3. Create or update function ---
EXISTING=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || true)

if [ -z "$EXISTING" ]; then
  echo "Creating function..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --handler "index.handler" \
    --role "$ROLE_ARN" \
    --zip-file "fileb:///tmp/generate-svg.zip" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --region "$REGION" \
    --environment "Variables={GEMINI_API_KEY=${GEMINI_API_KEY:?Set GEMINI_API_KEY}}" \
    > /dev/null
else
  echo "Updating function..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb:///tmp/generate-svg.zip" \
    --region "$REGION" \
    > /dev/null

  # Wait for update to complete before changing config
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --handler "index.handler" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --region "$REGION" \
    --environment "Variables={GEMINI_API_KEY=${GEMINI_API_KEY:?Set GEMINI_API_KEY}}" \
    > /dev/null
fi

# --- 4. Create Function URL (idempotent) ---
FUNCTION_URL=$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'FunctionUrl' --output text 2>/dev/null || true)

if [ -z "$FUNCTION_URL" ] || [ "$FUNCTION_URL" = "None" ]; then
  echo "Creating Function URL..."
  FUNCTION_URL=$(aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["http://localhost:5173","http://localhost:5175","https://app.use60.com","https://use60.com","https://www.use60.com","https://staging.use60.com"],"AllowMethods":["POST","OPTIONS"],"AllowHeaders":["authorization","content-type","x-client-info","apikey"],"AllowCredentials":true}' \
    --region "$REGION" \
    --query 'FunctionUrl' --output text)

  # Allow public invocation
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "FunctionURLAllowPublicAccess" \
    --action "lambda:InvokeFunctionUrl" \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" \
    > /dev/null 2>&1 || true
fi

echo ""
echo "=== Deployed ==="
echo "Function URL: $FUNCTION_URL"
echo ""
echo "Add to your .env files:"
echo "  VITE_GENERATE_SVG_URL=$FUNCTION_URL"

rm -f /tmp/generate-svg.zip
