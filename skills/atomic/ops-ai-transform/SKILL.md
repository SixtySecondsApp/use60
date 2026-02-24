---
name: Ops AI Transform
description: |
  Bulk-transform column values using AI to generate, rewrite, or derive new data from existing columns.
  Use when a user asks "transform this column", "generate values", "fill in this column with AI",
  "AI populate column", "rewrite the titles", or needs to apply AI processing across all rows in a column.
  Returns transformation job status with progress and sample outputs.
metadata:
  author: sixty-ai
  version: "2"
  category: enrichment
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
  triggers:
    - pattern: "transform column"
      intent: "ai_transform_ops_column"
      confidence: 0.90
      examples:
        - "transform this column"
        - "transform the data in this column"
        - "run AI on this column"
        - "process this column with AI"
    - pattern: "generate values"
      intent: "ai_transform_ops_column"
      confidence: 0.85
      examples:
        - "generate values for this column"
        - "AI generate the column data"
        - "auto-fill this column"
        - "create values using AI"
    - pattern: "fill in column"
      intent: "ai_transform_ops_column"
      confidence: 0.85
      examples:
        - "fill in this column"
        - "fill in the blanks"
        - "populate this column"
        - "complete the empty cells"
    - pattern: "AI populate"
      intent: "ai_transform_ops_column"
      confidence: 0.85
      examples:
        - "AI populate this column"
        - "use AI to fill this column"
        - "let AI handle this column"
        - "AI generate for each row"
    - pattern: "rewrite column"
      intent: "ai_transform_ops_column"
      confidence: 0.85
      examples:
        - "rewrite the titles"
        - "clean up this column"
        - "standardize the values"
        - "normalize the data"
  keywords:
    - "transform"
    - "generate"
    - "fill"
    - "populate"
    - "AI"
    - "rewrite"
    - "column"
    - "values"
    - "bulk"
    - "derive"
    - "standardize"
  required_context: []
  optional_context:
    - table_id
    - column_id
  inputs:
    - name: table_id
      type: string
      description: "ID of the ops table containing the column to transform"
      required: false
    - name: column_id
      type: string
      description: "ID of the column to transform"
      required: false
    - name: prompt
      type: string
      description: "AI prompt describing the transformation to apply to each row"
      required: false
    - name: source_columns
      type: array
      description: "Column names to use as input context for the transformation"
      required: false
  outputs:
    - name: transform_job
      type: object
      description: "Transformation job with ID, status, progress, and sample outputs"
  requires_capabilities:
    - ops_tables
  execution_mode: sync
  timeout_ms: 30000
  priority: high
  tags:
    - ops
    - AI
    - enrichment
    - transform
    - prospecting
---

## Available Context
@_platform-references/org-variables.md

# Ops AI Transform

## Goal

Apply AI-powered transformations to entire columns in an Ops table -- generating new values, rewriting existing data, deriving insights from other columns, or standardizing messy data. Unlike enrichment (which pulls in external data), transforms work with the data already in the table to produce derived or improved values.

Think of it as having a smart assistant process each row: "For every lead, write a personalized opening line based on their name, title, and company" or "Standardize all the job titles to seniority levels."

## Required Capabilities
- **Ops Tables**: Access to AI transform APIs

## Inputs
- `table_id`: ID of the ops table
- `column_id`: ID of the target column to write transformed values into
- `prompt`: Describes what the AI should generate or transform (e.g., "Write a one-line personalized opener referencing the lead's role")
- `source_columns`: Column names that the AI should read from when generating values (e.g., ["Name", "Title", "Company"])

## Instructions

### Running a Transform

When the user wants to AI-generate or transform column values:

1. Identify the table and target column
2. Understand the transformation. Ask clarifying questions if needed:
   - **What to generate**: "What should each cell contain?"
   - **What context to use**: "Which columns should the AI look at?"
3. Build the prompt. Good prompts are specific about:
   - The output format (one sentence, a number, a category, etc.)
   - The source data to reference (which columns)
   - The tone or style (professional, casual, technical)
4. Preview before running. Show the user what will happen:
   - "I'll transform 142 rows in the [Column] column using: '[prompt]'"
   - "Source columns: Name, Title, Company"
5. Call `execute_action("ai_transform_ops_column", { table_id: "<id>", column_id: "<col_id>", prompt: "<prompt>", source_columns: [...] })`
6. Report results with sample outputs so the user can verify quality

### Common Transform Patterns

| Use Case | Prompt Template | Source Columns |
|----------|----------------|----------------|
| Personalized opener | "Write a one-line cold outreach opener for {Name} who is {Title} at {Company}" | Name, Title, Company |
| Seniority classification | "Classify this job title into: C-Level, VP, Director, Manager, or IC" | Title |
| Company size bucket | "Categorize into: Startup (1-50), SMB (51-200), Mid-Market (201-1000), Enterprise (1000+)" | Employee Count |
| Email domain extraction | "Extract the domain from this email address" | Email |
| Industry standardization | "Map this industry to one of: SaaS, Fintech, Healthcare, E-commerce, Manufacturing, Other" | Industry |
| Outreach angle | "Based on this person's role and company, suggest the best angle for a cold outreach" | Title, Company, Industry |
| LinkedIn message | "Write a 3-sentence LinkedIn connection request mentioning their role and a relevant talking point" | Name, Title, Company |

### Building Good Prompts

Help the user craft effective prompts:

1. **Be specific about output format**: "One sentence" is better than "short"
2. **Reference source columns explicitly**: "Using the Name and Company columns"
3. **Give examples**: "For a VP of Sales at Acme Corp, output something like: 'Hi Sarah, I noticed Acme is scaling its sales team...'"
4. **Set constraints**: "Max 100 characters" or "Choose from: High/Medium/Low"

### Reviewing Transform Results

After a transform completes:

1. Show 3-5 sample outputs so the user can assess quality
2. Ask: "Does this look right? I can adjust the prompt and re-run if needed."
3. If the user wants changes, update the prompt and re-run -- previous values will be overwritten

## Available Actions

| Action | Parameters | Returns |
|--------|-----------|---------|
| `ai_transform_ops_column` | `{ table_id: string, column_id: string, prompt: string, source_columns?: string[] }` | Transform job with status, progress, and sample outputs |

## Output Format

### Transform Started
```
AI TRANSFORM STARTED
  Table: Lead Prospects
  Column: Outreach Opener
  Rows: 142
  Prompt: "Write a one-line personalized cold outreach opener for {Name}, {Title} at {Company}"
  Source columns: Name, Title, Company

Processing...
```

### Transform Complete with Samples
```
AI TRANSFORM COMPLETE
  142 of 142 rows processed

SAMPLE OUTPUTS:
  John Smith (VP Sales, Acme Corp):
    "Hi John -- saw Acme just expanded its sales team. Curious how you're handling..."

  Sarah Chen (Director Eng, TechFlow):
    "Sarah, TechFlow's engineering velocity is impressive. We help teams like yours..."

  Mike Ross (CTO, DataBridge):
    "Mike -- as DataBridge scales its data platform, I'd love to share how we help CTOs..."

Look good? I can adjust the prompt and re-run if you want a different style.
```

## Error Handling

### No prompt provided
"To transform this column, I need to know what to generate. Here are some ideas:
- 'Write a personalized outreach opener based on Name, Title, and Company'
- 'Classify the job title into seniority levels: C-Level, VP, Director, Manager, IC'
- 'Extract the company domain from the email address'
What would you like?"

### Source columns have empty data
"Some source columns have missing data -- [X] rows are missing [Column Name]. The AI will skip those rows or produce lower-quality output. Want to fill in the gaps first, or proceed with what we have?"

### Transform produces poor quality
If the user reports the output quality is not satisfactory: "Let me refine the prompt. What specifically needs to change? For example:
- Too formal/casual?
- Wrong length?
- Missing specific context?
- Not personalized enough?"

### Column already has data
"The [Column Name] column already has data in [X] rows. Running a transform will overwrite existing values. Want to proceed, or should I only fill in the empty cells?"

## Guidelines
- Always preview the transformation before running: show the prompt, source columns, and row count
- Show sample outputs after completion so the user can assess quality before using the data
- For classification/categorization transforms, suggest a fixed set of output values to ensure consistency
- Encourage users to reference multiple source columns for richer, more personalized outputs
- If the user's prompt is vague, suggest a more specific version before running
- Large tables (500+ rows) may take a few minutes -- set expectations upfront
- Transforms are idempotent -- re-running with the same prompt will regenerate all values
