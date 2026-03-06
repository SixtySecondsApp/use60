# Progress Log -- HeyGen Phase 1: Avatar Creator + Personalized Video Outreach

## Architecture Decisions

- **Credential storage**: Follow Instantly pattern -- separate `heygen_org_credentials` table (service-role-only) + `heygen_avatars` for user-facing data
- **Shared client**: `_shared/heygen.ts` typed client (same pattern as `_shared/stripe.ts`)
- **Avatar storage**: `heygen_avatars` table stores HeyGen IDs, looks (JSONB array), voice_id, status
- **Video storage**: `heygen_videos` table links to campaign_links or dynamic_table_rows for prospect-level video tracking
- **Instantly integration**: Video URLs injected as `custom_variables` in push-to-instantly (existing pattern supports this)
- **Video status**: Webhook (primary) + polling (fallback) -- HeyGen supports callback_url on video generation

## HeyGen API Reference (Quick)

| Endpoint | Method | Purpose | Cost |
|----------|--------|---------|------|
| `/v2/photo_avatar/photo/generate` | POST | Generate AI photo | $1 |
| `/v2/photo_avatar/avatar_group/create` | POST | Create avatar group | Free |
| `/v2/photo_avatar/train` | POST | LORA training | $4 |
| `/v2/photo_avatar/look/generate` | POST | Generate new look | $1 |
| `/v2/photo_avatar/add_motion` | POST | Add motion to photo | $1 |
| `/v2/video/generate` | POST | Generate video | ~$0.017/sec (III) |
| `/v1/video_status.get` | GET | Check video status | Free |
| `/v2/avatars` | GET | List available avatars | Free |

## Dependency Graph

```
HG-001 (schema)
  |
  +---> HG-002 (shared client)  ---|
  |                                 |---> HG-004 (avatar creation) ---> HG-005 (status polling) ---|
  +---> HG-003 (admin edge fn)     |                                                               |
         |                          +---> HG-006 (voice selection) ----|                            |
         +---> HG-007 (settings UI) ----------------------------------|                            |
                                                                       |                            |
                                                                       +---> HG-008 (avatar wizard UI)
                                                                                    |
                                                                                    +---> HG-009 (video generation)
                                                                                              |
                                                                              +---------------+---------------+
                                                                              |                               |
                                                                    HG-010 (webhook)              HG-011 (outreach integration)
                                                                              |                               |
                                                                              +---------------+---------------+
                                                                                              |
                                                                                    HG-012 (ops + instantly)
                                                                                              |
                                                                                    HG-013 (outreach UI)
                                                                                              |
                                                                                    HG-014 (ops table UI)
```

## Parallel Execution Groups

- **Group A** (after HG-001): HG-002 + HG-003 in parallel
- **Group B** (after HG-002): HG-004 + HG-006 in parallel, HG-007 can start after HG-003
- **Group C** (after HG-009): HG-010 + HG-011 in parallel

---

## Session Log

(No sessions yet)
