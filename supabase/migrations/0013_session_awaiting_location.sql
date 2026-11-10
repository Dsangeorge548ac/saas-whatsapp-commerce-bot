-- 0013: nuevo estado de conversación `awaiting_location` (el bot pide la ubicación GPS para el delivery).
-- Va en su propia migración: un valor nuevo de ENUM no se puede usar en la misma transacción.
alter type public.session_state add value if not exists 'awaiting_location' before 'awaiting_notes';
