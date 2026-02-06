#!/bin/bash

# =============================================================================
# DEPLOY DATABASE MIGRATIONS
# =============================================================================
# This script deploys database migrations to Supabase projects.
# It can target production, staging, or local environments.
#
# Usage: ./scripts/deploy-migrations.sh <environment> [options]
#
# Environments:
#   production    Deploy to production (requires confirmation)
#   staging       Deploy to staging
#   local         Deploy to local Supabase (default)
#
# Options:
#   --status      Show migration status only
#   --list        List all migrations
#   --force       Skip confirmation prompts
#   --dry-run     Show what would be deployed without deploying
#
# Examples:
#   ./scripts/deploy-migrations.sh staging              # Deploy to staging
#   ./scripts/deploy-migrations.sh production           # Deploy to production
#   ./scripts/deploy-migrations.sh staging --status     # Check staging status
#   ./scripts/deploy-migrations.sh production --force   # Skip confirmation
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# =============================================================================
# Configuration
# =============================================================================
PRODUCTION_PROJECT_REF="ygdpgliavpxeugaajgrb"
STAGING_PROJECT_REF="caerqjzvuerejfrdtygb"

# =============================================================================
# Parse Arguments
# =============================================================================
ENVIRONMENT="${1:-local}"
shift 2>/dev/null || true

STATUS_ONLY=false
LIST_ONLY=false
FORCE=false
DRY_RUN=false

for arg in "$@"; do
    case $arg in
        --status)
            STATUS_ONLY=true
            ;;
        --list)
            LIST_ONLY=true
            ;;
        --force)
            FORCE=true
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
    esac
done

# =============================================================================
# Determine Target
# =============================================================================
case $ENVIRONMENT in
    production|prod)
        PROJECT_REF="$PRODUCTION_PROJECT_REF"
        ENV_NAME="PRODUCTION"
        ENV_COLOR="$RED"
        ;;
    staging|stage)
        PROJECT_REF="$STAGING_PROJECT_REF"
        ENV_NAME="STAGING"
        ENV_COLOR="$CYAN"
        ;;
    local|dev)
        PROJECT_REF=""
        ENV_NAME="LOCAL"
        ENV_COLOR="$GREEN"
        ;;
    *)
        echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
        echo ""
        echo "Usage: $0 <environment> [options]"
        echo ""
        echo "Environments: production, staging, local"
        echo "Options: --status, --list, --force, --dry-run"
        exit 1
        ;;
esac

# =============================================================================
# Remote DB Password (required for remote push/list on current Supabase CLI)
# =============================================================================
DB_PASSWORD=""
if [ -n "$PROJECT_REF" ]; then
    if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "stage" ]; then
        DB_PASSWORD="${SUPABASE_DB_PASSWORD_STAGING:-${SUPABASE_DB_PASSWORD:-}}"
    else
        DB_PASSWORD="${SUPABASE_DB_PASSWORD_PRODUCTION:-${SUPABASE_DB_PASSWORD:-}}"
    fi

    if [ -z "$DB_PASSWORD" ]; then
        echo -e "${RED}Missing database password for ${ENV_NAME}.${NC}"
        echo ""
        echo "Set one of these environment variables and re-run:"
        echo "  - SUPABASE_DB_PASSWORD (applies to both envs)"
        echo "  - SUPABASE_DB_PASSWORD_STAGING"
        echo "  - SUPABASE_DB_PASSWORD_PRODUCTION"
        echo ""
        echo "Example:"
        echo "  SUPABASE_DB_PASSWORD_STAGING='***' ./scripts/deploy-migrations.sh staging"
        exit 1
    fi
fi

# =============================================================================
# List Migrations
# =============================================================================
if [ "$LIST_ONLY" = true ]; then
    echo -e "${BLUE}Local migrations in supabase/migrations/:${NC}"
    echo ""
    ls -1 supabase/migrations/*.sql 2>/dev/null | xargs -n1 basename | tail -20
    echo ""
    TOTAL=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
    echo -e "Total: ${YELLOW}${TOTAL}${NC} migrations"
    exit 0
fi

# =============================================================================
# Show Status Only
# =============================================================================
if [ "$STATUS_ONLY" = true ]; then
    echo -e "${BLUE}Migration status for ${ENV_COLOR}${ENV_NAME}${NC}:${NC}"
    echo ""

    if [ -z "$PROJECT_REF" ]; then
        supabase migration list
    else
        # Link to target project and list remote migrations (Supabase CLI v2.65+)
        supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD" --yes >/dev/null
        supabase migration list --linked --password "$DB_PASSWORD" --yes
    fi
    exit 0
fi

# =============================================================================
# Header
# =============================================================================
echo ""
echo -e "${ENV_COLOR}=============================================${NC}"
echo -e "${ENV_COLOR}   DEPLOY MIGRATIONS (${ENV_NAME})${NC}"
echo -e "${ENV_COLOR}=============================================${NC}"
echo ""

if [ -n "$PROJECT_REF" ]; then
    echo -e "Project: ${YELLOW}${PROJECT_REF}${NC}"
fi

# =============================================================================
# Safety Check for Production
# =============================================================================
if [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "prod" ]; then
    echo ""
    echo -e "${RED}⚠️  WARNING: You are deploying to PRODUCTION!${NC}"
    echo -e "${RED}   This will modify the live database schema.${NC}"
    echo ""

    if [ "$FORCE" != true ]; then
        read -p "Type 'yes' to confirm production deployment: " CONFIRM
        if [ "$CONFIRM" != "yes" ]; then
            echo -e "${YELLOW}Deployment cancelled.${NC}"
            exit 0
        fi
    fi
fi

# =============================================================================
# Dry Run
# =============================================================================
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${YELLOW}DRY RUN - No changes will be made${NC}"
    echo ""
    echo -e "${BLUE}Pending migrations:${NC}"

    if [ -z "$PROJECT_REF" ]; then
        supabase migration list | grep -E "pending|not applied" || echo "No pending migrations"
    else
        supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD" --yes >/dev/null
        supabase db push --dry-run --linked --password "$DB_PASSWORD" --yes || true
    fi
    exit 0
fi

# =============================================================================
# Deploy Migrations
# =============================================================================
echo ""
echo -e "${BLUE}Checking migration status...${NC}"

if [ -z "$PROJECT_REF" ]; then
    # Local deployment
    echo -e "${BLUE}Pushing migrations to local database...${NC}"
    supabase db push
else
    # Remote deployment
    echo -e "${BLUE}Pushing migrations to remote database...${NC}"
    supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD" --yes >/dev/null
    supabase db push --linked --password "$DB_PASSWORD" --yes
fi

# =============================================================================
# Verification
# =============================================================================
echo ""
echo -e "${BLUE}Verifying migration status...${NC}"
echo ""

if [ -z "$PROJECT_REF" ]; then
    supabase migration list
else
    supabase migration list --linked --password "$DB_PASSWORD" --yes
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}   MIGRATION DEPLOYMENT COMPLETE!           ${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""

if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "stage" ]; then
    echo -e "${CYAN}Next steps:${NC}"
    echo -e "  1. Test the schema changes in staging"
    echo -e "  2. Deploy to production: ./scripts/deploy-migrations.sh production"
    echo ""
fi
