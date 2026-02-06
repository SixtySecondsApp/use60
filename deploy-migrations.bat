@echo off
REM Deploy migrations to staging Supabase database
REM Usage: deploy-migrations.bat

setlocal enabledelayedexpansion

echo 🔐 Deploying migrations to staging environment
echo.

REM Load environment variables from .env.staging
for /f "tokens=1,2 delims==" %%A in (.env.staging) do (
    set "%%A=%%B"
)

set PROJECT_ID=caerqjzvuerejfrdtygb
set HOST=db.%PROJECT_ID%.supabase.co

echo 📍 Project: %PROJECT_ID%
echo 📍 Host: %HOST%
echo.

REM Check if SUPABASE_DATABASE_PASSWORD is set
if "!SUPABASE_DATABASE_PASSWORD!"=="" (
    echo ❌ Error: SUPABASE_DATABASE_PASSWORD not found in .env.staging
    exit /b 1
)

echo ⏳ Connecting to staging database...
echo.

REM Create a temporary SQL file
set TEMP_SQL=%TEMP%\staging_deploy.sql

(
echo -- Migration 1: Create app_auth.is_admin^(^) function
echo CREATE SCHEMA IF NOT EXISTS app_auth;
echo.
echo CREATE OR REPLACE FUNCTION app_auth.is_admin^(^)
echo RETURNS boolean AS $$
echo BEGIN
echo   RETURN EXISTS ^(
echo     SELECT 1 FROM public.profiles
echo     WHERE id = auth.uid^(^)
echo     AND is_admin = true
echo   ^);
echo END;
echo $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
echo.
echo DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";
echo.
echo CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
echo FOR SELECT
echo USING ^(
echo   "public"."is_service_role"^(^)
echo   OR "app_auth"."is_admin"^(^)
echo   OR ^("public"."get_org_role"^("auth"."uid"^(^), "org_id"^) = ANY ^(ARRAY['owner'::text, 'admin'::text, 'member'::text, 'readonly'::text]^)^)
echo   OR ^("user_id" = "auth"."uid"^(^)^)
echo ^);
echo.
echo -- Migration 2: Fix member visibility RLS policy
echo DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";
echo.
echo CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
echo FOR SELECT
echo USING ^(
echo   "public"."is_service_role"^(^)
echo   OR "app_auth"."is_admin"^(^)
echo   OR ^("public"."get_org_role"^("auth"."uid"^(^), "org_id"^) IS NOT NULL^)
echo   OR ^("user_id" = "auth"."uid"^(^)^)
echo ^);
echo.
echo SELECT 'Migrations deployed successfully' as result;
) > "%TEMP_SQL%"

REM Run psql if available, otherwise show instructions
where psql >nul 2>nul
if %errorlevel% equ 0 (
    set PGPASSWORD=!SUPABASE_DATABASE_PASSWORD!
    psql -h %HOST% -U postgres -d postgres -p 5432 -f "%TEMP_SQL%"

    if !errorlevel! equ 0 (
        echo.
        echo ═══════════════════════════════════════════════════════════════════
        echo ✨ SUCCESS: Migrations deployed to staging!
        echo ═══════════════════════════════════════════════════════════════════
        echo.
        echo 🎉 Next steps:
        echo 1. Refresh your staging app: https://localhost:5175
        echo 2. Go to Organizations page
        echo 3. Verify:
        echo    ✓ Testing Software: 1 member + owner name
        echo    ✓ Sixty Seconds: 3 members + owner name
        echo.
        del "%TEMP_SQL%"
    ) else (
        echo.
        echo ❌ Deployment failed
        exit /b 1
    )
) else (
    echo ⚠️  PostgreSQL client (psql) not found on your system
    echo.
    echo To deploy the migrations, please:
    echo.
    echo Option 1: Install PostgreSQL client tools
    echo   - Download from: https://www.postgresql.org/download/windows/
    echo   - Add psql to your PATH
    echo   - Re-run this script
    echo.
    echo Option 2: Use Supabase Dashboard (recommended)
    echo   - Go to: https://app.supabase.com/projects/caerqjzvuerejfrdtygb/sql/new
    echo   - Click SQL Editor
    echo   - Paste the contents of: %TEMP_SQL%
    echo   - Click Execute
    echo.
    echo Option 3: Use Node.js script
    echo   - Run: node deploy-staging.mjs
    echo.
)

endlocal
