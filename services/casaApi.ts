import { supabase } from './supabase';
import { Cocktail, EventSession, IngredientAvailability, Order, OrderStatus } from '../types';
import { Mutation, Snapshot } from './offlineStore';

type ApiEnvelope = { ok: boolean; error?: string; [key: string]: unknown };
type SnapshotEnvelope = ApiEnvelope & { orders?: Record<string, unknown>[]; availability?: IngredientAvailability; revisions?: Record<string, number> };

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
  guestEmail: row.guest_email ? String(row.guest_email) : undefined,
  revision: Number(row.revision || 0),
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

  async startGuestSession(eventCode: string, guestName: string, guestPhone?: string, guestEmail?: string): Promise<EventSession> {
    const result = await unwrap<ApiEnvelope>(supabase.rpc('casa_begin_guest_session_v5', {
      p_event_code: eventCode, p_guest_name: guestName, p_guest_phone: guestPhone || null, p_guest_email: guestEmail || null,
    }));
    return {
      eventCode: String(result.eventCode), isBartender: false,
      guestName: String(result.guestName),
      guestPhone: result.guestPhone ? String(result.guestPhone) : undefined,
      guestEmail: result.guestEmail ? String(result.guestEmail) : undefined,
      token: String(result.token), expiresAt: String(result.expiresAt),
    };
  },

  async getSnapshot(sessionToken: string): Promise<Snapshot> {
    const result = await unwrap<SnapshotEnvelope>(supabase.rpc('casa_event_snapshot_v5', {
      p_session_token: sessionToken,
    }));
    return { orders: (result.orders || []).map(mapOrderFromDB), availability: result.availability || {}, revisions: result.revisions || {}, savedAt: Date.now() };
  },

  async applyMutation(sessionToken: string, mutation: Mutation): Promise<{ conflict?: boolean; revision?: number; error?: string }> {
    const { data, error } = await supabase.rpc('casa_apply_mutation', {
      p_session_token: sessionToken, p_mutation_id: mutation.id,
      p_kind: mutation.kind, p_payload: mutation, p_expected_revision: mutation.expectedRevision,
    });
    if (error) throw new CasaApiError(error.message);
    if (data?.conflict) return data;
    if (!data?.ok) throw new CasaApiError(data?.error || 'Could not sync this change.', /expired|access is required/i.test(data?.error || ''));
    return data;
  },

  async placeOrder(sessionToken: string, cocktail: Cocktail, idempotencyKey: string): Promise<void> {
    await unwrap<ApiEnvelope>(supabase.rpc('casa_place_order_v5', {
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
