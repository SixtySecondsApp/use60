Ops Intelligence Platform - Human Testing Brief                                            
                                                                                         
  Overview                                                                                   
                                                                                       
  This brief guides you through testing the 6-layer AI-powered ops intelligence system built 
  on top of the existing Query Commander. The platform enables chained workflows, proactive  
  insights, cross-table queries, saved recipes, conversational context, and predictive       
  actions. Total test time: ~30-45 minutes.                                            
                                               
  Prerequisites                                                                              

  - Environment: Staging (npm run dev:staging)
  - URL: localhost:5175 (staging mode)
  - Required: At least one ops table with HubSpot contacts synced
  - Login: Use your staging admin credentials

  Test Flow (6 Layers)

  Layer 1: Chained Workflows (5 min)

  Setup: Navigate to any ops table detail page.

  Test Workflow Creation:
  1. Click the "Workflows" button in the toolbar (should appear next to the query bar)
  2. The WorkflowBuilder panel should open on the right
  3. Type a natural language workflow: "When a contact is added, if they're from a law firm,
  assign to territory and send Slack alert"
  4. Click "Parse Workflow" - you should see vertical pipeline cards showing each step
  5. Verify the steps display: condition → action for each part
  6. Each step should be draggable and have a toggle switch

  Test Trigger Configuration:
  1. Open the trigger selector dropdown
  2. Verify options: Manual, On Sync, On Cell Change, On Schedule
  3. Select "On Sync"
  4. Click "Save Workflow" and name it "Law Firm Alert"
  5. Close the builder

  Test Workflow List:
  1. Click "Workflows" button again - should show the workflow list
  2. Verify your saved workflow appears with:
    - Name, trigger badge, step count, last run timestamp
    - Action buttons: Run Now, Edit, Toggle Active, Delete
  3. Click "Run Now" - execution status should update in real-time
  4. Click "Toggle Active" - should disable the workflow (gray state)

  Expected Results: Workflow creation, parsing, saving, and manual execution all work
  smoothly. UI is responsive and shows real-time status updates.

  ---
  Layer 2: Proactive Intelligence (8 min)

  Test Insights Banner:
  1. On the ops table detail page, look for the AiInsightsBanner between the query bar and
  the table
  2. If no insights exist, trigger a HubSpot sync to generate them
  3. Insights should appear as cards with:
    - Severity-colored left border (blue/amber/red)
    - Emoji icon prefix
    - Conversational title with specific counts (e.g., "🔥 3 new contacts appeared at Cooley
  LLP this week")
    - Action-oriented body text ending with a question (e.g., "Want me to map the org
  chart?")
    - Action buttons matching the suggestion

  Test Insight Types:
  1. Cluster Detection: Look for insights about multiple contacts at same company
  2. Stale Leads: Insights about contacts with no activity in X days
  3. Data Quality: Insights about columns with >30% empty values
  4. Conversion Patterns: Insights about timing and behavior patterns

  Test Insight Actions:
  1. Click an action button (e.g., "Apply Filter") - should execute the suggested action
  2. Click "Dismiss" on an insight - should animate out and disappear
  3. If >3 insights exist, banner should collapse to summary with expand chevron

  Expected Results: Insights display conversationally with specific data, not generic
  messages. Actions execute correctly. Slack notifications sent if configured.

  ---
  Layer 3: Cross-Table Intelligence (7 min)

  Test Cross-Table Query:
  1. In the AI query bar, type: "Show me contacts who attended meetings in the last 30 days"
  2. Submit - should see enriched columns appear with blue highlight (temporary)
  3. Verify meeting data appears in new columns
  4. Click "Keep" button on an enriched column - should persist to schema

  Test Comparison Mode:
  1. Type: "Show net-new contacts compared to Q4 Pipeline table"
  2. Should see a results panel showing matched vs unmatched breakdown
  3. Verify counts are accurate

  Test Meeting/Transcript References:
  1. Type: "Which contacts mentioned pricing in recent meetings?"
  2. Should see expandable inline cards with transcript excerpts
  3. Click to expand - should show relevant meeting snippets

  Expected Results: Cross-table queries work seamlessly. Enriched data displays correctly.
  Comparison logic is accurate. Meeting references are relevant.

  ---
  Layer 4: Recipes (5 min)

  Test Recipe Saving:
  1. Execute any successful query (e.g., "Filter to law firms")
  2. After execution, a bookmark icon should appear in the query bar
  3. Click it - quick-save dialog opens
  4. Name it "Law Firms Only" and select trigger: "One Shot"
  5. Save

  Test Recipe Library:
  1. Click the book icon in query bar - AiRecipeLibrary panel opens
  2. Verify 3 tabs: My Recipes, Shared, Auto-Run
  3. Your saved recipe should appear with:
    - Name, description, query preview, run count, last run timestamp
    - Buttons: Run Now, Edit, Share, Delete

  Test Recipe Execution:
  1. Click "Run Now" - query should execute without re-typing
  2. Verify run count increments
  3. Click "Share" toggle - recipe should move to Shared tab
  4. Test "Delete" with confirmation dialog

  Expected Results: Recipes save, execute, and share correctly. Library is organized and
  intuitive.

  ---
  Layer 5: Conversational Context (7 min)

  Test Multi-Turn Conversation:
  1. Type: "Show me all law firm contacts"
  2. Follow up: "Just the senior ones" (no re-stating context)
  3. Follow up: "How many were emailed this month?"
  4. Verify each query builds on previous context

  Test Chat Thread:
  1. Click the expand icon next to message count badge
  2. Scrollable chat history should appear (max 400px)
  3. Verify user queries and AI summaries display correctly
  4. Click "New Session" - should reset context and clear history

  Test External Actions in Conversation:
  1. After filtering: "Draft cold email for these contacts"
  2. Then: "Add to Instantly sequence 'Q1 Outreach'"
  3. Verify external actions execute within conversational flow

  Expected Results: Context persists across queries. Chat thread displays history. External
  integrations work conversationally.

  ---
  Layer 6: Predictive Actions (8 min)

  Test Prediction Cards:
  1. Look for prediction cards in the insights banner (purple accent)
  2. Should show confidence score badge (green >80%, yellow 50-80%, red <50%)
  3. Click to expand - reasoning text should explain the prediction

  Test Prediction Types:
  1. Going Dark: Accounts matching lost-deal patterns
  2. Likely to Convert: Contacts scored by engagement signals
  3. Optimal Timing: Best outreach timing based on org patterns
  4. Team Behavior: Org-wide behavioral insights (e.g., "Reps who call within 2hrs convert 6x
   more")

  Test Prediction Actions:
  1. Click suggested action button - should execute (e.g., prioritize call list)
  2. Click "Dismiss" - prediction should remove
  3. Verify behavioral patterns show sample size for credibility

  Expected Results: Predictions display with confidence scores, conversational reasoning, and
   org-wide context. Actions are relevant and execute correctly.

  ---
  Success Criteria

  ✅ All 6 layers functional and integrated
  ✅ UI is responsive with smooth animations
  ✅ Real-time updates work (execution status, insights)
  ✅ Conversational tone throughout (not generic AI)
  ✅ No console errors or broken features
  ✅ Integration with existing Query Commander seamless

  Report any issues with screenshots and steps to reproduce. Focus on acceptance criteria
  outlined above.