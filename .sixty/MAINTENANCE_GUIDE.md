# Post-Deployment Operations & Maintenance Guide

**Project**: use60 - Email Standardization Initiative
**Date**: 2026-02-03
**Purpose**: Operational procedures and maintenance tasks for production email system
**Audience**: Operations, Engineering, Support teams

---

## QUICK START FOR NEW TEAM MEMBERS

### Essential Background
- **Email System**: Sends 18 types of emails through standardized edge functions
- **Architecture**: Frontend → Edge Functions → AWS SES → email_logs table
- **Database**: Templates stored in `encharge_email_templates`, logs in `email_logs`
- **Authentication**: EDGE_FUNCTION_SECRET + Bearer token for all functions

### Key Files to Know
```
supabase/functions/              - All email functions
  ├── send-organization-invitation/   - Organization invites
  ├── send-removal-email/            - User removal notifications
  ├── encharge-send-email/           - Email dispatcher
  ├── waitlist-welcome-email/        - Waitlist onboarding
  └── [5 more functions...]          - Specialized email types

.sixty/                          - Documentation
  ├── EMAIL_VARIABLE_REFERENCE.md    - All email variables
  ├── EMAIL_ARCHITECTURE_GUIDE.md    - System architecture
  └── [deployment docs...]           - Guides and checklists

src/lib/services/                - Frontend services
  ├── invitationService.ts       - Sends org invitations
  └── waitlistAdminService.ts    - Manages waitlist
```

### Common Tasks

**Check email logs**:
```sql
SELECT * FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

**View email templates**:
```sql
SELECT template_name, template_type, is_active
FROM encharge_email_templates
ORDER BY template_name;
```

**Find failures**:
```sql
SELECT * FROM email_logs
WHERE status != 'sent'
ORDER BY created_at DESC
LIMIT 10;
```

---

## DAILY OPERATIONS

### Morning Checks (Start of Day)

**1. System Health Check** (5 minutes)
```sql
-- Check if email functions are working
SELECT COUNT(*) as total_sends,
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
       SUM(CASE WHEN status != 'sent' THEN 1 ELSE 0 END) as failed
FROM email_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Identify any errors
SELECT DISTINCT status
FROM email_logs
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**2. Performance Check** (5 minutes)
- [ ] Check monitoring dashboard
- [ ] Review error logs
- [ ] Verify email delivery rates
- [ ] Check database performance

**3. Alert Review** (5 minutes)
- [ ] Review any overnight alerts
- [ ] Check critical issues
- [ ] Verify escalations handled
- [ ] Plan day's priorities

### Midday Check (Lunch Time)

- [ ] Quick email delivery verification
- [ ] Check for any anomalies
- [ ] Verify system stability
- [ ] No action needed unless issues found

### Evening Check (End of Day)

- [ ] Review daily metrics
- [ ] Document any issues
- [ ] Verify overnight monitoring
- [ ] Prepare handoff for on-call

**Daily Operations Checklist**:
- [ ] ✅ System health verified
- [ ] ✅ No critical issues
- [ ] ✅ Email delivery normal
- [ ] ✅ Database healthy
- [ ] ✅ Monitoring working

---

## WEEKLY OPERATIONS

### Monday Morning (Weekly Review)

**1. Performance Review** (30 minutes)
```sql
-- Weekly email stats
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_sends,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

**2. Issue Review** (30 minutes)
- [ ] Review all issues from past week
- [ ] Categorize by type
- [ ] Document patterns
- [ ] Plan resolutions
- [ ] Update documentation if needed

**3. Template Performance** (15 minutes)
```sql
-- Which email types are sent most
SELECT
  email_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY email_type
ORDER BY total DESC;
```

**4. Team Sync** (30 minutes)
- [ ] Discuss week ahead
- [ ] Review any planned changes
- [ ] Coordinate on-call coverage
- [ ] Address team questions

### Wednesday (Mid-Week Check)

- [ ] Verify all systems stable
- [ ] No critical issues emerging
- [ ] Database size normal
- [ ] Performance metrics good

### Friday (Week End)

**1. Weekly Metrics Summary** (30 minutes)
- [ ] Total emails sent
- [ ] Success rate
- [ ] Error patterns
- [ ] Performance metrics
- [ ] Any trends observed

**2. Planning for Next Week** (30 minutes)
- [ ] Any scheduled maintenance?
- [ ] Template updates needed?
- [ ] Optimizations planned?
- [ ] On-call coverage confirmed?

**Weekly Operations Checklist**:
- [ ] ✅ Performance metrics reviewed
- [ ] ✅ Issues analyzed and documented
- [ ] ✅ Templates performing well
- [ ] ✅ No critical issues
- [ ] ✅ Team coordinated

---

## MONTHLY OPERATIONS

### First Monday of Month (Monthly Review)

**1. Comprehensive Performance Analysis** (1 hour)
```sql
-- Monthly stats by email type
SELECT
  email_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))), 2) as avg_delivery_time_seconds
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 month'
GROUP BY email_type
ORDER BY total DESC;
```

**2. Issue Trend Analysis** (45 minutes)
- [ ] Review all issues from past month
- [ ] Identify patterns
- [ ] Document root causes
- [ ] Plan permanent fixes
- [ ] Update runbooks as needed

**3. Database Health** (30 minutes)
```sql
-- Database size and performance
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename IN ('email_logs', 'encharge_email_templates')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Recent slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%email%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**4. Capacity Planning** (30 minutes)
- [ ] Database growth rate
- [ ] Email volume trends
- [ ] Storage needs
- [ ] Performance needs
- [ ] Scaling requirements

**5. Team Retrospective** (1 hour)
- [ ] What went well?
- [ ] What could improve?
- [ ] Any process improvements?
- [ ] Team feedback on operations?
- [ ] Plan improvements for next month

**6. Executive Report** (30 minutes)
- [ ] Email delivery statistics
- [ ] System reliability
- [ ] Issues and resolutions
- [ ] Performance metrics
- [ ] Any business impact

**Monthly Operations Checklist**:
- [ ] ✅ Performance analysis complete
- [ ] ✅ Issues categorized and planned
- [ ] ✅ Database health verified
- [ ] ✅ Capacity planning done
- [ ] ✅ Team feedback collected
- [ ] ✅ Executive report prepared

---

## MAINTENANCE TASKS

### Template Updates

**How to Add a New Email Template**:

1. **Create the template in database**:
```sql
INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  is_active,
  variables
) VALUES (
  'new_email_type',
  'new_email_type',
  'Subject here',
  '<p>HTML content with {{variables}}</p>',
  'Text content with {{variables}}',
  TRUE,
  '[{"name": "recipient_name"}, {"name": "action_url"}]'::jsonb
)
ON CONFLICT (template_name) DO UPDATE
SET subject_line = EXCLUDED.subject_line,
    html_body = EXCLUDED.html_body,
    text_body = EXCLUDED.text_body,
    updated_at = NOW();
```

2. **Test the template**:
   - Send test email using the template
   - Verify content renders correctly
   - Check variables substituted properly
   - Verify database logging works

3. **Update documentation**:
   - Add to EMAIL_VARIABLE_REFERENCE.md
   - Add to email type list
   - Document required variables
   - Document any special considerations

**Best Practices**:
- ✅ Always include both HTML and text versions
- ✅ Test variables are substituted correctly
- ✅ Use standardized variable names
- ✅ Keep templates under 100KB
- ✅ Document new templates

### Template Updates Without Code Deployment

**Advantage**: Templates can be updated without deploying code

1. **Update existing template**:
```sql
UPDATE encharge_email_templates
SET html_body = '<p>Updated content</p>',
    updated_at = NOW()
WHERE template_name = 'organization_invitation';
```

2. **Verify update**:
   - Select template and verify content
   - Send test email
   - Verify changes applied

3. **Document change**:
   - Who made the change
   - When it was made
   - Why it was made
   - What was changed

### Function Updates

**How to Update an Email Function**:

1. **Make code changes** in `supabase/functions/[function-name]/index.ts`
2. **Test locally**: `npm run dev`
3. **Run tests**: `npm run test`
4. **Deploy to staging**: Verify in staging first
5. **Test in staging**: Send test emails
6. **Deploy to production**: Deploy to production
7. **Monitor**: Watch logs for issues

### Database Maintenance

**Weekly Maintenance**:
```sql
-- Vacuum email_logs (reclaim space)
VACUUM ANALYZE email_logs;

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('email_logs'));
```

**Monthly Maintenance**:
```sql
-- Archive old logs (keep last 90 days)
DELETE FROM email_logs
WHERE created_at < NOW() - INTERVAL '90 days';

-- Reindex tables for performance
REINDEX TABLE email_logs;
REINDEX TABLE encharge_email_templates;
```

**Quarterly Maintenance**:
- [ ] Full database backup and restore test
- [ ] Performance optimization review
- [ ] Index analysis and optimization
- [ ] Query performance analysis

---

## TROUBLESHOOTING GUIDE

### Common Issues & Solutions

#### Issue 1: Email Not Sending

**Symptoms**: emails_logs shows 'failed' status

**Diagnostics**:
```sql
-- Check for failures
SELECT * FROM email_logs
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 hour';

-- Check error details
SELECT metadata->>'error' as error_message
FROM email_logs
WHERE status = 'failed'
LIMIT 5;
```

**Common Causes & Solutions**:
1. **EDGE_FUNCTION_SECRET not configured**
   - Solution: Set environment variable
   - Verify: Check function logs

2. **Template doesn't exist**
   - Solution: Create missing template
   - Verify: Query encharge_email_templates

3. **AWS SES credentials invalid**
   - Solution: Verify AWS credentials
   - Verify: Test AWS SES directly

4. **Missing required variables**
   - Solution: Provide all required variables
   - Verify: Check template variables

#### Issue 2: High Email Delivery Latency

**Symptoms**: Emails taking > 5 seconds to send

**Diagnostics**:
```sql
-- Check send times
SELECT
  email_type,
  EXTRACT(EPOCH FROM (updated_at - created_at)) as delivery_time_seconds,
  created_at
FROM email_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY delivery_time_seconds DESC
LIMIT 10;
```

**Common Causes & Solutions**:
1. **AWS SES rate limiting**
   - Solution: Implement exponential backoff
   - Verify: Check AWS SES metrics

2. **Database connection slow**
   - Solution: Check database performance
   - Verify: Run ANALYZE on tables

3. **Supabase latency**
   - Solution: Check Supabase status
   - Verify: Monitor network latency

#### Issue 3: Database Connection Errors

**Symptoms**: "Connection refused" errors

**Diagnostics**:
```bash
# Test database connectivity
psql -h [host] -U [user] -d [database]

# Check database status
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = 'postgres';
```

**Common Causes & Solutions**:
1. **Supabase down**
   - Solution: Wait for Supabase recovery
   - Verify: Check Supabase status page

2. **Network issues**
   - Solution: Check firewall rules
   - Verify: Test network connectivity

3. **Connection pool exhausted**
   - Solution: Restart connections
   - Verify: Check active connections

#### Issue 4: Variable Substitution Failing

**Symptoms**: Email contains {{variable}} instead of value

**Diagnostics**:
```sql
-- Check template variables
SELECT template_name, variables
FROM encharge_email_templates
WHERE template_type = 'organization_invitation';

-- Check logged variables
SELECT metadata->>'variables' as sent_variables
FROM email_logs
WHERE email_type = 'organization_invitation'
LIMIT 1;
```

**Common Causes & Solutions**:
1. **Variable name mismatch**
   - Solution: Use exact variable names
   - Verify: Check template and sent variables

2. **Null/undefined variables**
   - Solution: Provide non-null values
   - Verify: Log variables before sending

3. **Template syntax error**
   - Solution: Fix Handlebars syntax
   - Verify: Test template rendering

### Advanced Troubleshooting

**Check Function Logs**:
```bash
# View function execution logs
tail -f supabase/functions/logs/[function-name].log

# Search for errors
grep -i error supabase/functions/logs/[function-name].log
```

**Check AWS SES Logs**:
- CloudWatch Logs for SES metrics
- Bounce/Complaint notifications
- Delivery failure reasons
- Rate limit information

**Enable Debug Logging**:
```typescript
// In email functions, add debug logging
console.log('[DEBUG] Variable substitution:', {
  template: template_name,
  variables: received_variables,
  result: substituted_content
});
```

---

## MONITORING & ALERTING

### Key Metrics to Monitor

**Real-Time Metrics**:
- Email delivery success rate (target: > 99%)
- Function response time (target: < 2s)
- Error rate (alert if > 1%)
- Active connections (alert if > 80)

**Daily Metrics**:
- Total emails sent
- Email types distribution
- Failure patterns
- Performance trends

**Weekly Metrics**:
- Delivery reliability
- User satisfaction
- Performance consistency
- Issue patterns

### Alert Configuration

**Critical Alerts** (Immediate Action Required):
- [ ] Email delivery < 90% for 10 minutes
- [ ] Database connection errors
- [ ] Function timeout errors
- [ ] AWS SES account issues

**Warning Alerts** (Monitor and Investigate):
- [ ] Email delivery 90-99%
- [ ] Response time > 5 seconds
- [ ] Error rate > 1%
- [ ] Database CPU > 80%

**Info Alerts** (Log and Review):
- [ ] Daily summary
- [ ] Weekly metrics
- [ ] Template statistics
- [ ] Performance trends

### Dashboard Setup

**Recommended Monitoring Tool**: Supabase Dashboard

**Key Dashboards**:
1. **Email System Health**
   - Delivery success rate
   - Function response times
   - Error rates by type
   - Recent failures

2. **Database Performance**
   - Query performance
   - Connection pool usage
   - Table sizes
   - Replication lag

3. **Business Metrics**
   - Emails sent by type
   - User engagement
   - Delivery trends
   - Revenue impact

---

## BACKUP & DISASTER RECOVERY

### Backup Strategy

**Daily Backups** ✅
- Supabase automatic backups (daily)
- Location: Supabase managed backup storage
- Retention: 30 days
- Recovery: < 1 hour

**Weekly Manual Backups** (Recommended)
```sql
-- Export templates for backup
\copy (SELECT * FROM encharge_email_templates) TO 'templates_backup.csv' WITH CSV HEADER;

-- Export recent logs (sample)
\copy (SELECT * FROM email_logs WHERE created_at > NOW() - INTERVAL '7 days') TO 'logs_backup.csv' WITH CSV HEADER;
```

**Monthly Full Backup**:
- [ ] Full database backup
- [ ] Test restore procedure
- [ ] Verify backup integrity
- [ ] Document backup details

### Disaster Recovery Procedure

**If Production Database Fails**:

1. **Declare Incident** (Immediately)
   - [ ] Notify on-call team
   - [ ] Start incident channel
   - [ ] Begin impact assessment

2. **Assess Damage** (5 minutes)
   - [ ] Check database status
   - [ ] Verify backup availability
   - [ ] Estimate data loss
   - [ ] Determine recovery time

3. **Execute Recovery** (15 minutes)
   - [ ] Restore from latest backup
   - [ ] Verify data integrity
   - [ ] Verify connectivity
   - [ ] Run test sends

4. **Resume Operations** (30 minutes)
   - [ ] Verify all functions working
   - [ ] Monitor for issues
   - [ ] Notify users
   - [ ] Begin root cause analysis

5. **Post-Incident** (Next day)
   - [ ] Complete incident report
   - [ ] Schedule post-mortem
   - [ ] Document lessons learned
   - [ ] Implement preventive measures

**Recovery Time Objective (RTO)**: 1 hour
**Recovery Point Objective (RPO)**: 1 hour

---

## PERFORMANCE OPTIMIZATION

### Database Optimization

**Query Performance**:
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%email%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyze query plans
EXPLAIN ANALYZE
SELECT * FROM email_logs
WHERE email_type = 'organization_invitation'
AND created_at > NOW() - INTERVAL '1 hour';
```

**Index Strategy**:
- [ ] Existing indexes: `idx_template_name`, `idx_template_type`
- [ ] Consider: `email_type_date` index for log queries
- [ ] Monitor: Unused indexes
- [ ] Optimize: Index fragmentation

### Function Performance

**Optimization Opportunities**:
1. **Connection Pooling**
   - Use Supabase connection pooling
   - Reduce connection overhead

2. **Caching**
   - Cache templates in memory
   - Reduce database queries

3. **Parallelization**
   - Send emails in parallel when possible
   - Batch operations

4. **Code Optimization**
   - Profile function execution
   - Optimize hotspots

### Cost Optimization

**AWS SES Optimization**:
- Monitor sending costs
- Implement bounce/complaint handling
- Optimize message size
- Use dedicated IP if volume > 10K/day

**Supabase Optimization**:
- Monitor database size
- Archive old logs quarterly
- Optimize queries
- Consider read replicas for scale

---

## SECURITY MAINTENANCE

### Security Updates

**Monthly Review**:
- [ ] Review access logs
- [ ] Check for unauthorized changes
- [ ] Audit environment variables
- [ ] Verify CORS headers
- [ ] Check RLS policies

**Quarterly Review**:
- [ ] Rotate secrets annually
- [ ] Review authentication method
- [ ] Audit database users
- [ ] Check encryption status
- [ ] Security penetration test

### Secret Rotation

**Procedure**:
1. Generate new EDGE_FUNCTION_SECRET
2. Update in environment variables
3. Deploy new version of functions
4. Monitor for errors
5. Confirm old secret no longer needed
6. Document change

**Schedule**: Every 6 months or when:
- [ ] Team member leaves
- [ ] Suspected compromise
- [ ] Major update deployed
- [ ] Security audit recommends

---

## TEAM PROCEDURES

### Onboarding New Team Members

**Week 1**:
- [ ] Review documentation
- [ ] Set up local development
- [ ] Deploy to staging
- [ ] Learn system architecture
- [ ] Understand monitoring

**Week 2**:
- [ ] Send test emails
- [ ] Monitor production
- [ ] On-call shadowing
- [ ] First production change
- [ ] Documentation updates

### Change Management

**For Any Email System Change**:
1. **Plan**: Document what, why, when
2. **Test**: Verify in staging
3. **Review**: Code review and approval
4. **Deploy**: Follow deployment checklist
5. **Monitor**: Watch for issues
6. **Document**: Update runbooks

### On-Call Rotation

**Responsibilities**:
- [ ] Monitor email system 24/7
- [ ] Respond to incidents
- [ ] Escalate critical issues
- [ ] Document problems
- [ ] Provide handoff

**On-Call Procedures**:
1. Check-in at start of shift
2. Review recent logs
3. Verify monitoring working
4. Update status in Slack
5. Respond to any alerts
6. Handoff to next person

---

## DOCUMENTATION UPDATES

### When to Update Documentation

- [ ] After any email system change
- [ ] When procedures change
- [ ] After incident resolution
- [ ] When new team members join
- [ ] Quarterly review and update

### Documentation Files

| File | Purpose | Update Frequency |
|------|---------|------------------|
| MAINTENANCE_GUIDE.md | Operations procedures | Quarterly |
| EMAIL_VARIABLE_REFERENCE.md | Variable documentation | When variables change |
| EMAIL_ARCHITECTURE_GUIDE.md | System architecture | Annually |
| PHASE_8_FINAL_VERIFICATION.md | Go-live reference | Reference only |
| GO_LIVE_CHECKLIST.md | Deployment procedures | Per deployment |

---

## SUPPORT CONTACTS

### Escalation Chain

1. **Support Engineer** (First Response)
2. **Engineering Team Lead** (Technical Issues)
3. **Operations Lead** (Infrastructure Issues)
4. **VP Engineering** (Critical Issues)

### Communication Channels

- **Slack**: #email-system
- **Email**: email-system@company.com
- **On-Call**: PagerDuty
- **Status**: status.company.com

---

## CONCLUSION

This maintenance guide ensures the email system operates reliably in production. Regular monitoring, proactive maintenance, and clear procedures enable rapid issue resolution and continuous improvement.

**Key Principles**:
- ✅ Proactive monitoring prevents issues
- ✅ Clear procedures ensure consistency
- ✅ Documentation enables self-service
- ✅ Regular reviews identify improvements

**Questions?** Refer to:
- Technical issues: EMAIL_ARCHITECTURE_GUIDE.md
- Variable questions: EMAIL_VARIABLE_REFERENCE.md
- Deployment questions: GO_LIVE_CHECKLIST.md
- Design questions: EMAIL_DESIGN_SYSTEM.md

---

**Guide Version**: 1.0
**Last Updated**: 2026-02-03
**Prepared By**: Claude Code (Automated Phase 8)
**Status**: ✅ PRODUCTION READY
