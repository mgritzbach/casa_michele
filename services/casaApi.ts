import { supabase } from './supabase';
import { Cocktail, EventSession, IngredientAvailability, Order, OrderStatus } from '../types';

type ApiEnvelope = { ok: boolean; error?: string; [key: string]: unknown };
type SnapshotEnvelope = ApiEnvelope & { orders?: Record<string, unknown>[]; availability?: IngredientAvailability };

export class CasaApiError extends Error {
  constructor(message: string, public readonly isSessionExpired = false) {
    super(message);
    this.name = 'CasaApiError';
  }
}

const unwrap = async <T extends ApiEnvelope>(
  request: PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<T> => {
  const { data, error } = await request;
  if (error) throw new CasaApiError(error.message || 'Could not reach Casa Michele.');
  const result = data as T | null;
  if (!result?.ok) {
    const message = result?.error || 'Something went wrong. Please try again.';
    throw new CasaApiError(message, /session expired|valid guest session|required/i.test(message));
  }
  return result;
};

export const mapOrderFromDB = (row: Record<string, unknown>): Order => ({
  id: String(row.id),
  eventCode: String(row.event_code),
  guestName: String(row.guest_name || 'Guest'),
  guestPhone: row.guest_phone ? String(row.guest_phone) : undefined,
  cocktailId: String(row.cocktail_id),
  cocktailName: String(row.cocktail_name),
  status: row.status as OrderStatus,
  timestamp: row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
});

export const CasaApi = {
  async startBartenderSession(eventCode: string, pin: string): Promise<EventSession> {
    const result = await unwrap<ApiEnvelope>(supabase.rpc('casa_begin_bartender_session', {
      p_event_code: eventCode, p_pin: pin,
    }));
    return {
      eventCode: String(result.eventCode), isBartender: true,
      token: String(result.token), expiresAt: String(result.expiresAt),
    };
  },

  async startGuestSession(eventCode: string, guestName: string, guestPhone?: string): Promise<EventSession> {
    const result = await unwrap<ApiEnvelope>(supabase.rpc('casa_begin_guest_session', {
      p_event_code: eventCode, p_guest_name: guestName, p_guest_phone: guestPhone || null,
    }));
    return {
      eventCode: String(result.eventCode), isBartender: false,
      guestName: String(result.guestName),
      guestPhone: result.guestPhone ? String(result.guestPhone) : undefined,
      token: String(result.token), expiresAt: String(result.expiresAt),
    };
  },

  async getSnapshot(sessionToken: string): Promise<{ orders: Order[]; availability: IngredientAvailability }> {
    const result = await unwrap<SnapshotEnvelope>(supabase.rpc('casa_event_snapshot', {
      p_session_token: sessionToken,
    }));
    return { orders: (result.orders || []).map(mapOrderFromDB), availability: result.availability || {} };
  },

  async placeOrder(sessionToken: string, cocktail: Cocktail, idempotencyKey: string): Promise<void> {
    await unwrap<ApiEnvelope>(supabase.rpc('casa_place_order', {
      p_session_token: sessionToken,
      p_cocktail_id: cocktail.id,
      p_cocktail_name: cocktail.name,
      p_ingredients: cocktail.ingredients,
      p_idempotency_key: idempotencyKey,
    }));
  },

  async updateOrderStatus(sessionToken: string, orderId: string, status: OrderStatus): Promise<void> {
    await unwrap<ApiEnvelope>(supabase.rpc('casa_update_order_status', {
      p_session_token: sessionToken, p_order_id: orderId, p_status: status,
    }));
  },

  async setAvailability(sessionToken: string, ingredientName: string, isAvailable: boolean): Promise<void> {
    await unwrap<ApiEnvelope>(supabase.rpc('casa_set_availability', {
      p_session_token: sessionToken,
      p_ingredient_name: ingredientName,
      p_is_available: isAvailable,
    }));
  },
};
