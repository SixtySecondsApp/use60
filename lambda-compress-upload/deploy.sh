#!/bin/bash
set -euo pipefail

# Deploy Lambda Compress Upload function to AWS
# Usage: ./deploy.sh [create|update]
#   create - First time setup (ECR repo + Lambda function)
#   update - Update existing Lambda with new image

FUNCTION_NAME="use60-compress-upload"
ECR_REPO_NAME="use60-compress-upload"
REGION="eu-west-2"
MEMORY_SIZE=3072
TIMEOUT=900  # 15 minutes
EPHEMERAL_STORAGE=10240  # 10 GB
LAMBDA_ROLE_NAME="use60-lambda-compress-role"

ACTION="${1:-create}"

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_URI}/${ECR_REPO_NAME}:latest"

echo "=========================================="
echo "  Lambda Compress Upload - Deploy"
echo "=========================================="
echo "Account:  ${ACCOUNT_ID}"
echo "Region:   ${REGION}"
echo "Function: ${FUNCTION_NAME}"
echo "Action:   ${ACTION}"
echo "=========================================="

cd "$(dirname "$0")"

# Step 1: Create ECR repository (if create mode)
if [ "$ACTION" = "create" ]; then
  echo ""
  echo "[1/6] Creating ECR repository..."
  aws ecr create-repository \
    --repository-name "${ECR_REPO_NAME}" \
    --region "${REGION}" \
    --image-scanning-configuration scanOnPush=true \
    2>/dev/null || echo "  Repository already exists, skipping"
fi

# Step 2: Login to ECR
echo ""
echo "[2/6] Logging into ECR..."
aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ECR_URI}"

# Step 3: Build Docker image
echo ""
echo "[3/6] Building Docker image..."
docker build --platform linux/amd64 --provenance=false -t "${FUNCTION_NAME}" .

# Step 4: Tag and push to ECR
echo ""
echo "[4/6] Pushing to ECR..."
docker tag "${FUNCTION_NAME}:latest" "${IMAGE_URI}"
docker push "${IMAGE_URI}"

if [ "$ACTION" = "create" ]; then
  # Step 5a: Create IAM role for Lambda
  echo ""
  echo "[5/6] Creating IAM role..."

  ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}"

  # Check if role exists
  if aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" 2>/dev/null; then
    echo "  Role already exists"
    ROLE_ARN=$(aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" --query 'Role.Arn' --output text)
  else
    # Create trust policy
    TRUST_POLICY=$(cat <<'TRUST_EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
TRUST_EOF
)

    ROLE_ARN=$(aws iam create-role \
      --role-name "${LAMBDA_ROLE_NAME}" \
      --assume-role-policy-document "${TRUST_POLICY}" \
      --query 'Role.Arn' --output text)

    # Attach basic Lambda execution policy (CloudWatch logs)
    aws iam attach-role-policy \
      --role-name "${LAMBDA_ROLE_NAME}" \
      --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

    # Create and attach S3 write policy
    S3_POLICY=$(cat <<'S3_EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:CreateMultipartUpload",
        "s3:CompleteMultipartUpload"
      ],
      "Resource": "arn:aws:s3:::use60-application/meeting-recordings/*"
    }
  ]
}
S3_EOF
)

    aws iam put-role-policy \
      --role-name "${LAMBDA_ROLE_NAME}" \
      --policy-name "S3MeetingRecordingsWrite" \
      --policy-document "${S3_POLICY}"

    echo "  Role created: ${ROLE_ARN}"
    echo "  Waiting 10s for IAM propagation..."
    sleep 10
  fi

  # Step 6a: Create Lambda function
  echo ""
  echo "[6/6] Creating Lambda function..."
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
    --query 'FunctionArn' --output text)

  echo ""
  echo "=========================================="
  echo "  Lambda function created!"
  echo "=========================================="
  echo "  ARN: ${FUNCTION_ARN}"
  echo ""
  echo "  Set this as LAMBDA_COMPRESS_FUNCTION_ARN"
  echo "  in your Supabase edge function secrets."
  echo ""
  echo "  Also set COMPRESS_CALLBACK_SECRET to a"
  echo "  shared secret string in both:"
  echo "    - Supabase edge function secrets"
  echo "    - Lambda environment variables (optional,"
  echo "      it's passed in the payload)"
  echo "=========================================="

else
  # Step 5b: Update existing Lambda
  echo ""
  echo "[5/6] Updating Lambda function image..."
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --image-uri "${IMAGE_URI}" \
    --region "${REGION}" \
    > /dev/null

  echo ""
  echo "[6/6] Waiting for update to complete..."
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
