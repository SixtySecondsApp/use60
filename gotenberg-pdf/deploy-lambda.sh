#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────
REGION="eu-west-2"
ACCOUNT_ID="733385949936"
FUNCTION_NAME="use60-gotenberg-pdf"
REPO_NAME="use60-gotenberg-pdf"
ROLE_NAME="use60-gotenberg-pdf-role"
IMAGE_TAG="latest"
MEMORY_MB=2048        # Chromium needs ≥1.5 GB
TIMEOUT_SEC=120       # 60s Gotenberg + cold-start buffer
ARCH="x86_64"

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

echo "==> Deploying Gotenberg PDF to AWS Lambda"
echo "    Region:   ${REGION}"
echo "    Function: ${FUNCTION_NAME}"
echo "    ECR:      ${ECR_URI}"
echo ""

# ── 1. Create ECR repository (idempotent) ─────────────────────────────
echo "==> Creating ECR repository..."
aws ecr create-repository \
  --repository-name "${REPO_NAME}" \
  --region "${REGION}" \
  --image-scanning-configuration scanOnPush=true \
  2>/dev/null || echo "    (repository already exists)"

# ── 2. Authenticate Docker to ECR ─────────────────────────────────────
echo "==> Logging in to ECR..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ── 3. Build the image ────────────────────────────────────────────────
echo "==> Building Docker image..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker build \
  --platform linux/amd64 \
  --provenance=false \
  -f "${SCRIPT_DIR}/Dockerfile.lambda" \
  -t "${REPO_NAME}:${IMAGE_TAG}" \
  "${SCRIPT_DIR}"

# ── 4. Tag & push to ECR ──────────────────────────────────────────────
echo "==> Pushing to ECR..."
docker tag "${REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:${IMAGE_TAG}"

# ── 5. Create IAM role (idempotent) ───────────────────────────────────
echo "==> Creating IAM execution role..."
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

aws iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }' \
  2>/dev/null || echo "    (role already exists)"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  2>/dev/null || true

# Wait for role propagation on first create
sleep 15

# ── 6. Create or update Lambda function ───────────────────────────────
echo "==> Creating/updating Lambda function..."
if aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${REGION}" &>/dev/null; then
  echo "    Updating existing function..."
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --image-uri "${ECR_URI}:${IMAGE_TAG}" \
    --region "${REGION}" \
    --output json > /dev/null

  # Wait for update to complete before changing config
  aws lambda wait function-updated --function-name "${FUNCTION_NAME}" --region "${REGION}"

  aws lambda update-function-configuration \
    --function-name "${FUNCTION_NAME}" \
    --memory-size "${MEMORY_MB}" \
    --timeout "${TIMEOUT_SEC}" \
    --environment '{"Variables":{"AWS_LWA_PORT":"3000","AWS_LWA_READINESS_CHECK_PATH":"/health","AWS_LWA_READINESS_CHECK_MIN_UNHEALTHY_STATUS":"500","AWS_LWA_INVOKE_MODE":"buffered"}}' \
    --region "${REGION}" \
    --output json > /dev/null
else
  echo "    Creating new function..."
  aws lambda create-function \
    --function-name "${FUNCTION_NAME}" \
    --package-type Image \
    --code "ImageUri=${ECR_URI}:${IMAGE_TAG}" \
    --role "${ROLE_ARN}" \
    --memory-size "${MEMORY_MB}" \
    --timeout "${TIMEOUT_SEC}" \
    --architectures "${ARCH}" \
    --environment '{"Variables":{"AWS_LWA_PORT":"3000","AWS_LWA_READINESS_CHECK_PATH":"/health","AWS_LWA_READINESS_CHECK_MIN_UNHEALTHY_STATUS":"500","AWS_LWA_INVOKE_MODE":"buffered"}}' \
    --region "${REGION}" \
    --output json > /dev/null

  echo "    Waiting for function to become active..."
  aws lambda wait function-active-v2 --function-name "${FUNCTION_NAME}" --region "${REGION}"
fi

# ── 7. Create Function URL (idempotent) ───────────────────────────────
echo "==> Creating Function URL..."
FUNC_URL=$(aws lambda get-function-url-config \
  --function-name "${FUNCTION_NAME}" \
  --region "${REGION}" \
  --query 'FunctionUrl' \
  --output text 2>/dev/null || true)

if [ -z "$FUNC_URL" ] || [ "$FUNC_URL" = "None" ]; then
  FUNC_URL=$(aws lambda create-function-url-config \
    --function-name "${FUNCTION_NAME}" \
    --auth-type NONE \
    --invoke-mode BUFFERED \
    --region "${REGION}" \
    --query 'FunctionUrl' \
    --output text)

  # Allow public invoke via Function URL
  aws lambda add-permission \
    --function-name "${FUNCTION_NAME}" \
    --statement-id "FunctionURLAllowPublicAccess" \
    --action "lambda:InvokeFunctionUrl" \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "${REGION}" \
    2>/dev/null || true
fi

echo ""
echo "==> Done! Gotenberg PDF Lambda deployed."
echo ""
echo "    Function URL: ${FUNC_URL}"
echo ""
echo "    Set this as GOTENBERG_URL in your Supabase edge function env:"
echo "    GOTENBERG_URL=${FUNC_URL}"
echo ""
echo "    Test health:"
echo "    curl ${FUNC_URL}health"
echo ""
echo "    Note: First invocation will cold-start (~15-30s)."
echo "    Consider adding Provisioned Concurrency if latency matters."
