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
const unavailable = '00000000-0000-4000-8000-000000000015'
const historicalSale = '00000000-0000-4000-8000-000000000021'

try {
  // Minimal existing schema, matching the columns used by the production RPCs.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE employees (
      id UUID PRIMARY KEY, owner_admin_id UUID, role TEXT, status TEXT,
      password TEXT, permissions JSONB
    );
    INSERT INTO employees(id, owner_admin_id, role, status, password, permissions)
      VALUES ('${owner}', '${owner}', 'admin', 'active', 'test-password', '{"employees":true,"canAdd":true}');
    CREATE TABLE catalog_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT UNIQUE,
      owner_admin_id UUID, product_ids UUID[] DEFAULT '{}', business_name TEXT,
      active BOOLEAN DEFAULT TRUE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
      price_mode TEXT DEFAULT 'normal'
    );
    CREATE TABLE products (
      id UUID PRIMARY KEY, owner_admin_id UUID, sku VARCHAR(50), name VARCHAR(255),
      category VARCHAR(100), stock INTEGER, sell_price NUMERIC(10,2), wholesale_price NUMERIC(10,2),
      image_url TEXT, image_thumbnail_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ
    );
    CREATE TABLE armacen (
      id UUID PRIMARY KEY, owner_admin_id UUID, sku VARCHAR(50), name VARCHAR(255),
      category VARCHAR(100), stock INTEGER, sell_price NUMERIC, box_number VARCHAR(50),
      image_url TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ
    );
    CREATE TABLE sales (
      id UUID PRIMARY KEY, owner_admin_id UUID, invoice_number TEXT, items JSONB,
      subtotal NUMERIC, total NUMERIC, amount_paid NUMERIC, change NUMERIC,
      payment_method TEXT, customer_name TEXT, customer_phone TEXT, status TEXT, is_wholesale BOOLEAN,
      date TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now()
    );
    INSERT INTO catalog_shares(token, owner_admin_id, price_mode) VALUES
      ('normal', '${owner}', 'normal'), ('wholesale', '${owner}', 'wholesale');
  `)
  const migration = await readFile(new URL('../070-public-catalog-almacen.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // The numbered script is safe to reapply.
  await db.exec(await readFile(new URL('../071-public-catalog-multiple-almacen-categories.sql', import.meta.url), 'utf8'))
  await db.exec(`
    INSERT INTO armacen(id, owner_admin_id, sku, name, category, stock, sell_price, box_number) VALUES
      ('${battery}', '${owner}', '20001', 'Batería A', ' Batería ', 10, 100, '1'),
      ('${screen}', '${owner}', '10001', 'Pantalla A', 'pantallas', 10, 200, '2'),
      ('${custom}', '${owner}', '80001', 'Conector A', 'Conectores USB', 10, 50, '3'),
      ('${foreign}', '${otherOwner}', '20002', 'Otra batería', 'baterias', 10, 100, '4'),
      ('${unavailable}', '${owner}', '20003', 'Batería agotada', 'baterias', 0, 100, '5');
    INSERT INTO products(id, owner_admin_id, sku, name, category, stock, sell_price, wholesale_price)
      VALUES ('${battery}', '${owner}', 'P001', 'Producto normal', 'Accesorios', 20, 300, 250);
    INSERT INTO catalog_shares(token, owner_admin_id, source_table, category_filter) VALUES
      ('batteries', '${owner}', 'armacen', 'baterias'),
      ('screens', '${owner}', 'armacen', 'pantallas'),
      ('custom', '${owner}', 'armacen', 'conectores usb');
    INSERT INTO sales(id, owner_admin_id, invoice_number, items, total, customer_name, customer_phone)
      VALUES ('${historicalSale}', '${owner}', 'WEB-OLD',
        '[{"sourceTable":"armacen","id":"${battery}","name":"Batería A","quantity":1}]',
        100, 'Cliente anterior', '8095550199');
  `)
  const customerMigration = await readFile(new URL('../073-catalog-customer-accounts.sql', import.meta.url), 'utf8')
  await db.exec(customerMigration)
  await db.exec(customerMigration) // The account migration and function updates must be repeatable.
  const outOfStockMigration = await readFile(new URL('../074-public-catalog-out-of-stock.sql', import.meta.url), 'utf8')
  await db.exec(outOfStockMigration)
  await db.exec(outOfStockMigration)
  const searchMigration = await readFile(new URL('../075-public-catalog-word-search.sql', import.meta.url), 'utf8')
  await db.exec(searchMigration)
  await db.exec(searchMigration)

  await db.exec(`UPDATE catalog_shares SET product_ids = ARRAY['${battery}'::uuid]
    WHERE token IN ('normal', 'wholesale');
    UPDATE catalog_shares SET product_ids = ARRAY['${battery}'::uuid, '${unavailable}'::uuid]
    WHERE token = 'batteries';
    UPDATE catalog_shares SET product_ids = ARRAY['${screen}'::uuid] WHERE token = 'screens';
    UPDATE catalog_shares SET product_ids = ARRAY['${custom}'::uuid] WHERE token = 'custom';`)
  for (const file of ['078-public-catalog-product-scope.sql', '079-public-catalog-new-products.sql']) {
    const sql = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
  }

  await db.exec(await readFile(new URL('../080-shared-catalog-categories.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../081-editable-catalog-links.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../082-catalog-storefront-publication.sql', import.meta.url), 'utf8'))
  const snapshot = async (token, search = null, category = null, offset = 0, limit = 24) =>
    (await db.query('SELECT get_public_catalog_snapshot($1,$2,$3,$4,$5,TRUE) AS data',
      [token, limit, offset, search, category])).rows[0].data
  const order = (token, items) => db.query('SELECT submit_catalog_order($1,$2,$3,$4::jsonb) AS id',
    [token, 'Cliente prueba', '8095550100', JSON.stringify(items)])
  const orderWithPhone = (token, phone, items) => db.query('SELECT submit_catalog_order($1,$2,$3,$4::jsonb) AS id',
    [token, 'Cliente prueba', phone, JSON.stringify(items)])
  const stock = async (table, id) => (await db.query(`SELECT stock FROM ${table} WHERE id=$1`, [id])).rows[0].stock

  assert.deepEqual((await snapshot('batteries')).products.map(p => p.id), [battery, unavailable])
  assert.deepEqual((await snapshot('batteries')).categories, ['baterias'])
  assert.equal((await snapshot('batteries')).category_filter, 'baterias')
  assert.deepEqual((await snapshot('screens')).products.map(p => p.id), [screen])
  assert.deepEqual((await snapshot('custom')).products.map(p => p.id), [custom])
  assert.equal((await snapshot('batteries', null, 'pantallas')).products.length, 0)
  assert.equal((await snapshot('batteries', 'Pantalla')).products.length, 0)
  assert.equal((await snapshot('batteries', '20001')).products.length, 1)
  assert.deepEqual((await snapshot('batteries')).products.find(p => p.id === unavailable),
    { id: unavailable, sku: '20003', name: 'Batería agotada', category: 'baterias', stock: 0, sell_price: 100, image_url: null, image_thumbnail_url: null })
  assert.equal((await snapshot('normal')).products[0].sell_price, 300)
  assert.equal((await snapshot('wholesale')).products[0].sell_price, 250)
  assert.equal((await snapshot('normal')).products[0].name, 'Producto normal')

  await db.exec('BEGIN')
  await db.exec(`INSERT INTO products(id, owner_admin_id, sku, name, category, stock, sell_price, wholesale_price, created_at) VALUES
    ('${screen}', '${owner}', 'NEW', 'Nuevo', 'Nueva', 2, 12, 9, now()),
    ('${custom}', '${owner}', 'OLD', 'Anterior excluido', 'Oculta', 2, 12, 9, '2000-01-01'),
    ('${foreign}', '${otherOwner}', 'OTHER', 'Otra empresa', 'Oculta', 2, 12, 9, now())`)
  assert.deepEqual((await snapshot('wholesale', 'Nuevo')).products.map(p => p.sell_price), [9])
  assert.deepEqual((await snapshot('normal')).categories, ['Accesorios', 'Nueva'])
  assert.deepEqual((await db.query("SELECT category FROM get_public_catalog_categories('normal')")).rows.map(r => r.category), ['Accesorios', 'Nueva'])
  assert.equal((await snapshot('normal')).products.length, 2)
  await order('normal', [{ id: screen, quantity: 1 }])
  await db.exec('ROLLBACK')

  await assert.rejects(db.query("SELECT manage_catalog_categories($1,'wrong',ARRAY['Hidden'])", [owner]))
  await db.exec('BEGIN')
  await db.query("SELECT manage_catalog_categories($1,'test-password',ARRAY['Fundas', 'fundas'])", [owner])
  await db.exec(`INSERT INTO catalog_shares(token, owner_admin_id, source_table, category_filter)
    VALUES ('new-link','${owner}','armacen','pantallas'), ('other-link','${otherOwner}','products',NULL)`)
  await db.query("SELECT manage_catalog_categories($1,'test-password',ARRAY['Fundas'],NULL,'armacen')", [owner])
  for (const token of ['normal', 'wholesale', 'batteries', 'new-link']) {
    const name = ['normal', 'wholesale'].includes(token) ? 'Fundas' : 'fundas'
    const result = await snapshot(token)
    assert.equal(result.categories.filter(c => c === name).length, 1)
    assert.equal(result.category_filter, null)
    assert.deepEqual((await snapshot(token, null, name)).products, [])
  }
  assert.equal((await snapshot('other-link')).categories.includes('Fundas'), false)
  const added = await db.query(`INSERT INTO armacen(id, owner_admin_id, sku, name, category, stock, sell_price)
    VALUES (gen_random_uuid(), '${owner}', 'NEW', 'Base', 'Bases', 4, 10) RETURNING id`)
  assert.deepEqual((await snapshot('batteries', null, 'bases')).products, [])
  await db.query("SELECT manage_catalog_categories($1,'test-password',ARRAY['Bases'],NULL,'armacen')", [owner])
  await db.exec(`INSERT INTO catalog_shares(token, owner_admin_id, source_table, category_filter)
    VALUES ('future-link','${owner}','armacen','pantallas')`)
  for (const token of ['new-link', 'batteries', 'future-link']) {
    assert.deepEqual((await snapshot(token, null, 'bases')).products.map(p => p.id), [added.rows[0].id])
    await order(token, [{ id: added.rows[0].id, quantity: 1 }])
  }
  await db.query("SELECT manage_catalog_categories($1,'test-password','{}','Fundas')", [owner])
  assert.equal((await snapshot('normal')).categories.includes('Fundas'), false)
  await db.exec('ROLLBACK')

  await db.exec('BEGIN')
  await db.exec(`INSERT INTO catalog_shares(token, owner_admin_id, source_table, category_filter, individual_categories, product_ids)
    SELECT label, '${owner}', 'armacen', 'json:["baterias","pantallas"]', true, ARRAY['${battery}'::uuid,'${screen}'::uuid]
    FROM unnest(ARRAY['customer-one','customer-two']) label;
    INSERT INTO armacen(id,owner_admin_id,sku,name,category,stock,sell_price,created_at)
    VALUES (gen_random_uuid(),'${owner}','FX-1','Flex A','flex',5,100,'2000-01-01')`)
  const extend = (token, categories, actor = owner, password = 'test-password') => db.query(
    'SELECT extend_warehouse_catalog_link($1,$2,$3,$4) AS categories', [actor, password, token, categories])
  await db.query("SELECT manage_catalog_categories($1,'test-password',ARRAY['flex'],NULL,'armacen')", [owner])
  assert.deepEqual((await snapshot('customer-one')).categories, ['baterias','pantallas'])
  assert.deepEqual((await extend('customer-one', ['flex'])).rows[0].categories, ['baterias','flex','pantallas'])
  await extend('customer-one', ['flex'])
  assert.deepEqual((await snapshot('customer-one')).categories, ['baterias','flex','pantallas'])
  assert.deepEqual((await snapshot('customer-two')).categories, ['baterias','pantallas'])
  const flexProduct = (await snapshot('customer-one',null,'flex')).products[0]
  assert.equal(flexProduct.name,'Flex A')
  await order('customer-one',[{id:flexProduct.id,quantity:1}])
  await db.exec('ROLLBACK')
  await assert.rejects(extend('batteries',['flex'],owner,'wrong'))
  await assert.rejects(extend('normal',['flex']))

  await db.exec('BEGIN')
  const publish = async (kind, categories, home, visible = true) =>
    (await db.query("SELECT configure_catalog_publication($1,'test-password',$2,$3,$4,$5) AS token",
      [owner, kind, categories, home, visible])).rows[0].token
  const homepage = async () => (await db.query('SELECT * FROM catalog_storefront_sections($1)', [owner])).rows
  const individual = await publish('warehouse',['baterias'],false)
  const saveHome = rules => db.query("SELECT save_catalog_storefront($1,'test-password',$2::jsonb)", [owner, JSON.stringify(rules)])
  await saveHome({normal:[],wholesale:[],warehouse:[]})
  const sections = await homepage()
  assert.deepEqual(sections.map(x => x.kind),['normal','wholesale','warehouse'])
  assert.equal((await snapshot(sections[0].token)).products[0].sell_price,300)
  assert.equal((await snapshot(sections[1].token)).products[0].sell_price,250)
  assert.deepEqual((await snapshot(sections[2].token)).products.map(p=>p.id).sort(),[battery,screen,custom,unavailable].sort())
  assert.deepEqual((await snapshot(individual)).categories,['baterias'])
  for (const kind of ['normal','wholesale']) {
    const link = await publish(kind,['Fundas'],false)
    assert.deepEqual((await snapshot(link)).products,[])
    assert.deepEqual((await db.query('SELECT * FROM get_public_catalog_products($1)',[link])).rows,[])
    await db.exec('SAVEPOINT order_denied')
    await assert.rejects(order(link,[{id:battery,quantity:1}]))
    await db.exec('ROLLBACK TO SAVEPOINT order_denied')
    await db.query("SELECT manage_customer_catalog($1,'test-password',$2,ARRAY['Accesorios'])",[owner,link])
    assert.deepEqual((await snapshot(link)).products.map(p=>p.id),[battery])
  }
  await publish('warehouse',['pantallas'],true)
  assert.deepEqual((await snapshot(sections[2].token)).products.map(p=>p.id),[screen])
  assert.deepEqual((await snapshot(individual)).categories,['baterias'])
  await publish('wholesale',[],true,false)
  assert.equal((await homepage()).length,2)
  await saveHome({normal:null,wholesale:null,warehouse:null})
  assert.deepEqual(await homepage(),[])
  assert.deepEqual((await snapshot(individual)).categories,['baterias'])
  await db.exec('SAVEPOINT invalid_home')
  await assert.rejects(saveHome({normal:[],wholesale:[]}))
  await db.exec('ROLLBACK TO SAVEPOINT invalid_home')
  assert.deepEqual(await homepage(),[])
  await db.exec('ROLLBACK')

  // Exercise the real RPCs, including both catalog sources and legacy clients.
  await db.exec('BEGIN')
  await db.exec(`
    UPDATE products SET name = 'iPhone 15 Pro Max', sku = 'APL-15-PM', category = 'Pantallas';
    UPDATE armacen SET name = 'Pantalla iPhone 15 Pro Max' WHERE id = '${screen}';
    UPDATE armacen SET name = 'Pantalla iPhone 15 Pro Max', category = 'pantallas' WHERE id = '${foreign}';
    INSERT INTO catalog_shares(token, owner_admin_id, source_table, product_ids, category_filter)
      VALUES ('combined', '${owner}', 'armacen', ARRAY['${screen}'::uuid], 'json:["baterias","pantallas"]');
  `)
  for (const token of ['normal', 'wholesale', 'screens', 'combined']) {
    const expectedId = ['normal', 'wholesale'].includes(token) ? battery : screen
    for (const query of ['pro max pantalla', 'pro max 15', 'pro 15', '15 pro', '  PRO\t15  ', 'pró 15', 'iphone 15 pro max', 'iph 15']) {
      const found = await snapshot(token, query)
      assert.deepEqual(found.products.map(p => p.id), [expectedId], `${token}: ${query}`)
      const legacyFound = await db.query('SELECT * FROM get_public_catalog_products($1,24,0,$2,NULL)', [token, query])
      assert.deepEqual(legacyFound.rows.map(p => p.id), [expectedId], `legacy ${token}: ${query}`)
    }
    for (const query of ['pro 16', 'samsung pro', '%', '_']) {
      assert.equal((await snapshot(token, query)).products.length, 0, `${token}: ${query}`)
    }
  }
  assert.equal((await snapshot('normal', 'APL-15')).products.length, 1)
  assert.equal((await snapshot('normal', 'PM pro')).products.length, 1)
  assert.equal((await snapshot('batteries', 'bateria')).products.length, 2)
  assert.equal((await snapshot('screens', 'pro 15', 'baterias')).products.length, 0)
  assert.equal((await snapshot('normal', ' \t\n ')).products.length, 1)
  await db.exec(`INSERT INTO products(id, owner_admin_id, sku, name, category, stock, sell_price, wholesale_price)
    SELECT gen_random_uuid(), '${owner}', 'APL-' || n, 'Pantalla iPhone 15 Pro Max ' || n, 'Pantallas', 1, 100, 80
    FROM generate_series(1, 30) n`)
  const searchPage1 = await snapshot('normal', 'pro 15')
  const searchPage2 = await snapshot('normal', 'pro 15', null, 24)
  assert.equal(searchPage1.products.length, 24)
  assert.equal(searchPage1.has_more, true)
  assert.equal(searchPage2.products.length, 7)
  assert.equal(searchPage2.has_more, false)
  assert.equal(new Set([...searchPage1.products, ...searchPage2.products].map(p => p.id)).size, 31)
  // Anonymous callers can search through the existing token-gated RPC only.
  await db.exec('SET LOCAL ROLE anon')
  assert.equal((await snapshot('screens', 'pro 15')).products.length, 1)
  await db.exec('RESET ROLE')
  await db.exec('ROLLBACK')

  const migratedHistory = (await db.query(
    'SELECT customer_name, customer_phone, catalog_customer_id FROM catalog_order_history WHERE sale_id=$1',
    [historicalSale],
  )).rows[0]
  assert.deepEqual(migratedHistory, {
    customer_name: 'Cliente anterior',
    customer_phone: '8095550199',
    catalog_customer_id: null,
  })

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
  assert.equal(page2.products.length, 4)
  assert.equal(page2.has_more, false)
  assert.equal(new Set([...page1.products, ...page2.products].map(p => p.id)).size, 28)
  assert.ok([...page1.products, ...page2.products].every(p => p.category === 'baterias'))
  const legacy = (await db.query("SELECT * FROM get_public_catalog_products('batteries')")).rows
  assert.equal(legacy.length, 28)
  assert.ok(legacy.every(p => p.category === 'baterias'))
  assert.deepEqual((await db.query("SELECT * FROM get_public_catalog_categories('batteries')")).rows, [{ category: 'baterias' }])

  await assert.rejects(order('batteries', [{ id: screen, quantity: 1 }]))
  await assert.rejects(order('batteries', [{ id: foreign, quantity: 1 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 11 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 0 }]))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 1 }, { id: screen, quantity: 1 }]))
  await assert.rejects(orderWithPhone('batteries', '809555010', [{ id: battery, quantity: 1 }]))
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
  const guestHistory = (await db.query(
    'SELECT customer_name, customer_phone, items, total FROM catalog_order_history WHERE sale_id=$1',
    [result.rows[0].id],
  )).rows[0]
  assert.equal(guestHistory.customer_name, 'Cliente prueba')
  assert.equal(guestHistory.customer_phone, '8095550100')
  assert.equal(Number(guestHistory.total), 200)

  await db.query(
    `INSERT INTO catalog_customer_accounts(owner_admin_id, name, phone, password_salt, password_hash)
      VALUES ($1, 'Cliente de cuenta', '8095550111', 'salt', 'hash')`,
    [owner],
  )
  const accountId = (await db.query(
    "SELECT id FROM catalog_customer_accounts WHERE phone='8095550111'",
  )).rows[0].id
  await db.exec(await readFile(new URL('../087-catalog-customer-permissions.sql', import.meta.url), 'utf8'))
  await db.exec('BEGIN')
  const setPermissions = async warehouse => db.query(
    "SELECT * FROM account_catalog_settings($1,'test-password',$2,$3::jsonb)",
    [owner,accountId, JSON.stringify({normal:null,wholesale:null,warehouse})])
  const assignedSections = async () => (await db.query('SELECT * FROM account_catalog_sections($1)',[accountId])).rows
  const canOpen = async token => (await db.query('SELECT account_can_open_catalog($1,$2) AS allowed',[accountId,token])).rows[0].allowed
  await setPermissions(['baterias'])
  const personal = (await assignedSections())[0].token
  assert.equal(await canOpen(personal),true)
  assert.equal(await canOpen('screens'),false)
  assert.deepEqual((await snapshot(personal)).categories,['baterias'])
  await setPermissions(['baterias','pantallas'])
  assert.equal((await assignedSections())[0].token,personal)
  assert.deepEqual((await snapshot(personal)).categories,['baterias','pantallas'])
  await setPermissions(null)
  assert.deepEqual(await assignedSections(),[])
  assert.equal(await canOpen(personal),false)
  await db.exec('ROLLBACK')
  const accountOrder = await db.query(
    'SELECT submit_catalog_order_for_customer($1,$2,$3::jsonb) AS id',
    ['batteries', accountId, JSON.stringify([{ id: battery, quantity: 1 }])],
  )
  const linkedHistory = (await db.query(
    'SELECT catalog_customer_id, customer_name, customer_phone FROM catalog_order_history WHERE sale_id=$1',
    [accountOrder.rows[0].id],
  )).rows[0]
  assert.deepEqual(linkedHistory, {
    catalog_customer_id: accountId,
    customer_name: 'Cliente de cuenta',
    customer_phone: '8095550111',
  })

  // A legacy phone can have two owners. Deleting one account must not release the other's number.
  await db.exec(await readFile(new URL('../084-catalog-customer-email-registration.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../085-catalog-customer-email-global-unique.sql', import.meta.url), 'utf8'))
  await db.query("INSERT INTO employees(id) VALUES($1) ON CONFLICT DO NOTHING",[otherOwner])
  const addAccount = (admin,phone,email) => db.query(`INSERT INTO catalog_customer_accounts
    (owner_admin_id,name,phone,email,password_salt,password_hash) VALUES($1,'Test',$2,$3,'salt','hash') RETURNING id`,[admin,phone,email])
  const legacyAccountId = (await addAccount(otherOwner,'8095550111','old@example.test')).rows[0].id
  await db.exec(await readFile(new URL('../088-catalog-customer-unique-phone.sql', import.meta.url), 'utf8'))
  await db.query("INSERT INTO catalog_customer_sessions(customer_id,token_hash,expires_at) VALUES($1,'test-session',now())",[accountId])
  await db.query('DELETE FROM catalog_customer_accounts WHERE id=$1',[accountId])
  assert.equal((await db.query('SELECT id FROM catalog_customer_sessions WHERE customer_id=$1',[accountId])).rows.length,0)
  assert.equal((await db.query('SELECT catalog_customer_id FROM catalog_order_history WHERE sale_id=$1',[accountOrder.rows[0].id])).rows[0].catalog_customer_id,null)
  await assert.rejects(addAccount(owner,'8095550111',null), {code:'23505'})
  await assert.rejects(addAccount(owner,'8095550123',' OLD@example.test '), {code:'23505'})
  await db.query('DELETE FROM catalog_customer_accounts WHERE id=$1',[legacyAccountId])
  await addAccount(owner,'8095550111',null)
  await assert.rejects(addAccount(otherOwner,'8095550111',null), {code:'23505'})
  await db.query("UPDATE catalog_customer_accounts SET phone='8095550145' WHERE phone='8095550111'")
  await addAccount(otherOwner,'8095550111',null)

  await db.exec(`INSERT INTO catalog_customer_sessions(customer_id,token_hash,expires_at,revoked_at)
    SELECT a.id,v.token_hash,v.expiry,v.revoked FROM catalog_customer_accounts a CROSS JOIN
      (VALUES ('live',now()+interval '1 day',NULL::timestamptz),('expired',now()-interval '1 day',NULL),
              ('revoked',now()+interval '1 day',now())) v(token_hash,expiry,revoked)
    WHERE a.phone='8095550145'`)
  await db.exec(await readFile(new URL('../089-persistent-customer-sessions.sql', import.meta.url), 'utf8'))
  assert.deepEqual((await db.query("SELECT token_hash FROM catalog_customer_sessions WHERE expires_at='infinity' ORDER BY token_hash")).rows,
    [{token_hash:'live'}])

  await order('wholesale', [{ id: battery, quantity: 1 }])
  assert.equal(await stock('products', battery), 19)
  assert.equal(await stock('armacen', battery), 7)
  await db.exec("UPDATE catalog_shares SET active=FALSE WHERE token='batteries'")
  await assert.rejects(snapshot('batteries'))
  await assert.rejects(order('batteries', [{ id: battery, quantity: 1 }]))
  await assert.rejects(snapshot('unknown'))
  console.log('PASS: unordered word search, accents, mixed name/SKU/category, literal wildcards, search pagination, anonymous RPC, category isolation, aliases, custom categories, legacy RPCs, tenant isolation, prices, guest and account orders, history migration, phone validation, rollback, stock and idempotency.')
} finally {
  await db.close()
}
