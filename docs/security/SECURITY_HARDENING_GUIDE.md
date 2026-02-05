# Security Hardening Guide for use60 AI Copilot & MCP

**Last Updated**: 2026-01-26
**Based On**: Clawdbot Security Analysis & Industry Best Practices

---

## Executive Summary

This guide addresses security vulnerabilities similar to those found in the Clawdbot analysis, where exposed AI agent control interfaces led to:
- Full credential theft (API keys, bot tokens, OAuth secrets)
- Complete conversation history exfiltration
- Active impersonation capabilities
- Perception manipulation attacks

**Our Response**: Defense-in-depth security architecture with multiple protection layers.

---

## 1. MCP Server Security Checklist

### MCP (Model Context Protocol) Overview

MCP servers provide additional capabilities to AI agents. If misconfigured, they can expose:
- File system access
- Database connections
- External API credentials
- User conversation history

### ✅ MCP Security Requirements

#### A. Network Isolation

- [ ] **Never expose MCP servers to public internet**
  - Run on `localhost` or private network only
  - Use firewall rules to block external access
  - If needed remotely, use VPN or SSH tunneling

- [ ] **Verify binding address**
  ```bash
  # Good (localhost only)
  mcp-server --host 127.0.0.1 --port 3000

  # Bad (all interfaces)
  mcp-server --host 0.0.0.0 --port 3000
  ```

- [ ] **Check for open ports**
  ```bash
  # Verify MCP server is NOT accessible externally
  nmap -p 1-65535 YOUR_PUBLIC_IP
  ```

#### B. Authentication & Authorization

- [ ] **Enable authentication on ALL MCP endpoints**
  - Use cryptographic tokens, not API keys
  - Rotate tokens every 90 days minimum
  - Never send tokens in URL parameters

- [ ] **Implement challenge-response authentication**
  - Similar to Clawdbot's device identity protocol
  - Verify client identity on each request
  - Reject localhost connections without proper auth

- [ ] **Configure trusted proxies properly**
  ```yaml
  # If behind reverse proxy (nginx, Caddy)
  trusted_proxies:
    - 127.0.0.1
    - ::1

  # Read X-Forwarded-For headers
  proxy_mode: true
  ```

#### C. Credential Management

- [ ] **Use secrets management system**
  - Supabase Vault for database credentials
  - Environment variables for API keys
  - Never hardcode credentials in code

- [ ] **Rotate credentials regularly**
  - API keys: Every 90 days
  - Database passwords: Every 180 days
  - Service role keys: Every 365 days

- [ ] **Audit credential access**
  ```sql
  -- Log every service role key usage
  SELECT * FROM public.security_audit_log
  WHERE operation = 'service_role_usage'
  ORDER BY occurred_at DESC;
  ```

#### D. Conversation History Protection

- [ ] **Treat conversation history as intelligence**
  - Enable strict RLS policies (user-only access)
  - Implement data retention policies
  - Log all conversation access attempts
  - Rate limit exports (max 10/hour)

- [ ] **Prevent bulk exfiltration**
  ```sql
  -- Automatically blocks excessive exports
  SELECT * FROM public.check_conversation_export_limit();
  ```

---

## 2. Row Level Security (RLS) Configuration

### Why RLS Matters

Without RLS, a compromised edge function with service role key = **full database access**.

With RLS, even compromised code is limited to **authenticated user's data**.

### Core RLS Principles

1. **Default Deny**: No policy = no access
2. **User Isolation**: `user_id = auth.uid()`
3. **Org-Level Sharing**: Configurable via `org_settings`
4. **Copilot Privacy**: ALWAYS user-only, never shared

### RLS Policy Template

```sql
-- User can see their own records
CREATE POLICY "table_select" ON public.my_table
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    -- Org sharing if enabled
    (
      is_crm_sharing_enabled()
      AND EXISTS (
        SELECT 1 FROM public.organization_memberships om1
        WHERE om1.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.organization_memberships om2
            WHERE om2.user_id = my_table.user_id
              AND om2.org_id = om1.org_id
          )
      )
    )
  );
```

### Testing RLS Policies

```bash
# Test as user (should see own data only)
curl -X GET https://YOUR_URL/api-copilot/conversations \
  -H "Authorization: Bearer $USER_JWT"

# Test cross-user access (should fail)
curl -X GET https://YOUR_URL/api-copilot/conversations/$OTHER_USER_CONVERSATION \
  -H "Authorization: Bearer $USER_JWT"
# Expected: Empty result or 403
```

---

## 3. Service Role Key Minimization

### The Risk

```typescript
// ❌ DANGEROUS: Service role bypasses ALL security
const client = createClient(url, SERVICE_ROLE_KEY)
const { data } = await client.from('copilot_conversations').select('*')
// Returns ALL users' conversations!
```

### The Fix

```typescript
// ✅ SAFE: User-scoped client respects RLS
const client = createClient(url, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${userJwt}` } }
})
const { data } = await client.from('copilot_conversations').select('*')
// Returns ONLY current user's conversations
```

### Service Role Justification Matrix

| Operation | User Client | Service Role | Justification |
|-----------|-------------|--------------|---------------|
| Query user's contacts | ✅ | ❌ | RLS allows via `auth.uid()` |
| Query user's copilot conversations | ✅ | ❌ | MUST enforce user isolation |
| Compile org-wide persona | ❌ | ✅ | Needs org `organization_skills` access |
| Cross-user team analytics | ❌ | ✅ | Needs org-wide data aggregation |
| Call edge function (service-to-service) | ❌ | ✅ | Edge function authentication |

### Implementation Guide

See: [`supabase/functions/api-copilot/SERVICE_ROLE_REFACTOR.md`](../supabase/functions/api-copilot/SERVICE_ROLE_REFACTOR.md)

---

## 4. Data Retention & Privacy

### GDPR Compliance

#### Right to Erasure (Art. 17)

```sql
-- User can delete their own conversations
SELECT public.delete_my_conversation('conversation-id');
```

#### Data Minimization (Art. 5)

```sql
-- Set automatic deletion after 365 days
SELECT public.set_conversation_retention('conversation-id', 365);
```

#### Access Logging (Art. 30)

```sql
-- All conversation access is logged
SELECT * FROM public.security_audit_log
WHERE operation = 'copilot_conversation_access'
  AND user_id = 'user-id'
ORDER BY occurred_at DESC;
```

### Automated Maintenance

```sql
-- Cron jobs (configured in migration)
-- Daily 2 AM: Archive conversations older than 1 year
-- Daily 3 AM: Delete expired conversations
```

---

## 5. Security Monitoring & Alerting

### Daily Monitoring Tasks

#### A. Check Security Health Score

```sql
SELECT * FROM public.get_security_health_score();
```

**Green (80-100)**: No action required
**Yellow (60-79)**: Review suspicious activity
**Red (<60)**: Investigate immediately

#### B. Detect Credential Harvesting

```sql
SELECT * FROM public.detect_credential_harvesting();
```

**Alert if**: >50 accesses in 1 hour by single user

#### C. Detect Conversation Exfiltration

```sql
SELECT * FROM public.detect_conversation_exfiltration();
```

**Alert if**: >5 exports in 10 minutes by single user

#### D. Check Missing RLS Policies

```sql
SELECT * FROM public.check_missing_rls_policies()
WHERE severity = 'critical';
```

**Alert if**: Any critical results

### Slack Alerting (To Implement)

```typescript
// supabase/functions/security-alert-handler/index.ts
// Triggered by critical security events
// Sends to org's security channel
```

---

## 6. Incident Response Plan

### Severity Levels

| Level | Response Time | Actions |
|-------|---------------|---------|
| **Critical** | Immediate | Disable affected user, investigate, notify security team |
| **High** | 1 hour | Monitor user, review logs, escalate if continues |
| **Medium** | 4 hours | Log for analysis, monitor trends |
| **Low** | 24 hours | Review in weekly security meeting |

### Critical Event Checklist

#### 1. Credential Harvesting Detected

- [ ] Disable affected user's access immediately
- [ ] Rotate all potentially exposed credentials
- [ ] Review audit logs for data exfiltration
- [ ] Notify org admins
- [ ] Document incident for compliance

#### 2. Conversation Exfiltration Detected

- [ ] Rate limit affected user (auto-applied)
- [ ] Review export logs
- [ ] Check for shared credentials (account takeover)
- [ ] Force password reset if suspicious
- [ ] Document incident

#### 3. Service Role Key Exposure

- [ ] **IMMEDIATE**: Rotate service role key in Supabase
- [ ] Update key in all environments (staging, production)
- [ ] Review all edge function deployments
- [ ] Audit database access logs
- [ ] Notify security team
- [ ] Document timeline and impact

#### 4. RLS Policy Bypass Detected

- [ ] Disable affected functionality
- [ ] Review policy definitions
- [ ] Test with multiple user accounts
- [ ] Deploy fix immediately
- [ ] Audit historical access
- [ ] Document vulnerability and fix

---

## 7. Configuration Checklist

### Production Deployment

- [ ] **RLS enabled on ALL tables**
  ```sql
  SELECT * FROM public.check_missing_rls_policies();
  ```

- [ ] **Service role minimization implemented**
  - User-scoped client as default
  - Service role usage documented and justified

- [ ] **Conversation protection enabled**
  - Strict user isolation (no org sharing)
  - Data retention policies configured
  - Export rate limiting active

- [ ] **Security monitoring active**
  - Daily health score checks
  - Anomaly detection running
  - Audit logs reviewed weekly

- [ ] **Secrets properly managed**
  - No hardcoded credentials
  - Environment variables used
  - Rotation schedule documented

### MCP Server Deployment (If Used)

- [ ] **Network isolation verified**
  - Bound to localhost only
  - Firewall rules configured
  - External access blocked

- [ ] **Authentication enabled**
  - Challenge-response active
  - Token rotation scheduled
  - Trusted proxies configured

- [ ] **Credential storage secure**
  - No plaintext secrets
  - Encrypted at rest
  - Access logged

---

## 8. Testing & Validation

### Security Test Suite

```bash
# 1. RLS enforcement test
npm run test:security:rls

# 2. Service role minimization test
npm run test:security:service-role

# 3. Conversation privacy test
npm run test:security:conversations

# 4. Rate limiting test
npm run test:security:rate-limits
```

### Manual Validation

```bash
# Test 1: User isolation
# Try to access another user's copilot conversation
curl -X GET "https://YOUR_URL/api-copilot/conversations/$OTHER_USER_ID" \
  -H "Authorization: Bearer $USER_JWT"
# Expected: Empty or 403

# Test 2: Export rate limit
# Try 11 exports in 1 hour
for i in {1..11}; do
  curl -X POST "https://YOUR_URL/api-copilot/export" \
    -H "Authorization: Bearer $USER_JWT"
done
# Expected: 11th request fails with rate limit error

# Test 3: Service role usage audit
curl -X GET "https://YOUR_URL/api-copilot/audit/service-role" \
  -H "Authorization: Bearer $ADMIN_JWT"
# Expected: List of justified service role usages
```

---

## 9. Credential Rotation Procedures

### Service Role Key Rotation

**Frequency**: Annually or immediately if exposed

1. Generate new service role key in Supabase Dashboard
2. Update staging environment: `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy and test staging
4. Update production environment
5. Verify production functionality
6. Revoke old key in Supabase
7. Document rotation in security log

### API Key Rotation (Gemini, OpenAI, etc.)

**Frequency**: Quarterly

1. Generate new key in provider dashboard
2. Test new key in staging
3. Update production secrets
4. Monitor for errors (24h grace period with old key)
5. Revoke old key
6. Update documentation

### OAuth Token Refresh

**Frequency**: Automatic (handled by integration)

Monitor for refresh failures:
```sql
SELECT * FROM public.security_audit_log
WHERE operation LIKE '%oauth%'
  AND severity IN ('warning', 'critical')
ORDER BY occurred_at DESC;
```

---

## 10. Security Best Practices Summary

### ✅ Always Do

1. **Default Deny**: No policy = no access
2. **User-Scoped**: Use user client by default
3. **Audit Everything**: Log all sensitive operations
4. **Test RLS**: Verify policies work as expected
5. **Monitor Actively**: Review security dashboard daily
6. **Rotate Regularly**: Follow credential rotation schedule
7. **Document Incidents**: Track and learn from security events

### ❌ Never Do

1. **Never expose MCP servers to internet**
2. **Never use service role without justification**
3. **Never disable RLS "temporarily"**
4. **Never hardcode credentials**
5. **Never skip security testing before deployment**
6. **Never ignore security alerts**
7. **Never share copilot conversations across users**

---

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [Clawdbot Security Analysis](https://github.com/anthropics/clawdbot) (Original article)

---

**Questions or Security Concerns?**

Contact: security@use60.com
Incident Hotline: [To be configured]
