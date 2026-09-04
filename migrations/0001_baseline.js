// Baseline migration — captures the schema as it actually exists today.
// This includes `promo_type`/`promo_value` on `products` and `product_variants`,
// which were previously added by hand directly against the live DB and were
// never reflected in config/initDb.js (confirmed by grepping the codebase:
// product.model.js reads/writes those columns, but initDb.js never created them).
//
// Uses IF NOT EXISTS throughout so running this against the already-provisioned
// dev/prod DB is a safe no-op, while a fresh empty DB gets the full, correct schema.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) CHECK (role IN ('admin','manager','cashier')) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      last_login TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID REFERENCES categories(id),
      name VARCHAR(150) NOT NULL,
      description TEXT,
      base_price DECIMAL(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_type VARCHAR(10);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_value DECIMAL(10,2) DEFAULT 0;

    CREATE TABLE IF NOT EXISTS product_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE CASCADE,
      size VARCHAR(20),
      color VARCHAR(50),
      barcode VARCHAR(100) UNIQUE,
      price_override DECIMAL(10,2),
      cost_price DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS promo_type VARCHAR(10);
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS promo_value DECIMAL(10,2) DEFAULT 0;

    CREATE TABLE IF NOT EXISTS stock (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      variant_id UUID UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
      quantity INT NOT NULL DEFAULT 0,
      min_quantity INT NOT NULL DEFAULT 5,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      variant_id UUID REFERENCES product_variants(id),
      user_id UUID REFERENCES users(id),
      change_type VARCHAR(20) CHECK (change_type IN ('sale','return','manual','adjustment')),
      quantity_before INT,
      quantity_change INT,
      quantity_after INT,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) UNIQUE,
      email VARCHAR(150) UNIQUE,
      loyalty_points INT DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      opening_cash DECIMAL(10,2) NOT NULL,
      closing_cash DECIMAL(10,2),
      opened_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_id UUID REFERENCES shifts(id),
      user_id UUID REFERENCES users(id),
      customer_id UUID REFERENCES customers(id),
      subtotal DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) CHECK (status IN ('completed','held','refunded','partially_refunded')) DEFAULT 'completed',
      notes TEXT,
      synced BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
      variant_id UUID REFERENCES product_variants(id),
      quantity INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      line_total DECIMAL(10,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
      method VARCHAR(20) CHECK (method IN ('cash','card','bank_transfer')),
      amount DECIMAL(10,2) NOT NULL,
      reference VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS returns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      original_sale_id UUID REFERENCES sales(id),
      user_id UUID REFERENCES users(id),
      refund_amount DECIMAL(10,2) NOT NULL,
      refund_method VARCHAR(20) CHECK (refund_method IN ('cash','card','store_credit')),
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      return_id UUID REFERENCES returns(id) ON DELETE CASCADE,
      sale_item_id UUID REFERENCES sale_items(id),
      quantity INT NOT NULL,
      refund_amount DECIMAL(10,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action_type VARCHAR(50),
      payload JSONB,
      status VARCHAR(20) DEFAULT 'pending',
      retry_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      synced_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
    CREATE INDEX IF NOT EXISTS idx_stock_variant_id ON stock(variant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);
}

// Rolling back the baseline against a live database is destructive (drops
// every table). This is provided for resetting a throwaway/dev database only.
export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS sync_queue;
    DROP TABLE IF EXISTS return_items;
    DROP TABLE IF EXISTS returns;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS sale_items;
    DROP TABLE IF EXISTS sales;
    DROP TABLE IF EXISTS shifts;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS stock_logs;
    DROP TABLE IF EXISTS stock;
    DROP TABLE IF EXISTS product_variants;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS users;
  `);
}
