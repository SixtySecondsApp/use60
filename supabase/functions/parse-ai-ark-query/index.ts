/// <reference path="../deno.d.ts" />

/**
 * Parse AI Ark Query — NL → Structured AI Ark Search Filters
 *
 * Uses Gemini Flash to convert a natural language query like
 * "Series B fintech companies in London using React with 50-200 employees"
 * into structured AI Ark search parameters.
 *
 * POST /parse-ai-ark-query
 * { query: string, _auth_token?: string }
 *
 * Returns: ParseResponse (search_type, filters, suggested_table_name, summary)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const LOG_PREFIX = '[parse-ai-ark-query]'

// All 148 AI Ark industry values (exact enum)
const INDUSTRIES = [
  "real estate", "medical practices", "construction", "retail", "software development",
  "business consulting and services", "it services and it consulting", "individual and family services",
  "restaurants", "advertising services", "hospitals and health care", "financial services",
  "wholesale", "civic and social organizations", "wellness and fitness services", "hospitality",
  "non-profit organizations", "truck transportation", "higher education", "manufacturing",
  "facilities services", "appliances, electrical, and electronics manufacturing", "consumer services",
  "food and beverage services", "machinery manufacturing", "spectator sports",
  "motor vehicle manufacturing", "technology, information and internet", "architecture and planning",
  "food and beverage manufacturing", "farming", "retail apparel and fashion", "mining", "accounting",
  "design services", "professional training and coaching", "industrial machinery manufacturing",
  "insurance", "education administration programs", "law practice", "travel arrangements",
  "performing arts", "government administration", "research services", "retail office equipment",
  "legal services", "entertainment providers", "events services", "book and periodical publishing",
  "media production", "environmental services", "e-learning providers", "religious institutions",
  "staffing and recruiting", "human resources services", "wholesale building materials",
  "furniture and home furnishings manufacturing", "civil engineering", "recreational facilities",
  "telecommunications", "utilities", "investment management", "photography",
  "freight and package transportation", "primary and secondary education", "textile manufacturing",
  "oil and gas", "retail groceries", "medical equipment manufacturing", "chemical manufacturing",
  "musicians", "paper and forest product manufacturing", "personal care product manufacturing",
  "plastics manufacturing", "graphic design", "information services", "veterinary services",
  "online audio and video media", "broadcast media production and distribution",
  "movies, videos, and sound", "international trade and development", "security and investigations",
  "mental health care", "public relations and communications services",
  "renewable energy semiconductor manufacturing", "printing services", "ranching", "banking",
  "transportation, logistics, supply chain and storage", "retail luxury goods and jewelry",
  "computers and electronics manufacturing", "pharmaceutical manufacturing", "artists and writers",
  "biotechnology research", "museums, historical sites, and zoos", "investment banking",
  "airlines and aviation", "writing and editing", "automation machinery manufacturing",
  "beverage manufacturing", "retail art supplies", "computer games", "executive offices",
  "market research", "venture capital and private equity principals", "computer and network security",
  "glass, ceramics and concrete manufacturing", "outsourcing and offshoring consulting",
  "defense and space manufacturing", "packaging and containers manufacturing",
  "leasing non-residential real estate", "semiconductor manufacturing", "wholesale import and export",
  "dairy product manufacturing", "aviation and aerospace component manufacturing",
  "maritime transportation", "public safety", "computer hardware manufacturing",
  "newspaper publishing", "translation and localization", "warehousing and storage",
  "alternative medicine", "capital markets", "sporting goods manufacturing", "fisheries",
  "political organizations", "think tanks", "shipbuilding", "animation and post-production",
  "law enforcement", "government relations services", "fundraising", "computer networking products",
  "philanthropic fundraising services", "strategic management services", "tobacco manufacturing",
  "international affairs", "gambling facilities and casinos", "libraries",
  "administration of justice", "railroad equipment manufacturing", "armed forces",
  "wireless services", "public policy offices", "alternative dispute resolution",
  "nanotechnology research", "legislative offices", "mobile gaming apps",
]

// All 797 AI Ark industry tags (exact enum)
const INDUSTRY_TAGS = [
  "manufacturing", "consulting", "software", "information technology", "health care",
  "financial services", "e-commerce", "real estate", "advertising", "industrial", "medical",
  "wholesale", "retail", "marketing", "construction", "training", "web design", "education",
  "finance", "non profit", "web development", "food and beverage", "internet", "commercial",
  "digital marketing", "residential", "professional services", "advice", "property management",
  "product design", "electronics", "automotive", "insurance", "transportation", "wellness",
  "graphic design", "business development", "events", "customer service", "seo", "consumer goods",
  "logistics", "accounting", "fashion", "media and entertainment", "mobile apps",
  "service industry", "building material", "sales", "recruiting", "artificial intelligence (ai)",
  "management consulting", "machinery manufacturing", "project management", "rental", "printing",
  "apps", "human resources", "dental", "information services", "mechanical engineering",
  "analytics", "telecommunications", "hospital", "architecture", "legal", "energy", "communities",
  "biotechnology", "publishing", "brand marketing", "medical device", "industrial engineering",
  "saas", "civil engineering", "security", "sports", "interior design", "staffing agency",
  "social media", "therapeutics", "hardware", "computer", "food processing", "travel",
  "pharmaceutical", "real estate investment", "banking", "news", "chemical", "fintech",
  "cyber security", "industrial manufacturing", "supply chain management", "video",
  "commercial real estate", "furniture", "property development", "fitness", "music",
  "event management", "health diagnostics", "wealth management", "venture capital", "mobile",
  "oil and gas", "technical support", "web hosting", "personal health", "agriculture",
  "association", "asset management", "e-learning", "social media marketing", "cloud computing",
  "packaging services", "public relations", "renewable energy", "digital media", "b2b",
  "warehousing", "rental property", "risk management", "facilities support services",
  "online portals", "machine learning", "tourism", "environmental consulting", "lighting",
  "lending", "wine and spirits", "leasing", "beauty", "plastics and rubber manufacturing",
  "textiles", "cosmetics", "consumer electronics", "government", "apparel", "life insurance",
  "industrial automation", "enterprise software", "home decor", "hospitality",
  "internet of things", "network security", "freight service", "outsourcing", "content", "social",
  "blockchain", "test and measurement", "retirement", "auto insurance", "business intelligence",
  "home improvement", "crm", "payments", "market research", "gaming", "shipping",
  "software engineering", "charity", "higher education", "aerospace", "photography",
  "creative agency", "solar", "art", "waste management", "employment", "health insurance",
  "it management", "lifestyle", "shopping", "marketplace", "broadcasting", "big data", "ux design",
  "real estate brokerage", "small and medium businesses", "commercial insurance",
  "it infrastructure", "sustainability", "environmental engineering", "web apps",
  "sporting goods", "electrical distribution", "email marketing", "home renovation",
  "heating, ventilation, and air conditioning (hvac)", "landscaping", "film production",
  "restaurants", "home services", "building maintenance", "field support", "recycling", "farming",
  "travel agency", "mining", "jewelry", "public safety", "database", "rehabilitation", "water",
  "enterprise resource planning (erp)", "law enforcement", "audio", "wireless", "infrastructure",
  "robotics", "content marketing", "cloud data services", "cryptocurrency", "leisure",
  "recreation", "digital signage", "delivery", "women's", "cosmetic surgery", "winery",
  "mental health", "wood processing", "property insurance", "nutrition", "compliance", "consumer",
  "content creators", "bookkeeping and payroll", "animation", "janitorial service",
  "3d technology", "edtech", "impact investing", "pet", "social media management", "credit",
  "ios", "home health care", "nursing and residential care", "performing arts", "mortgage",
  "life science", "child care", "children", "elder care", "lead generation", "video games",
  "employee benefits", "virtual reality", "home and garden", "document management", "gift",
  "voip", "eyewear", "facility management", "corporate training", "precious metals",
  "tax preparation", "air transportation", "e-commerce platforms", "food delivery", "wedding",
  "trading platform", "film", "fleet management", "data management", "personal development",
  "industrial design", "snack food", "catering", "marine transportation",
  "information and communications technology (ict)", "product research", "3d printing",
  "delivery service", "local business", "outdoors", "shoes", "social network",
  "energy management", "quality assurance", "digital entertainment", "clinical trials",
  "semiconductor", "mechanical design", "cloud management", "hotel", "water purification",
  "communications infrastructure", "data center", "data integration", "cleantech", "veterinary",
  "travel accommodations", "cad", "coffee", "marketing automation", "books", "email", "golf",
  "electric vehicle", "search engine", "bakery", "tax consulting", "ticketing", "network hardware",
  "organic food", "agtech", "billing", "foundries", "android", "funding platform", "tv",
  "marine technology", "universities", "energy efficiency", "angel investment",
  "augmented reality", "grocery", "brewing", "developer tools", "tv production", "tour operator",
  "messaging", "productivity tools", "assisted living", "sensor", "data visualization",
  "paper manufacturing", "personal finance", "made to order", "online games", "boating",
  "mobile payments", "language learning", "biopharma", "professional networking",
  "natural resources", "religion", "dietary supplements", "psychology", "career planning",
  "chemical engineering", "outpatient care", "adventure travel", "business information systems",
  "procurement", "point of sale", "battery", "coworking", "theatre", "retail technology",
  "cloud infrastructure", "toys", "secondary education", "advertising platforms",
  "vacation rental", "animal feed", "web3", "video editing", "video streaming", "craft beer",
  "event promotion", "innovation management", "primary education", "musical instruments",
  "outdoor advertising", "product management", "handmade", "organic", "translation service",
  "fuel", "devops", "smart home", "developer platform", "mineral", "social impact", "cannabis",
  "fruit", "railroad", "personal branding", "sem", "insurtech", "cloud security", "local",
  "office administration", "ebooks", "laser", "social news", "mapping services", "b2c",
  "credit cards", "real time", "self-storage", "podcast", "skill assessment",
  "predictive analytics", "legal tech", "collaboration", "social assistance", "copywriting",
  "drones", "call center", "clean energy", "geospatial", "public transportation", "wearables",
  "transaction processing", "family", "crowdfunding", "developer apis", "domain registrar",
  "timber", "internet radio", "autonomous vehicles", "location based services", "trade shows",
  "debt collections", "subscription service", "confectionery", "financial exchanges", "flowers",
  "generative ai", "primary and urgent care", "mhealth", "oncology", "commercial lending",
  "document preparation", "laundry and dry-cleaning", "sales automation", "data storage",
  "audio recording and production", "management information systems", "physical security",
  "social media advertising", "journalism", "pc games", "seafood", "audio/visual equipment",
  "computer vision", "tutoring", "emergency medicine", "bitcoin", "museums and historical sites",
  "office supplies", "gps", "home appliances", "intellectual property", "military",
  "alternative medicine", "auctions", "natural language processing", "forestry", "virtualization",
  "cleaning products", "swimming", "genetics", "concerts", "resorts", "social entrepreneurship",
  "wired telecommunications", "courier service", "enterprise", "men's", "open source",
  "direct marketing", "nanotechnology", "reservations", "video advertising", "music education",
  "data mining", "greentech", "gift card", "enterprise applications", "cms", "smart building",
  "energy storage", "cycling", "soccer", "identity management", "taxi service", "direct sales",
  "recreational vehicles", "advanced materials", "sms", "parking", "incubators", "photo editing",
  "extermination service", "consumer software", "communication hardware", "mobile devices",
  "vocational education", "knowledge management", "power grid", "tea",
  "personal care and hygiene", "recipes", "data collection and labeling", "paas",
  "mobile advertising", "unified communications", "politics", "stock exchanges", "navigation",
  "baby", "metaverse", "privacy", "consumer lending", "blogging platforms",
  "satellite communication", "video conferencing", "cooking", "sharing economy",
  "addiction treatment", "electronic health record (ehr)", "esports", "meat and poultry",
  "music streaming", "lead management", "electronic design automation (eda)", "racing",
  "virtual assistant", "casual games", "gamification", "chatbot", "cloud storage", "distillery",
  "hedge funds", "intelligent systems", "neuroscience", "windows", "fraud detection",
  "embedded systems", "sports leagues and teams", "music label", "fertility", "loyalty programs",
  "elderly", "housekeeping service", "shopping mall", "isp", "simulation",
  "fast-moving consumer goods", "telehealth", "wind energy",
  "application performance management", "mining technology", "optical communication",
  "image recognition", "proptech", "affiliate marketing", "funerals", "livestock",
  "water transportation", "guides", "smart cities", "aquaculture", "business travel", "diabetes",
  "amusement park and arcade", "stem education", "assistive technology", "consumer research",
  "horticulture", "biometrics", "freelance", "peer to peer", "advocacy", "tennis",
  "fantasy sports", "motorsports", "personalization", "humanitarian", "contact management",
  "franchise", "penetration testing", "green building", "online auctions", "ports and harbors",
  "gambling", "young adults", "continuing education", "homeless shelter", "debit cards",
  "car sharing", "business process automation (bpa)", "parks", "task management", "ad network",
  "embedded software", "film distribution", "virtual workforce", "limousine service",
  "bioinformatics", "reputation", "dating", "robotic process automation (rpa)", "coupons",
  "photo sharing", "govtech", "rfid", "consumer applications", "online forums",
  "collection agency", "consumer reviews", "music venues", "nutraceutical", "parenting",
  "scheduling", "usability testing", "app marketing", "private social networking",
  "biomass energy", "crowdsourcing", "farmers market", "sailing", "textbook", "price comparison",
  "ride sharing", "space travel", "lingerie", "casino", "data center automation", "first aid",
  "national security", "charging infrastructure", "dairy", "herbs and spices",
  "alternative protein", "motion capture", "operating systems", "tobacco", "civictech",
  "equestrian", "meeting software", "data governance", "web browsers",
  "decentralized finance (defi)", "food trucks", "file sharing", "iaas", "basketball",
  "classifieds", "hunting", "ethereum", "semantic search", "pollution control",
  "secondhand goods", "human computer interaction", "independent music", "virtual currency",
  "foreign exchange trading", "diving", "same day delivery", "speech recognition",
  "charter schools", "vending and concessions", "local advertising", "edutainment",
  "plant-based foods", "collectibles", "homeland security", "desktop apps",
  "last mile transportation", "green consumer goods", "smart contracts", "biofuel",
  "drone management", "archiving service", "console games", "content delivery network", "hockey",
  "linux", "non-fungible token (nft)", "precision medicine", "skiing", "wildlife conservation",
  "presentations", "ad targeting", "e-signature", "hydroelectric", "micro lending", "sponsorship",
  "adult", "social recruiting", "qr codes", "text analytics", "video on demand",
  "remote sensing", "nuclear", "audiobooks", "product search", "alumni", "american football",
  "shipping broker", "social shopping", "surfing", "visual search", "content discovery",
  "google", "baseball", "video chat", "private cloud", "comics", "underserved children",
  "carbon capture", "nightlife", "sales enablement", "credit bureau",
  "application specific integrated circuit (asic)", "lgbt", "quantum computing",
  "warehouse automation", "diy", "nightclubs", "a/b testing", "ediscovery",
  "facial recognition", "college recruiting", "indoor positioning", "collaborative consumption",
  "social crm", "rugby", "serious games", "virtual world", "volley ball",
  "card and board games", "emerging markets", "intrusion detection", "fossil fuels",
  "native advertising", "browser extensions", "ad server", "mmo games", "celebrity",
  "geothermal energy", "special education", "facebook", "semantic web", "group buying",
  "presentation software", "ad retargeting", "reading apps", "local shopping", "app discovery",
  "content syndication", "fuel cell", "cricket", "hydroponics", "flash storage", "nfc",
  "multi-level marketing", "prepaid cards", "q&a", "macos", "prediction markets", "gpu", "mooc",
  "playstation", "ad exchange", "virtual goods", "social bookmarking", "spam filtering",
  "virtual desktop", "ferry service", "sex industry", "teenagers",
  "field-programmable gate array (fpga)", "vertical search", "dsp", "contests", "freemium",
  "quantified self", "sns", "cause marketing", "in-flight entertainment", "drm", "table tennis",
  "xbox", "generation z", "gift exchange", "google glass", "timeshare", "webos",
  "gift registry", "twitter", "windows phone", "corrections facilities", "millennials",
  "sex tech", "nintendo", "flash sale", "generation y", "ultimate frisbee",
]

function buildSystemPrompt(): string {
  const industriesList = INDUSTRIES.map(i => `  - ${i}`).join('\n')
  const tagsList = INDUSTRY_TAGS.map(t => `  - ${t}`).join('\n')

  return `You are a search query parser for a B2B data platform called AI Ark. Convert the user's natural language query into structured search filters.

AVAILABLE INDUSTRIES (use EXACT values from this list only):
${industriesList}

AVAILABLE INDUSTRY TAGS (use EXACT values from this list only):
${tagsList}

SENIORITY LEVELS (use exact values): C-Suite, VP, Director, Manager, Senior, Entry

RULES:
1. Determine if this is a COMPANY search or a PEOPLE search:
   - Company search: looking for companies/organizations (e.g. "fintech startups in London", "SaaS companies using React")
   - People search: looking for individuals/contacts (e.g. "CTOs at Series B companies", "VPs of Sales in New York")
   - If ambiguous and no job titles are mentioned, default to company search.

2. INDUSTRY MAPPING:
   - Map industry terms to exact values from the AVAILABLE INDUSTRIES list above.
   - Also pick relevant industry tags from the AVAILABLE INDUSTRY TAGS list to increase match quality.
   - "fintech" → industry: ["financial services"], industry_tags: ["fintech", "financial services"]
   - "SaaS" → industry: ["software development"], industry_tags: ["saas", "software"]
   - "healthcare" → industry: ["hospitals and health care"], industry_tags: ["health care"]
   - Only use values that appear verbatim in the lists above.

3. EMPLOYEE COUNTS:
   - Extract min/max from ranges like "50-200 employees", "50 to 200 people"
   - "startup" → employee_max: 50
   - "SMB" / "small business" → employee_min: 10, employee_max: 250
   - "mid-market" → employee_min: 250, employee_max: 1000
   - "enterprise" → employee_min: 1000

4. REVENUE:
   - Extract revenue ranges in USD when mentioned (e.g. "$10M-$50M revenue")
   - Express as numbers (not strings): revenue_min: 10000000, revenue_max: 50000000

5. FUNDING STAGES:
   - "Series A" → keywords: ["Series A"]
   - "Series B" → keywords: ["Series B"]
   - "funded" → keywords: ["funded", "VC-backed"]
   - Include funding stage in keywords since AI Ark uses keyword search for this

6. TECHNOLOGY:
   - Extract technology names exactly as commonly known (e.g. "React", "Salesforce", "HubSpot")
   - Put in technologies array

7. LOCATION:
   - Extract city names, country names, or regions
   - Use full English names (e.g. "United Kingdom" not "UK", "United States" not "USA")
   - Include both city and country if both mentioned

8. JOB TITLES (people search only):
   - Extract job titles for job_title array
   - Include variations: "CEO" → ["CEO", "Chief Executive Officer"]
   - "VP Sales" → ["VP Sales", "VP of Sales", "Vice President of Sales"]

9. SENIORITY (people search only):
   - Map to: C-Suite, VP, Director, Manager, Senior, Entry
   - "CEO/CTO/CFO" → "C-Suite", "VP/SVP/EVP" → "VP", "Director/Head of" → "Director"

10. SUGGESTED TABLE NAME:
    - Generate a 2-5 word human-readable name summarizing the search
    - Pattern: "[Type/Role] — [Industry] — [Location]" (omit parts not specified)
    - Examples: "Fintech — London — 50-200 employees", "VP Sales — SaaS — New York", "Series B — React — Healthcare"

11. SUMMARY:
    - Write 1-2 sentences explaining what was parsed

12. KEYWORDS:
    - Use for anything not covered by other fields: funding stages, specific technologies not in tech list, company names, special requirements

OUTPUT: Return ONLY valid JSON. No markdown, no code blocks. The JSON must match this schema exactly:
{
  "search_type": "company" | "people",
  "industry": string[] | null,
  "industry_tags": string[] | null,
  "technologies": string[] | null,
  "location": string[] | null,
  "employee_min": number | null,
  "employee_max": number | null,
  "revenue_min": number | null,
  "revenue_max": number | null,
  "founded_min": number | null,
  "founded_max": number | null,
  "job_title": string[] | null,
  "seniority_level": string[] | null,
  "keywords": string[] | null,
  "company_domain": string[] | null,
  "company_name": string | null,
  "suggested_table_name": string,
  "summary": string
}`
}

serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req)
  if (corsResponse) return corsResponse

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')
    if (!apiKey) {
      return errorResponse('Gemini API key not configured', req, 500)
    }

    // Parse body — supports auth token in body for browser extension compatibility
    const body = await req.json()
    const { query, _auth_token, ...rest } = body as { query: string; _auth_token?: string }

    if (!query?.trim()) {
      return errorResponse('Query is required', req, 400)
    }

    // Auth — prefer Authorization header, fall back to body token
    const authHeader = req.headers.get('Authorization') || (_auth_token ? `Bearer ${_auth_token}` : null)
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    console.log(`${LOG_PREFIX} Parsing query for user ${user.id}: "${query}"`)

    const systemPrompt = buildSystemPrompt()
    const userPrompt = `Parse this search query into structured AI Ark filters:\n\n"${query.trim()}"`

    // Call Gemini Flash
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      console.error(`${LOG_PREFIX} Gemini API error ${geminiResponse.status}: ${errText}`)
      // Fallback: return basic keyword search
      return jsonResponse(buildFallback(query), req)
    }

    const geminiData = await geminiResponse.json()
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      console.error(`${LOG_PREFIX} No text in Gemini response`)
      return jsonResponse(buildFallback(query), req)
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawText)
    } catch (e) {
      console.error(`${LOG_PREFIX} Failed to parse Gemini JSON:`, e)
      return jsonResponse(buildFallback(query), req)
    }

    // Validate required fields
    if (!parsed.search_type || !parsed.suggested_table_name || !parsed.summary) {
      console.warn(`${LOG_PREFIX} Gemini response missing required fields, using fallback`)
      return jsonResponse(buildFallback(query), req)
    }

    // Clean nulls and empty arrays from output
    const result = cleanParsedResult(parsed)

    console.log(`${LOG_PREFIX} Parsed: search_type=${result.search_type}, table="${result.suggested_table_name}"`)

    return jsonResponse(result, req)
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error)
    return errorResponse((error as Error).message, req, 500)
  }
})

/**
 * Build a minimal fallback result when Gemini fails to parse.
 * Returns a basic keyword-based company search.
 */
function buildFallback(query: string): Record<string, unknown> {
  return {
    search_type: 'company',
    keywords: [query.trim()],
    suggested_table_name: query.trim().slice(0, 40),
    summary: `Keyword search for: "${query.trim()}" (NL parsing unavailable)`,
  }
}

/**
 * Remove null values, empty arrays, and normalize the result.
 */
function cleanParsedResult(parsed: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'string' && value.trim() === '') continue
    result[key] = value
  }

  // Ensure required fields are always present
  if (!result.search_type) result.search_type = 'company'
  if (!result.suggested_table_name) result.suggested_table_name = 'Search Results'
  if (!result.summary) result.summary = 'Parsed search query'

  return result
}
