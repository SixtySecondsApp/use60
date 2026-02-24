#!/bin/bash
set -euo pipefail

# Deploy Lambda Transcribe function to AWS
# Usage: ./deploy.sh [create|update]
#   create - First time setup (ECR repo + Lambda function)
#   update - Update existing Lambda with new image

FUNCTION_NAME="use60-lambda-transcribe"
ECR_REPO_NAME="use60-lambda-transcribe"
REGION="eu-west-2"
MEMORY_SIZE=4096   # 4GB - WhisperX medium needs ~2.5GB
TIMEOUT=900        # 15 minutes
EPHEMERAL_STORAGE=5120  # 5GB for model + audio files
LAMBDA_ROLE_NAME="use60-lambda-compress-role"  # Reuse existing role

ACTION="${1:-create}"

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_URI}/${ECR_REPO_NAME}:latest"

echo "=========================================="
echo "  Lambda Transcribe - Deploy"
echo "=========================================="
echo "Account:  ${ACCOUNT_ID}"
echo "Region:   ${REGION}"
echo "Function: ${FUNCTION_NAME}"
echo "Memory:   ${MEMORY_SIZE}MB"
echo "Timeout:  ${TIMEOUT}s"
echo "Storage:  ${EPHEMERAL_STORAGE}MB"
echo "Action:   ${ACTION}"
echo "=========================================="

cd "$(dirname "$0")"

# Step 1: Create ECR repository (if create mode)
if [ "$ACTION" = "create" ]; then
  echo ""
  echo "[1/5] Creating ECR repository..."
  aws ecr create-repository \
    --repository-name "${ECR_REPO_NAME}" \
    --region "${REGION}" \
    --image-scanning-configuration scanOnPush=true \
    2>/dev/null || echo "  Repository already exists, skipping"
fi

# Step 2: Login to ECR
echo ""
echo "[2/5] Logging into ECR..."
aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ECR_URI}"

# Step 3: Build Docker image (NOTE: This will download ~1.5GB WhisperX model)
echo ""
echo "[3/5] Building Docker image (this may take a while on first build)..."
docker build --platform linux/amd64 --provenance=false -t "${FUNCTION_NAME}" .

# Step 4: Tag and push to ECR
echo ""
echo "[4/5] Pushing to ECR..."
docker tag "${FUNCTION_NAME}:latest" "${IMAGE_URI}"
docker push "${IMAGE_URI}"

if [ "$ACTION" = "create" ]; then
  # Get existing role ARN (reusing compress Lambda role)
  ROLE_ARN=$(aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" --query 'Role.Arn' --output text)

  # Step 5: Create Lambda function
  echo ""
  echo "[5/5] Creating Lambda function..."
  FUNCTION_ARN=$(aws lambda create-function \
    --function-name "${FUNCTION_NAME}" \
    --package-type Image \
    --code "ImageUri=${IMAGE_URI}" \
    --role "${ROLE_ARN}" \
    --memory-size "${MEMORY_SIZE}" \
    --timeout "${TIMEOUT}" \
    --ephemeral-storage "Size=${EPHEMERAL_STORAGE}" \
    --region "${REGION}" \
    --architectures x86_64 \
    --environment "Variables={HF_TOKEN=${HF_TOKEN:-}}" \
    --query 'FunctionArn' --output text)

  echo ""
  echo "=========================================="
  echo "  Lambda function created!"
  echo "=========================================="
  echo "  ARN: ${FUNCTION_ARN}"
  echo ""
  echo "  Required environment variables:"
  echo "    HF_TOKEN - HuggingFace token for pyannote"
  echo ""
  echo "  Set in Supabase edge function secrets:"
  echo "    LAMBDA_TRANSCRIBE_CALLBACK_SECRET"
  echo "    LAMBDA_TRANSCRIBE_FUNCTION_NAME=${FUNCTION_NAME}"
  echo "=========================================="

else
  # Step 5: Update existing Lambda
  echo ""
  echo "[5/5] Updating Lambda function image..."
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --image-uri "${IMAGE_URI}" \
    --region "${REGION}" \
    > /dev/null

  echo "Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "${FUNCTION_NAME}" \
    --region "${REGION}"

  FUNCTION_ARN=$(aws lambda get-function \
    --function-name "${FUNCTION_NAME}" \
    --query 'Configuration.FunctionArn' --output text)

  echo ""
  echo "=========================================="
  echo "  Lambda function updated!"
  echo "=========================================="
  echo "  ARN: ${FUNCTION_ARN}"
  echo "=========================================="
fi
