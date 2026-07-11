// ── Eval test set ─────────────────────────────────────────────────────────────
// Fixed inputs with expected outputs. These NEVER change between runs —
// that's what makes them comparable. Add new cases; never modify existing ones
// (modify = losing the historical baseline for that case).
//
// Expected shape is partial — only specify the categories you care about for
// that input. Unspecified categories are ignored in scoring (not penalised).

export type ExpectedPreferences = {
  categories?: { name: string; optedIn: boolean }[]
  dietary?:    { name: string; optedIn: boolean }[]
  events?:     { name: string; optedIn: boolean }[]
  style?:      { name: string; optedIn: boolean }[]
  brands?:     { name: string; optedIn: boolean }[]
}

export type TestCase = {
  id:          string
  input:       string
  expected:    ExpectedPreferences
  shouldBeEmpty: boolean   // true = parser should return isEmpty for this input
  tags:        string[]    // for filtering: 'positive', 'negative', 'ambiguous', 'multi-category'
}

export const TEST_CASES: TestCase[] = [
  {
    id:            'tc-01',
    input:         'I love Nike and Adidas',
    expected:      { brands: [{ name: 'Nike', optedIn: true }, { name: 'Adidas', optedIn: true }] },
    shouldBeEmpty: false,
    tags:          ['positive', 'brands'],
  },
  {
    id:            'tc-02',
    input:         'I hate synthetic fabrics and avoid Zara',
    expected:      { brands: [{ name: 'Zara', optedIn: false }] },
    shouldBeEmpty: false,
    tags:          ['negative', 'brands'],
  },
  {
    id:            'tc-03',
    input:         "I'm vegetarian and gluten-free",
    expected:      { dietary: [{ name: 'Vegetarian', optedIn: true }, { name: 'Gluten-free', optedIn: true }] },
    shouldBeEmpty: false,
    tags:          ['positive', 'dietary'],
  },
  {
    id:            'tc-04',
    input:         'I prefer casual and minimalist styles',
    expected:      { style: [{ name: 'Casual', optedIn: true }, { name: 'Minimalist', optedIn: true }] },
    shouldBeEmpty: false,
    tags:          ['positive', 'style'],
  },
  {
    id:            'tc-05',
    input:         'I always shop during Christmas and Black Friday',
    expected:      { events: [{ name: 'Christmas', optedIn: true }, { name: 'Black Friday', optedIn: true }] },
    shouldBeEmpty: false,
    tags:          ['positive', 'events'],
  },
  {
    id:            'tc-06',
    input:         "I'm vegan, love Nike, prefer casual style",
    expected:      {
      dietary: [{ name: 'Vegan', optedIn: true }],
      brands:  [{ name: 'Nike', optedIn: true }],
      style:   [{ name: 'Casual', optedIn: true }],
    },
    shouldBeEmpty: false,
    tags:          ['positive', 'multi-category'],
  },
  {
    id:            'tc-07',
    input:         'I like comfortable clothes',
    expected:      {},
    shouldBeEmpty: true,   // "comfortable" not on whitelist — should extract nothing
    tags:          ['ambiguous', 'hallucination-probe'],
  },
  {
    id:            'tc-08',
    input:         'test',
    expected:      {},
    shouldBeEmpty: true,
    tags:          ['edge-case'],
  },
  {
    id:            'tc-09',
    input:         'i love NIKE and casual STYLES',
    expected:      { brands: [{ name: 'Nike', optedIn: true }], style: [{ name: 'Casual', optedIn: true }] },
    shouldBeEmpty: false,
    tags:          ['positive', 'case-sensitivity'],
  },
  {
    id:            'tc-10',
    input:         "I don't like formal or sporty styles",
    expected:      { style: [{ name: 'Formal', optedIn: false }, { name: 'Sporty', optedIn: false }] },
    shouldBeEmpty: false,
    tags:          ['negative', 'style'],
  },
]