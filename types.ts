
export type OrderStatus = 'pending' | 'completed' | 'deleted';

export interface Cocktail {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  instructions: string;
  imageUrl: string;
  tasteProfiles: string[];
}

export interface IngredientAvailability {
  [name: string]: boolean;
}

export interface Order {
  id: string;
  eventCode: string;
  guestName: string;
  cocktailId: string;
  cocktailName: string;
  status: OrderStatus;
  timestamp: number;
  guestPhone?: string;
  guestEmail?: string;
  revision?: number;
}

export interface EventSession {
  eventCode: string;
  isBartender: boolean;
  guestName?: string;
  guestPhone?: string;
  token: string;
  expiresAt: string;
  offlineOnly?: boolean;
  guestEmail?: string;
}

export interface AppState {
  currentEvent: EventSession | null;
  cocktails: Cocktail[];
  orders: Order[];
  availability: IngredientAvailability;
}
