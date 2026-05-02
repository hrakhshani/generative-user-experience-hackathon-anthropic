// Seed categories for semantic post filtering.
//
// Each entry has:
//   - `name`: short, user-facing category label (the value persisted in
//     page rules and shown as a filter chip).
//   - `prompt`: a rich anchor description embedded once and cached at
//     server startup. The prompt should "look like" a representative
//     example of the category so cosine similarity against post text
//     produces sensible classifications. We deliberately list multiple
//     concrete words (a "bag of synonyms") because text-embedding-3-small
//     is sensitive to surface vocabulary.
//
// Adding / editing a category invalidates the in-memory cache the next
// time the API server starts (we key the cache by a stable hash of the
// list contents, so changes here propagate automatically).

export type SeedCategory = {
  name: string
  prompt: string
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Education",
    prompt:
      "Education and learning: schools, universities, courses, students, teachers, online classes, MOOCs, exams, tuition, scholarships, study tips, academic research, lectures, syllabus, e-learning platforms.",
  },
  {
    name: "Sports",
    prompt:
      "Sports and athletics: football, soccer, basketball, tennis, cricket, baseball, NBA, NFL, FIFA, Olympics, championships, leagues, teams, players, coaches, scores, training, fitness, marathons, athletes.",
  },
  // ────────────────────────────────────────────────────────────────────
  // Sport-discipline seed buckets.
  //
  // The generic "Sports" entry above is fine for a news feed, but on an
  // athletic-retail page (Nike, Adidas, ASICS, Decathlon) every product
  // is "sports" — so it can't differentiate. These finer buckets are
  // what the embedding model anchors against when /derive-categories
  // can't produce a list (gateway down, timeout, etc.) and we fall back
  // to seed categories. They also serve as a strong prior for the LLM
  // when proposing dynamic categories on those sites.
  // ────────────────────────────────────────────────────────────────────
  {
    name: "Road Running",
    prompt:
      "Road running shoes and gear: pavement runner, daily trainer, neutral cushioning, stability shoe, marathon trainer, half marathon, 5K, 10K, tempo runs, easy runs, long runs, asphalt, road racer, foam midsole, Pegasus, Vomero, Nimbus, Cumulus, Adios.",
  },
  {
    name: "Trail Running",
    prompt:
      "Trail running shoes and gear: off-road, mountain trail, technical terrain, lugged outsole, rock plate, ultramarathon, vertical kilometer, fastpacking, fell running, hiking-adjacent, Pegasus Trail, Wildhorse, Kiger, Speedgoat, Cascadia, Lone Peak, mud, gravel, rooty trails.",
  },
  {
    name: "Racing & Carbon Plate",
    prompt:
      "Racing flats and carbon-plated super-shoes: Vaporfly, Alphafly, Adios Pro, Endorphin Pro, Metaspeed, ZoomX, PWRRUN PB, Lightstrike Pro, marathon racing, half marathon PR, track 5K race, tempo race day, elite competition, World Marathon Majors.",
  },
  {
    name: "Athletics Spikes",
    prompt:
      "Track and field spikes: sprinting spikes, distance spikes, mid-distance spikes, jumping spikes, throwing shoes, cross country spikes, removable pins, track meets, field events, hurdles, steeplechase, pole vault, javelin, shot put, NCAA, Olympic athletics, USATF.",
  },
  {
    name: "Custom & Specialty Running",
    prompt:
      "Custom and specialty running products: Nike By You customizer, Adidas miCoach customs, made-to-order, limited edition, collaboration, special edition colorway, adaptive running gear, wide-fit running shoes, narrow-fit, custom orthotic-friendly, premium materials, hand-crafted.",
  },
  {
    name: "Basketball",
    prompt:
      "Basketball shoes and apparel: hoops, NBA signature shoes, LeBron, KD, Kyrie, Jordan retro, AJ1, AJ4, AJ11, Curry, Harden, GT Cut, GT Jump, Sabrina, court shoes, indoor traction, outdoor basketball, streetball, AAU, college hoops, FIBA.",
  },
  {
    name: "Football & Soccer",
    prompt:
      "Football and soccer cleats and gear: Mercurial, Phantom, Tiempo, Predator, Copa, X Crazyfast, Vapor, Ultra, FG firm ground, AG artificial grass, SG soft ground, TF turf, IC indoor court, futsal, Premier League, Champions League, World Cup, MLS, La Liga, jerseys, shin guards.",
  },
  {
    name: "American Football",
    prompt:
      "American football cleats and pads: gridiron cleats, NFL, college football, quarterback, receiver, lineman cleats, low-cut, mid-cut, high-cut, molded studs, detachable studs, helmets, shoulder pads, Vapor Edge, Alpha Menace.",
  },
  {
    name: "Tennis & Court Sports",
    prompt:
      "Tennis and court sport footwear: hard court, clay court, grass court, all-court tennis shoes, padel, pickleball, badminton, squash, indoor court, herringbone outsole, lateral support, Air Zoom Vapor, GEL-Resolution, Barricade, NikeCourt, Wimbledon, US Open, ATP, WTA.",
  },
  {
    name: "Training & Gym",
    prompt:
      "Training and gym shoes: cross-training, weightlifting, HIIT, CrossFit, functional fitness, Metcon, Nano, F-Lite, Project G, gym sneakers, lifting platform, plyometric jumps, agility drills, strength training, treadmill workouts.",
  },
  {
    name: "Yoga & Studio",
    prompt:
      "Yoga, pilates and studio gear: yoga mats, leggings, sports bras, barefoot training, studio shoes, dance, barre, pilates reformer, mindfulness, meditation, vinyasa, hot yoga, low-impact, flexibility.",
  },
  {
    name: "Hiking & Outdoor",
    prompt:
      "Hiking, backpacking and outdoor footwear: hiking boots, approach shoes, mountaineering, Gore-Tex, waterproof, day hike, thru-hike, alpine, Vibram outsole, Salomon X Ultra, Hoka Anacapa, Merrell Moab, Lowa, La Sportiva, scrambling, via ferrata.",
  },
  {
    name: "Skateboarding",
    prompt:
      "Skateboarding shoes and apparel: skate shoes, vulcanized soles, cup soles, suede toe, ollie, kickflip, street skating, park skating, vert, Nike SB Dunk, Vans Old Skool, Adidas Busenitz, Lakai, Emerica, deck, trucks, wheels, grip tape.",
  },
  {
    name: "Cycling",
    prompt:
      "Cycling apparel and gear: road cycling, mountain biking, gravel bike, time trial, triathlon, cycling shoes, SPD, SPD-SL, Look Keo, jersey, bib shorts, helmet, Tour de France, Giro, Vuelta, indoor cycling, Zwift.",
  },
  {
    name: "Lifestyle & Casual Sneakers",
    prompt:
      "Lifestyle sneakers and casual streetwear footwear: Air Force 1, Dunk Low, Air Max 90, Air Max 97, Cortez, Stan Smith, Samba, Gazelle, Forum, Yeezy, retro classics, daily wear, off-court styling, fashion sneakers, sneakerhead, hype releases.",
  },
  {
    name: "Kids & Youth",
    prompt:
      "Kids and youth athletic gear: little kids, big kids, toddlers, preschool, GS Grade School, PS Pre-School, TD Toddler, youth basketball, junior tennis, kids football boots, school PE shoes, growing feet, family sizes.",
  },
  {
    name: "Apparel & Accessories",
    prompt:
      "Athletic apparel and accessories: t-shirts, hoodies, sweatshirts, shorts, pants, joggers, leggings, socks, hats, caps, bags, backpacks, water bottles, gloves, sleeves, headbands, base layers, jackets, vests.",
  },
  {
    name: "Sale & Outlet",
    prompt:
      "Sale, clearance and outlet items: discounted, marked down, on sale, percent off, last chance, end of season, limited stock, outlet, factory store, deals, bargains, reduced price, was now pricing.",
  },
  {
    name: "Personal achievement",
    prompt:
      "Personal achievement and milestones: promotions, new jobs, graduations, awards, certifications, finishing a marathon, life accomplishments, congratulations posts, success stories, proud moments, anniversaries, launches.",
  },
  {
    name: "Technology",
    prompt:
      "Technology, software and engineering: AI, machine learning, programming, JavaScript, Python, frameworks, gadgets, smartphones, hardware, cloud, devops, open source, GitHub, developers, tech industry.",
  },
  {
    name: "Business & entrepreneurship",
    prompt:
      "Business, entrepreneurship and startups: founders, venture capital, fundraising, marketing, sales, leadership, strategy, growth, SaaS, B2B, B2C, product-market fit, hiring, company news, IPOs.",
  },
  {
    name: "Career & jobs",
    prompt:
      "Career, jobs and the workplace: hiring, job openings, recruiting, resume tips, interview advice, layoffs, remote work, promotions, salary negotiation, mentoring, professional development, LinkedIn networking.",
  },
  {
    name: "Finance & investing",
    prompt:
      "Finance, investing and money: stock market, S&P 500, Nasdaq, bonds, ETFs, crypto, Bitcoin, banking, interest rates, inflation, economy, personal finance, retirement, real estate investing, hedge funds.",
  },
  {
    name: "Politics & policy",
    prompt:
      "Politics, government and policy: elections, presidents, congress, parliament, laws, legislation, public policy, geopolitics, foreign affairs, war, diplomacy, political parties, voting, regulation.",
  },
  {
    name: "Science & research",
    prompt:
      "Science and research: scientific discoveries, papers, biology, physics, chemistry, astronomy, space exploration, NASA, SpaceX, climate science, peer-reviewed studies, experiments, Nobel prize.",
  },
  {
    name: "Health & wellness",
    prompt:
      "Health, medicine and wellness: healthcare, doctors, hospitals, mental health, therapy, anxiety, nutrition, diet, exercise, sleep, vaccines, public health, illnesses, medications, longevity.",
  },
  {
    name: "Arts & culture",
    prompt:
      "Arts, culture and creativity: music, albums, concerts, films, movies, books, novels, painting, theater, museums, photography, design, fashion, architecture, poetry, literature.",
  },
  {
    name: "Entertainment",
    prompt:
      "Entertainment and pop culture: celebrities, Hollywood, streaming, Netflix, TV shows, reality TV, awards shows, gossip, viral videos, influencers, podcasts, talk shows.",
  },
  {
    name: "Gaming",
    prompt:
      "Video games and gaming culture: PlayStation, Xbox, Nintendo, Steam, indie games, AAA releases, esports, Twitch, speedruns, MMOs, RPGs, FPS, game development, game reviews.",
  },
  {
    name: "Food & cooking",
    prompt:
      "Food, cooking and cuisine: recipes, chefs, restaurants, baking, ingredients, meal prep, food photography, regional cuisine, vegan, vegetarian, wine, coffee, cocktails.",
  },
  {
    name: "Travel",
    prompt:
      "Travel and tourism: destinations, vacations, flights, airlines, hotels, hostels, road trips, hiking, backpacking, city guides, beaches, mountains, cultural tourism.",
  },
  {
    name: "News & current events",
    prompt:
      "News and current events: breaking news, world headlines, natural disasters, accidents, crime reports, journalism, press releases, events as they happen.",
  },
  {
    name: "Lifestyle",
    prompt:
      "Lifestyle and daily life: home decor, gardening, parenting, fashion outfits, productivity tips, hobbies, weekend routines, minimalism, self-improvement, journaling.",
  },
  {
    name: "Relationships & social",
    prompt:
      "Relationships, family and community: dating, marriage, parenting, friendships, social events, weddings, birthdays, family stories, community organizing, volunteering.",
  },
  {
    name: "Humor & memes",
    prompt:
      "Humor, jokes and memes: funny posts, satire, parody, viral memes, reaction images, witty observations, comedy, sarcasm, light entertainment.",
  },
  {
    name: "Marketing & social media",
    prompt:
      "Marketing, advertising and social media: brand campaigns, copywriting, SEO, content marketing, influencer partnerships, ads, growth hacking, social media strategy, virality.",
  },
]

// Stable hash of category names + prompts so the embedding cache can be
// invalidated automatically whenever the seed list changes.
export function categoriesHash(): string {
  let h = 5381
  for (const c of SEED_CATEGORIES) {
    const s = `${c.name}::${c.prompt}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return String(h >>> 0)
}

// ---------------------------------------------------------------------
// Heuristic (no-AI) categorizer.
//
// Used as a graceful fallback when the Vercel AI Gateway is unavailable
// (e.g. the workspace doesn't have a credit card on file). It tokenizes
// each post and each seed prompt into lowercase word-stems, then ranks
// categories by how many of *their* keywords appear in the post —
// normalized by the size of the prompt so long prompts don't dominate.
//
// This is obviously much less accurate than embedding similarity, but
// for the dominant case (a tech feed full of "AI", "JavaScript",
// "startup", "VC") it produces the right top category often enough to
// be useful, and importantly: lets the UI keep working at all.

// Stop-word list — tiny on purpose. We just want to remove the most
// common English filler so a post saying "the the the JavaScript" still
// gets bucketed as Technology, not as a no-op.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "for", "of", "to",
  "in", "on", "at", "by", "with", "from", "is", "are", "was", "were",
  "be", "been", "being", "this", "that", "these", "those", "it", "its",
  "as", "i", "you", "we", "they", "he", "she", "him", "her", "them",
  "my", "your", "our", "their", "me", "us", "do", "does", "did", "have",
  "has", "had", "will", "would", "can", "could", "should", "shall", "may",
  "not", "no", "so", "very", "just", "than", "too", "also", "only",
])

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9+#-]{1,}/g) ?? []).filter(
    (t) => t.length > 2 && !STOP_WORDS.has(t),
  )
}

// Build a per-category Set<token> once, lazily. Same hash-keyed cache
// pattern as the embedding seed cache so editing the prompts auto-
// invalidates this too.
type KeywordSeedCache = { hash: string; sets: Set<string>[] }
let keywordCache: KeywordSeedCache | null = null

function getKeywordSeed(): KeywordSeedCache {
  const hash = categoriesHash()
  if (keywordCache && keywordCache.hash === hash) return keywordCache
  keywordCache = {
    hash,
    sets: SEED_CATEGORIES.map((c) => new Set(tokenize(`${c.name} ${c.prompt}`))),
  }
  return keywordCache
}

export type HeuristicResult = {
  top: string | null
  score: number
  alternatives: { name: string; score: number }[]
}

export function heuristicCategorize(fragments: string[]): HeuristicResult[] {
  const seed = getKeywordSeed()
  return fragments.map((frag) => {
    const tokens = new Set(tokenize(frag))
    if (tokens.size === 0) return { top: null, score: 0, alternatives: [] }

    const scored = SEED_CATEGORIES.map((c, i) => {
      const set = seed.sets[i]
      let hits = 0
      for (const t of tokens) if (set.has(t)) hits++
      // Score = (hits / tokens.size) shifted so categories with at least
      // one match always rank above zero-match ones, while still
      // rewarding posts that share many words with a category.
      const denom = Math.max(8, tokens.size)
      return { name: c.name, score: hits === 0 ? 0 : hits / denom }
    })
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]
    if (!top || top.score === 0) return { top: null, score: 0, alternatives: [] }
    return {
      top: top.name,
      score: Number(top.score.toFixed(4)),
      alternatives: scored
        .slice(1, 4)
        .filter((s) => s.score > 0)
        .map((s) => ({ name: s.name, score: Number(s.score.toFixed(4)) })),
    }
  })
}
