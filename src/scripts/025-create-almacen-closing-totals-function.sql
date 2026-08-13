-- Calcula los totales del cierre de almacen para una fecha.
-- Reglas implementadas:
-- 1) Solo cuenta ventas de items que pertenezcan al inventario de almacen.
-- 2) Total facturado = ventas brutas de almacen (antes de devoluciones).
-- 3) En efectivo = solo flujo fisico en efectivo
--    (ventas cash + abonos cash de deuda de almacen - devoluciones cash).
-- 4) Las devoluciones se descuentan por el metodo original de la venta.
--
-- Uso:
--   select * from public.get_almacen_closing_totals('2026-04-15'::date);

CREATE OR REPLACE FUNCTION public.get_almacen_closing_totals(p_date DATE)
RETURNS TABLE (
  closure_date DATE,
  total_facturado NUMERIC(14, 2),
  en_efectivo NUMERIC(14, 2),
  en_tarjeta NUMERIC(14, 2),
  en_transferencia NUMERIC(14, 2),
  a_credito NUMERIC(14, 2),
  devoluciones NUMERIC(14, 2),
  facturas INTEGER,
  devoluciones_count INTEGER
)
LANGUAGE sql
STABLE
AS $$
WITH day_sales AS (
  SELECT s.*
  FROM public.sales s
  WHERE s.date::date = p_date
),
sale_items AS (
  SELECT
    s.id AS sale_id,
    s.invoice_number,
    s.status,
    s.payment_method,
    GREATEST(COALESCE(s.total, 0)::numeric, 0) AS sale_total,
    LEAST(GREATEST(COALESCE(s.amount_paid, 0)::numeric, 0), GREATEST(COALESCE(s.total, 0)::numeric, 0)) AS amount_paid,
    item AS raw_item,
    COALESCE(
      NULLIF(item->>'subtotal', '')::numeric,
      COALESCE(NULLIF(item->>'customPrice', '')::numeric, NULLIF(item->>'sellPrice', '')::numeric, NULLIF(item->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(item->>'quantity', '')::numeric, 0),
      0
    ) AS line_total,
    COALESCE(NULLIF(item->>'id', ''), NULLIF(item->>'productId', '')) AS product_id
  FROM day_sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) item
),
classified_sale_items AS (
  SELECT
    si.*,
    CASE
      WHEN NULLIF(si.raw_item->>'boxNumber', '') IS NOT NULL THEN TRUE
      WHEN lower(COALESCE(si.raw_item->>'category', '')) IN ('flex', 'pantallas', 'baterias', 'tapas') THEN TRUE
      WHEN EXISTS (SELECT 1 FROM public.armacen a WHERE a.id::text = si.product_id) THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id::text = si.product_id
          AND lower(COALESCE(p.category, '')) IN ('flex', 'pantallas', 'baterias', 'tapas')
      ) THEN TRUE
      ELSE FALSE
    END AS is_almacen
  FROM sale_items si
),
sale_ratio AS (
  SELECT
    csi.sale_id,
    MAX(csi.invoice_number) AS invoice_number,
    MAX(csi.status) AS status,
    MAX(csi.payment_method) AS payment_method,
    MAX(csi.sale_total) AS sale_total,
    MAX(csi.amount_paid) AS amount_paid,
    SUM(csi.line_total) AS items_total,
    SUM(CASE WHEN csi.is_almacen THEN csi.line_total ELSE 0 END) AS almacen_items_total,
    BOOL_OR(csi.is_almacen) AS has_almacen,
    BOOL_OR(NOT csi.is_almacen) AS has_non_almacen
  FROM classified_sale_items csi
  GROUP BY csi.sale_id
),
sale_breakdown AS (
  SELECT
    sr.*,
    CASE
      WHEN sr.items_total > 0 THEN LEAST(1, GREATEST(0, sr.almacen_items_total / NULLIF(sr.items_total, 0)))
      WHEN sr.has_almacen AND NOT sr.has_non_almacen THEN 1
      ELSE 0
    END AS almacen_ratio,
    CASE
      WHEN lower(COALESCE(sr.payment_method, '')) IN ('cash', 'card', 'transfer', 'credit')
      THEN lower(sr.payment_method)
      ELSE 'cash'
    END AS normalized_method
  FROM sale_ratio sr
),
sales_by_method AS (
  SELECT
    sb.sale_id,
    sb.invoice_number,
    CASE
      WHEN sb.normalized_method = 'credit' THEN sb.sale_total * sb.almacen_ratio
      WHEN sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total AND sb.normalized_method <> 'credit'
      THEN (sb.sale_total - sb.amount_paid) * sb.almacen_ratio
      ELSE 0
    END AS credit_sales,
    CASE
      WHEN sb.normalized_method = 'cash' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'cash' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS cash_sales,
    CASE
      WHEN sb.normalized_method = 'card' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'card' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS card_sales,
    CASE
      WHEN sb.normalized_method = 'transfer' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'transfer' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS transfer_sales
  FROM sale_breakdown sb
  WHERE sb.almacen_ratio > 0
    AND lower(COALESCE(sb.status, '')) NOT IN ('pending', 'anulada', 'cancelled')
),
day_returns AS (
  SELECT r.*
  FROM public.returns r
  WHERE r.date::date = p_date
),
return_items AS (
  SELECT
    r.id AS return_id,
    r.invoice_id AS sale_id,
    item AS raw_item,
    COALESCE(
      NULLIF(item->>'subtotal', '')::numeric,
      COALESCE(NULLIF(item->>'unitPrice', '')::numeric, 0) * COALESCE(NULLIF(item->>'quantity', '')::numeric, 0),
      0
    ) AS line_total,
    COALESCE(NULLIF(item->>'productId', ''), NULLIF(item->>'id', '')) AS product_id,
    lower(COALESCE(item->>'productName', item->>'name', '')) AS product_name
  FROM day_returns r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
),
matched_return_items AS (
  SELECT
    ri.*,
    matched.item AS matched_sale_item
  FROM return_items ri
  LEFT JOIN LATERAL (
    SELECT si.item
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) si(item)
    WHERE s.id = ri.sale_id
      AND (
        COALESCE(NULLIF(si.item->>'id', ''), NULLIF(si.item->>'productId', '')) = COALESCE(ri.product_id, '')
        OR lower(COALESCE(si.item->>'name', '')) = ri.product_name
      )
    LIMIT 1
  ) matched ON TRUE
),
classified_return_items AS (
  SELECT
    mri.return_id,
    mri.sale_id,
    mri.line_total,
    CASE
      WHEN NULLIF(COALESCE(mri.matched_sale_item->>'boxNumber', mri.raw_item->>'boxNumber'), '') IS NOT NULL THEN TRUE
      WHEN lower(COALESCE(mri.matched_sale_item->>'category', mri.raw_item->>'category', '')) IN ('flex', 'pantallas', 'baterias', 'tapas') THEN TRUE
      WHEN EXISTS (SELECT 1 FROM public.armacen a WHERE a.id::text = mri.product_id) THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id::text = mri.product_id
          AND lower(COALESCE(p.category, '')) IN ('flex', 'pantallas', 'baterias', 'tapas')
      ) THEN TRUE
      ELSE FALSE
    END AS is_almacen
  FROM matched_return_items mri
),
returns_almacen AS (
  SELECT
    cri.return_id,
    cri.sale_id,
    SUM(CASE WHEN cri.is_almacen THEN cri.line_total ELSE 0 END) AS almacen_return_total
  FROM classified_return_items cri
  GROUP BY cri.return_id, cri.sale_id
  HAVING SUM(CASE WHEN cri.is_almacen THEN cri.line_total ELSE 0 END) > 0
),
return_sales_source AS (
  SELECT DISTINCT ra.sale_id
  FROM returns_almacen ra
),
return_sales_breakdown AS (
  SELECT
    s.id AS sale_id,
    GREATEST(COALESCE(s.total, 0)::numeric, 0) AS sale_total,
    LEAST(GREATEST(COALESCE(s.amount_paid, 0)::numeric, 0), GREATEST(COALESCE(s.total, 0)::numeric, 0)) AS amount_paid,
    CASE
      WHEN lower(COALESCE(s.payment_method, '')) IN ('cash', 'card', 'transfer', 'credit')
      THEN lower(s.payment_method)
      ELSE 'cash'
    END AS normalized_method
  FROM public.sales s
  INNER JOIN return_sales_source rss ON rss.sale_id = s.id
),
return_method_base AS (
  SELECT
    rsb.sale_id,
    rsb.sale_total,
    rsb.normalized_method,
    CASE
      WHEN rsb.normalized_method = 'credit' THEN rsb.sale_total
      WHEN rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total AND rsb.normalized_method <> 'credit'
      THEN rsb.sale_total - rsb.amount_paid
      ELSE 0
    END AS credit_amount,
    CASE
      WHEN rsb.normalized_method = 'cash' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'cash' THEN rsb.sale_total
      ELSE 0
    END AS cash_amount,
    CASE
      WHEN rsb.normalized_method = 'card' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'card' THEN rsb.sale_total
      ELSE 0
    END AS card_amount,
    CASE
      WHEN rsb.normalized_method = 'transfer' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'transfer' THEN rsb.sale_total
      ELSE 0
    END AS transfer_amount
  FROM return_sales_breakdown rsb
),
returns_by_method AS (
  SELECT
    ra.return_id,
    ra.almacen_return_total,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.cash_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'cash' THEN ra.almacen_return_total
      WHEN rmb.sale_id IS NULL THEN ra.almacen_return_total
      ELSE 0
    END AS cash_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.card_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'card' THEN ra.almacen_return_total
      ELSE 0
    END AS card_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.transfer_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'transfer' THEN ra.almacen_return_total
      ELSE 0
    END AS transfer_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.credit_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'credit' THEN ra.almacen_return_total
      ELSE 0
    END AS credit_returns
  FROM returns_almacen ra
  LEFT JOIN return_method_base rmb ON rmb.sale_id = ra.sale_id
),
agg_sales AS (
  SELECT
    COALESCE(SUM(cash_sales), 0) AS cash_sales,
    COALESCE(SUM(card_sales), 0) AS card_sales,
    COALESCE(SUM(transfer_sales), 0) AS transfer_sales,
    COALESCE(SUM(credit_sales), 0) AS credit_sales,
    COUNT(*)::int AS invoices_count
  FROM sales_by_method
),
agg_returns AS (
  SELECT
    COALESCE(SUM(cash_returns), 0) AS cash_returns,
    COALESCE(SUM(card_returns), 0) AS card_returns,
    COALESCE(SUM(transfer_returns), 0) AS transfer_returns,
    COALESCE(SUM(credit_returns), 0) AS credit_returns,
    COALESCE(SUM(almacen_return_total), 0) AS returns_total,
    COUNT(*)::int AS returns_count
  FROM returns_by_method
),
agg_payments AS (
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN lower(COALESCE(ap.payment_method, 'cash')) = 'cash' THEN COALESCE(ap.amount, 0)
          ELSE 0
        END
      ),
      0
    ) AS cash_payments
  FROM public.almacen_payments ap
  WHERE ap.date::date = p_date
)
SELECT
  p_date AS closure_date,
  ROUND((asales.cash_sales + asales.card_sales + asales.transfer_sales + asales.credit_sales)::numeric, 2) AS total_facturado,
  ROUND((asales.cash_sales + apay.cash_payments - aret.cash_returns)::numeric, 2) AS en_efectivo,
  ROUND((asales.card_sales - aret.card_returns)::numeric, 2) AS en_tarjeta,
  ROUND((asales.transfer_sales - aret.transfer_returns)::numeric, 2) AS en_transferencia,
  ROUND((asales.credit_sales - aret.credit_returns)::numeric, 2) AS a_credito,
  ROUND(aret.returns_total::numeric, 2) AS devoluciones,
  asales.invoices_count AS facturas,
  aret.returns_count AS devoluciones_count
FROM agg_sales asales
CROSS JOIN agg_returns aret
CROSS JOIN agg_payments apay;
$$;
