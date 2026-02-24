# Organization Context Variables Reference

Complete catalog of organization context variables available for use in skill templates. These variables are resolved at compilation time by the `compile-organization-skills` edge function.

---

## Variable Syntax

Use `${variable_name}` placeholders in skill body text. The compiler replaces them with the organization's actual values during compilation.

```
Our company, ${company_name}, specializes in ${industry}.
Our main competitor is ${primary_competitor}.
```

### Nested Access

Use dot notation for object properties and bracket notation for array indices:

```
${icp_summary.industry}
${products[0].name}
${key_people[0].role}
```

### Pipe Modifiers

Chain modifiers with `|` to transform values:

| Modifier | Description | Example | Result |
|----------|-------------|---------|--------|
| `upper` | Uppercase string | `${company_name\|upper}` | `ACME CORP` |
| `lower` | Lowercase string | `${company_name\|lower}` | `acme corp` |
| `capitalize` | Title case | `${industry\|capitalize}` | `Software Development` |
| `first` | First element of array | `${competitors\|first}` | `Competitor A` |
| `last` | Last element of array | `${competitors\|last}` | `Competitor Z` |
| `count` | Length of array/object | `${products\|count}` | `5` |
| `json` | JSON stringify (pretty) | `${icp_summary\|json}` | `{ "industry": "..." }` |
| `join(", ")` | Join array with separator | `${competitors\|join(", ")}` | `A, B, C` |

### Default Values

Provide a fallback for missing variables using a quoted string modifier:

```
${company_name|'Our Company'}
${primary_competitor|'competitors in the space'}
```

### Chaining

Modifiers can be chained left to right:

```
${competitors|first|upper}
${products|count|'0'}
```

---

## Variable Catalog

### Company Identity

| Variable | Type | Description |
|----------|------|-------------|
| `company_name` | string | Company name |
| `domain` | string | Website domain |
| `tagline` | string | Company tagline |
| `description` | string | Company description |
| `industry` | string | Industry classification |
| `employee_count` | string | Size indicator (e.g., "50-100") |

### Products & Services

| Variable | Type | Description |
|----------|------|-------------|
| `products` | array | Products with name and description. Each item: `{ name, description, ... }` |
| `main_product` | string | Primary product name |
| `value_propositions` | array | Key value propositions (array of strings) |

### Market Intelligence

| Variable | Type | Description |
|----------|------|-------------|
| `competitors` | array | Competitor names (array of strings) |
| `primary_competitor` | string | Main competitor name |
| `target_market` | string | Target market description |
| `icp_summary` | object | Ideal customer profile summary (structured object) |

### Additional Intelligence

| Variable | Type | Description |
|----------|------|-------------|
| `tech_stack` | array | Technologies used (array of strings) |
| `key_people` | array | Key team members. Each item: `{ name, role, ... }` |
| `pain_points` | array | Customer pain points the product solves (array of strings) |
| `buying_signals` | array | Purchase intent signals to watch for (array of strings) |
| `customer_logos` | array | Notable customer names (array of strings) |

### Brand Voice & Style

| Variable | Type | Description |
|----------|------|-------------|
| `brand_tone` | string | Communication tone (e.g., "professional", "friendly", "authoritative") |
| `words_to_avoid` | array | Words/phrases to avoid in communication (array of strings) |
| `key_phrases` | array | Key brand phrases and messaging (array of strings) |
| `writing_style_name` | string | Name of the writing style (e.g., "Conversational Professional") |
| `writing_style_tone` | string | Writing tone description |
| `writing_style_examples` | array | Example writing samples (array of strings) |

### ICP & Lead Qualification

| Variable | Type | Description |
|----------|------|-------------|
| `icp_company_profile` | string | Ideal company profile description |
| `icp_buyer_persona` | string | Buyer persona description |
| `qualification_criteria` | array | Lead qualification criteria (array of strings) |
| `disqualification_criteria` | array | Lead disqualification criteria (array of strings) |

### Copilot Personality

| Variable | Type | Description |
|----------|------|-------------|
| `copilot_personality` | string | AI assistant personality description |
| `copilot_greeting` | string | AI assistant greeting message |

---

## Context Profiles

Each skill declares a `context_profile` in its frontmatter metadata. This controls which organization variables are included in the auto-generated Organization Context block prepended to the compiled skill.

| Profile | Variables Included |
|---------|-------------------|
| `sales` | `company_name`, `company_bio`, `products`, `value_propositions`, `competitors`, `icp`, `ideal_customer_profile`, `brand_voice`, `case_studies`, `customer_logos`, `pain_points` |
| `research` | `company_name`, `company_bio`, `products`, `competitors`, `industry`, `target_market`, `tech_stack`, `pain_points`, `employee_count`, `company_size` |
| `communication` | `company_name`, `brand_voice`, `products`, `case_studies`, `customer_logos`, `value_propositions` |
| `full` | **All variables** — every key in the organization context object is included |

### Choosing a Profile

- Use `sales` for outreach, prospecting, and deal-related skills
- Use `research` for company/lead research and enrichment skills
- Use `communication` for email drafting, messaging, and content skills
- Use `full` when the skill needs access to everything (rare — increases token usage)

### How It Works

1. During compilation, `compile-organization-skills` reads the skill's `context_profile`
2. It filters the org context to only the variables allowed by that profile
3. It generates an "Organization Context (Auto-Generated)" markdown block
4. This block is prepended to the compiled skill content
5. Additionally, `${variable}` placeholders in the skill body are replaced with actual values
