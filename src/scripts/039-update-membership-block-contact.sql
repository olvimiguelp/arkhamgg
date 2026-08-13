-- Contacto de soporte en pagina de bloqueo
UPDATE public.system_config
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'support_email', 'olvimiguelp@gmail.com',
  'support_whatsapp', '829-963-3150'
)
WHERE key = 'membership_block';
