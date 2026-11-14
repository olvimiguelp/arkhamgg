// Run with node src/scripts/tests/public-catalog-almacen.test.mjs [path-to-pglite]
// Uses an isolated, in-memory PostgreSQL database; never connects to Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
const owner = '00000000-0000-4000-8000-000000000001'
const otherOwner = '00000000-0000-4000-8000-000000000002'
const battery = '00000000-0000-4000-8000-000000000011'
const screen = '00000000-0000-4000-8000-000000000012'
const custom = '00000000-0000-4000-8000-000000000013'
const foreign = '00000000-0000-4000-8000-000000000014'

try {
  // Minimal existing schema, matching the columns used by the production RPCs.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE catalog_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT UNIQUE,
      owner_admin_id UUID, product_ids UUID[] DEFAULT '{}', business_name TEXT,
      active BOOLEAN DEFAULT TRUE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
      price_mode TEXT DEFAULT 'normal'
    );
    CREATE TABLE products (
      id UUID PRIMARY KEY, owner_admin_id UUID, sku VARCHAR(50), name VARCHAR(255),
      category VARCHAR(100), stock INTEGER, sell_price NUMERIC(10,2), wholesale_price NUMERIC(10,2),
      image_url TEXT, image_thumbnail_url TEXT, updated_at TIMESTAMPTZ
    );
    CREATE TABLE armacen (
      id UUID PRIMARY KEY, owner_admin_id UUID, sku VARCHAR(50), name VARCHAR(255),
      category VARCHAR(100), stock INTEGER, sell_price NUMERIC, box_number VARCHAR(50),
      image_url TEXT, updated_at TIMESTAMPTZ
    );
    CREATE TABLE sales (
      id UUID PRIMARY KEY, owner_admin_id UUID, invoice_number TEXT, items JSONB,
      subtotal NUMERIC, total NUMERIC, amount_paid NUMERIC, change NUMERIC,
      payment_method TEXT, customer_name TEXT, customer_phone TEXT, status TEXT, is_wholesale BOOLEAN
    );
    INSERT INTO catalog_shares(token, owner_admin_id, price_mode) VALUES
      ('normal', '${owner}', 'normal'), ('wholesale', '${owner}', 'wholesale');
  `)
  const migration = await readFile(new URL('../070-public-catalog-almacen.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // The numbered script is safe to reapply.
  await db.exec(`
    INSERT INTO armacen(id, owner_admin_id, sku, name, category, stock, sell_price, box_number) VALUES
      ('${battery}', '${owner}', '20001', 'Batería A', ' Batería ', 10, 100, '1'),
      ('${screen}', '${owner}', '10001', 'Pantalla A', 'pantallas', 10, 200, '2'),
      ('${custom}', '${owner}', '80001', 'Conector A', 'Conectores USB', 10, 50, '3'),
      ('${foreign}', '${otherOwner}', '20002', 'Otra batería', 'baterias', 10, 100, '4');
    INSERT INTO products(id, owner_admin_id, sku, name, category, stock, sell_price, wholesale_price)
      VALUES ('${battery}', '${owner}', 'P001', 'Producto normal', 'Accesorios', 20, 300, 250);
    INSERT INTO catalog_shares(token, owner_admin_id, source_table, category_filter) VALUES
      ('batteries', '${owner}', 'armacen', 'baterias'),
      ('screens', '${owner}', 'armacen', 'pantallas'),
      ('custom', '${owner}', 'armacen', 'conectores usb');
  `)
  const snapshot = async (token, search = null, category = null, offset = 0, limit = 24) =>
    (await db.query('SELECT get_public_catalog_snapshot($1,$2,$3,$4,$5,TRUE) AS data',
      [token, limit, offset, search, category])).rows[0].data
  const order = (token, items) => db.query('SELECT submit_catalog_order($1,$2,$3,$4::jsonb) AS id',
    [token, 'Cliente prueba', '8095550100', JSON.stringify(items)])
  const stock = async (table, id) => (await db.query(`SELECT stock FROM ${table} WHERE id=$1`, [id])).rows[0].stock

  assert.deepEqual((await snapshot('batteries')).products.map(p => p.id), [battery])
  assert.deepEqual((await snapshot('batteries')).categories, ['baterias'])
  assert.equal((await snapshot('batteries')).category_filter, 'baterias')
  assert.deepEqual((await snapshot('screens')).products.map(p => p.id), [screen])
  assert.deepEqual((await snapshot('custom')).products.map(p => p.id), [custom])
  assert.equal((await snapshot('batteries', null, 'pantallas')).products.length, 0)
  assert.equal((await snapshot('batteries', 'Pantalla')).products.length, 0)
  assert.equal((await snapshot('batteries', '20001')).products.length, 1)
  assert.equal((await snapshot('normal')).products[0].sell_price, 300)
  assert.equal((await snapshot('wholesale')).products[0].sell_price, 250)
  assert.equal((await snapshot('normal')).products[0].name, 'Producto normal')

  await db.exec(`INSERT INTO armacen(id, owner_admin_id, sku, name, category, stock, sell_price)
    SELECT gen_random_uuid(), '${owner}', 'B' || n, 'Batería extra ' || n, 'baterias', 1, 10
    FROM generate_series(1, 25) n;
    INSERT INTO armacen(id, owner_admin_id, sku, name, category, stock, sell_price) VALUES
      (gen_random_uuid(), '${owner}', 'B0', 'Sin stock', 'baterias', 0, 10),
      (gen_random_uuid(), '${owner}', 'B00', 'Sin precio', 'baterias', 10, 0);
  `)
  const page1 = await snapshot('batteries')
  const page2 = await snapshot('batteries', null, null, 24)
  assert.equal(page1.products.length, 24)
  assert.equal(page1.has_more, true)
  assert.equal(page2.products.length, 2)
  assert.equal(page2.has_more, false)
  assert.equal(new Set([...page1.products, ...page2.products].map(p => p.id)).size, 26)
  assert.ok([...page1.products, ...page2.products].every(p => p.category === 'baterias'))
  const legacy = (await db.query("SELECT * FROM get_public_catalog_products('batteries')")).rows
  assert.equal(legacy.length, 26)
  assert.ok(legacy.every(p => p.category === 'baterias'))
  assert.deepEqual((await db.query("SELECT * FROM get_public_catalog_categories('batteries')")).rows, [{ category: 'baterias' }])

  await assert.rejects(order('batteries', [{ id: screen, quantity: 1 }]))
  await assert.rejects(order('batteries', [{ id: foreign, quantity: 1 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 11 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 0 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 1 }, { id: screen, quantity: 1 }]))
  assert.equal(await stock('armacen', battery), 10)
  const result = await order('batteries', [{ id: battery, quantity: 2, sell_price: 1 }])
  const sale = (await db.query('SELECT * FROM sales WHERE id=$1', [result.rows[0].id])).rows[0]
  assert.equal(Number(sale.total), 200)
  assert.equal(sale.items[0].sourceTable, 'armacen')
  assert.equal(sale.items[0].boxNumber, '1')
  assert.equal(sale.items[0].sourceId, battery)
  assert.equal(sale.status, 'pending')
  assert.equal(await stock('armacen', battery), 8)
  assert.equal(await stock('products', battery), 20)
  await order('wholesale', [{ id: battery, quantity: 1 }])
  assert.equal(await stock('products', battery), 19)
  assert.equal(await stock('armacen', battery), 8)
  await db.exec("UPDATE catalog_shares SET active=FALSE WHERE token='batteries'")
  await assert.rejects(snapshot('batteries'))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 1 }]))
  await assert.rejects(snapshot('unknown'))
  console.log('PASS: category isolation, aliases, custom categories, pagination, legacy RPCs, tenant isolation, prices, orders, rollback, source stock, inactive links and idempotent migration.')
} finally {
  await db.close()
}
