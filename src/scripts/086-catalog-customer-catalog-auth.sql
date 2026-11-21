REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_catalog_snapshot(
  TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_snapshot(
  TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) TO service_role;

GRANT EXECUTE ON FUNCTION public.catalog_storefront_sections(UUID)
  TO service_role;
