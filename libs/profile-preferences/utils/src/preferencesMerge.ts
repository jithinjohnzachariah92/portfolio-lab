import { ICustomerPreferences, IPreferenceItem, PreferenceType, PREFERENCE_TYPES } from "@profile-preferences/types";

export function mergePreferences(
  existing: ICustomerPreferences,
  parsed: ICustomerPreferences
): ICustomerPreferences {
  return {
    categories: mergeCategory(existing.categories, parsed.categories),
    dietary: mergeCategory(existing.dietary, parsed.dietary),
    events: mergeCategory(existing.events, parsed.events),
    style: mergeCategory(existing.style, parsed.style),
    brands: mergeCategory(existing.brands, parsed.brands),
  };
}

function mergeCategory(
  existing: IPreferenceItem[],
  parsed: IPreferenceItem[]
): IPreferenceItem[] {
  return existing.map((item) => {
    const parsedItem = parsed.find(
      (p) => p.name.toLowerCase() === item.name.toLowerCase()
    );
    return {
      ...item,
      optedIn: parsedItem ? parsedItem.optedIn : item.optedIn,
    };
  });
}

export function getAffectedCategories(
  oldPrefs: ICustomerPreferences,
  newPrefs: ICustomerPreferences
): PreferenceType[] {
  const affected: PreferenceType[] = [];

  PREFERENCE_TYPES.forEach(({ type }) => {
    const oldItems = oldPrefs[type];
    const newItems = newPrefs[type];

    const changed = oldItems.some((oldItem, idx) => {
      const newItem = newItems[idx];
      return oldItem.optedIn !== newItem.optedIn;
    });

    if (changed) affected.push(type);
  });

  return affected;
}
