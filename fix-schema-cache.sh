#!/bin/bash

# Fix Supabase schema cache for organizations table
# This script executes a SQL command via the Supabase SQL API

SUPABASE_URL="https://caerqjzvuerejfrdtygb.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko"

# SQL query to refresh schema cache
SQL_QUERY="COMMENT ON TABLE public.organizations IS 'Organizations - schema cache refresh 2026-02-04';"

# Execute via Supabase SQL API
curl -X POST "$SUPABASE_URL/rest/v1/rpc/sql_query" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$SQL_QUERY\"}" \
  2>&1

echo "Schema cache refresh completed"
