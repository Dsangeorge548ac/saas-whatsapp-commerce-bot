-- 0008: nuevo estado de pedido `awaiting_payment` (antes de `pending`).
-- El pedido solo "empieza" (Kanban, avisos al cliente) cuando ya pagó. Va en su propia migración
-- porque un valor nuevo de ENUM no se puede usar en la misma transacción en que se crea.
alter type public.order_status add value if not exists 'awaiting_payment' before 'pending';
