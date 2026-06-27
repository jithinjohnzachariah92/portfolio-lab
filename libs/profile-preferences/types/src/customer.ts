export interface IPreferenceItem {
  name: string;
  optedIn: boolean;
}

export interface ICustomerPreferences {
  categories: IPreferenceItem[];
  dietary: IPreferenceItem[];
  events: IPreferenceItem[];
  style: IPreferenceItem[];
  brands: IPreferenceItem[];
}

export interface ICustomer {
  _id: string;
  name: string;
  email: string;
  sparksMember: boolean;
  profileComplete: boolean;
  totalOrders: number;
  totalSpend: number;
  lastLogin: string;
  accountCreatedAt: string;
  preferences: ICustomerPreferences;
}

export interface IQueryResult {
  question: string;
  generatedQuery: Record<string, unknown>;
  results: ICustomer[];
  count: number;
}

export interface IQueryError {
  message: string;
}