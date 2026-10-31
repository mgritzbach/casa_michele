import { Cocktail, IngredientAvailability } from '../types';

// Availability records store true for ingredients marked out of stock.
export function missingIngredients(cocktail: Cocktail, availability: IngredientAvailability): string[] {
  return cocktail.ingredients.filter(ingredient => availability[ingredient] === true);
}

export function filterRecipes(cocktails: Cocktail[], availability: IngredientAvailability, query: string, makeableOnly: boolean): Cocktail[] {
  const search = query.trim().toLowerCase();
  return cocktails.filter(cocktail =>
    (!makeableOnly || missingIngredients(cocktail, availability).length === 0) &&
    [cocktail.name, ...cocktail.ingredients].some(value => value.toLowerCase().includes(search)));
}

export function canGuestOrder(cocktail: Cocktail, availability: IngredientAvailability, allowOutOfStockOrders: boolean): boolean {
  return allowOutOfStockOrders || missingIngredients(cocktail, availability).length === 0;
}
