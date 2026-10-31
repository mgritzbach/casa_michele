import { describe, expect, it } from 'vitest';
import { Cocktail } from '../types';
import { canGuestOrder, filterRecipes, missingIngredients } from '../services/stock';

const gin: Cocktail = { id: 'gin', name: 'Gin sour', ingredients: ['Gin', 'Lemon'], description: '', instructions: '', imageUrl: '', tasteProfiles: [] };
const rum = { ...gin, id: 'rum', name: 'Daiquiri', ingredients: ['Rum', 'Lime'] };

describe('stock-aware menus', () => {
  it('reports exactly which selected ingredients are unavailable', () => {
    expect(missingIngredients(gin, { Gin: true, Lemon: false, Rum: true })).toEqual(['Gin']);
    expect(missingIngredients(gin, {})).toEqual([]);
  });
  it('combines availability with name and ingredient search', () => {
    expect(filterRecipes([gin, rum], { Gin: true }, '', false)).toEqual([gin, rum]);
    expect(filterRecipes([gin, rum], { Gin: true }, '', true)).toEqual([rum]);
    expect(filterRecipes([gin, rum], { Gin: true }, ' LIME ', true)).toEqual([rum]);
    expect(filterRecipes([gin, rum], { Gin: true }, 'gin', true)).toEqual([]);
    expect(filterRecipes([gin, rum], { Gin: false }, 'GIN', true)).toEqual([gin]);
  });
  it('permits unavailable guest drinks only when the event allows them', () => {
    expect(canGuestOrder(gin, { Gin: true }, false)).toBe(false);
    expect(canGuestOrder(gin, { Gin: true }, true)).toBe(true);
    expect(canGuestOrder(gin, {}, false)).toBe(true);
  });
});
