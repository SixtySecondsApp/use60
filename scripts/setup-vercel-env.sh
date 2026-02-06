#!/bin/bash
# Setup Vercel Environment Variables for Sentry Configuration
# This script adds VITE_ENVIRONMENT to control Sentry initialization

set -e

echo "🔧 Setting up Vercel environment variables..."
echo ""

echo "📋 Current environment variables:"
vercel env ls | grep -E "VITE_ENVIRONMENT|VITE_SENTRY"
echo ""

echo "➕ Adding VITE_ENVIRONMENT to each environment..."
echo ""

# Production
echo "Setting VITE_ENVIRONMENT=production for Production..."
echo "production" | vercel env add VITE_ENVIRONMENT production || echo "⚠️  Variable may already exist"

# Preview (Staging)
echo "Setting VITE_ENVIRONMENT=staging for Preview..."
echo "staging" | vercel env add VITE_ENVIRONMENT production || echo "⚠️  Variable may already exist"

# Development
echo "Setting VITE_ENVIRONMENT=development for Development..."
echo "development" | vercel env add VITE_ENVIRONMENT production || echo "⚠️  Variable may already exist"

echo ""
echo "✅ Environment variables setup complete!"
echo ""
echo "📝 Summary:"
echo "  - Production: VITE_ENVIRONMENT=production (Sentry ENABLED)"
echo "  - Preview: VITE_ENVIRONMENT=staging (Sentry DISABLED)"
echo "  - Development: VITE_ENVIRONMENT=development (Sentry DISABLED)"
echo ""
echo "⚠️  Note: You may want to remove VITE_SENTRY_ENABLED as it's no longer used:"
echo "  vercel env rm VITE_SENTRY_ENABLED"
echo ""
echo "🚀 Next steps:"
echo "  1. Redeploy to staging: git push origin staging"
echo "  2. Redeploy to production: git push origin main"
