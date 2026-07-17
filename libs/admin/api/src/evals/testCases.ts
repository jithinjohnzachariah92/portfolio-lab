export type TestCaseType =
  | 'set'
  | 'empty'
  | 'negation-explicit'
  | 'negation-absence'
  | 'and'
  | 'or'
  | 'mixed'

export type NL2MongoTestCase = {
  id: string
  type: TestCaseType
  input: string
  groundTruthFilter: Record<string, unknown>
  expectEmpty?: boolean
}

export const NL2MONGO_TEST_CASES: NL2MongoTestCase[] = [
  {
    id: 'nlm-01',
    type: 'set',
    input: 'List customers who like Nike',
    groundTruthFilter: { 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } },
  },
  {
    id: 'nlm-02',
    type: 'set',
    input: 'Which customers have a dietary preference set?',
    groundTruthFilter: { 'preferences.dietary': { $elemMatch: { optedIn: true } } },
  },
  {
    id: 'nlm-03',
    type: 'set',
    input: 'List customers who are interested in Christmas',
    groundTruthFilter: { 'preferences.events': { $elemMatch: { name: 'Christmas', optedIn: true } } },
  },
  {
    id: 'nlm-04',
    type: 'set',
    input: 'Which customers have any style preference?',
    groundTruthFilter: { 'preferences.style': { $elemMatch: { optedIn: true } } },
  },
  {
    id: 'nlm-05',
    type: 'empty',
    input: 'List all Sparks members',
    groundTruthFilter: { sparksMember: true },
    expectEmpty: true,
  },
  {
    id: 'nlm-06',
    type: 'empty',
    input: 'Which customers have placed at least one order?',
    groundTruthFilter: { totalOrders: { $gt: 0 } },
    expectEmpty: true,
  },
  {
    id: 'nlm-07',
    type: 'negation-explicit',
    input: 'List customers who have explicitly said they dislike Nike',
    groundTruthFilter: { 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: false } } },
  },
  {
    id: 'nlm-08',
    type: 'negation-absence',
    input: 'List customers who have never expressed any opinion about Nike',
    groundTruthFilter: {
      'preferences.brands': { $not: { $elemMatch: { name: 'Nike' } } },
    },
  },
  {
    id: 'nlm-09',
    type: 'and',
    input: 'List customers who like both Nike and Christmas',
    groundTruthFilter: {
      $and: [
        { 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } },
        { 'preferences.events': { $elemMatch: { name: 'Christmas', optedIn: true } } },
      ],
    },
  },
  {
    id: 'nlm-10',
    type: 'or',
    input: 'List customers who like Nike or Adidas',
    groundTruthFilter: {
      $or: [
        { 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } },
        { 'preferences.brands': { $elemMatch: { name: 'Adidas', optedIn: true } } },
      ],
    },
  },
  {
    id: 'nlm-11',
    type: 'mixed',
    input: 'List Sparks members who also like Nike',
    groundTruthFilter: {
      $and: [
        { sparksMember: true },
        { 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } },
      ],
    },
    expectEmpty: true,
  },
  {
    id: 'nlm-12',
    type: 'mixed',
    input: 'List customers who are not Sparks members but like Christmas',
    groundTruthFilter: {
      $and: [
        { sparksMember: false },
        { 'preferences.events': { $elemMatch: { name: 'Christmas', optedIn: true } } },
      ],
    },
  },
]