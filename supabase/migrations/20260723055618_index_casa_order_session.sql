-- Cover the order-to-session foreign key for cleanup and session-scoped lookups.
create index if not exists orders_casa_session_id_idx
  on public.orders (casa_session_id)
  where casa_session_id is not null;
