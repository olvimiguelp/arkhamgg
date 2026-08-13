import React, { useMemo } from "react";
import "../styles/product-grid.css";
import { formatAlmacenSku, getAlmacenCategoryLabel, isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen";
import { normalizeInventorySourceTable } from "@/lib/transaction-classification";
import { formatCurrency } from "@/lib/utils";

export interface PGItem {
  id: string;
  sourceTable?: "products" | "armacen" | "manual";
  sourceId?: string;
  sku?: string;
  name: string;
  category?: string;
  boxNumber?: string;
  capacity?: string | number;
  stock?: number;
  sellPrice?: number;
  wholesalePrice?: number;
  imei?: string;
  imageUrl?: string;
}

export default function ProductGrid({
  products = [],
  onCardClick = () => {},
  priceMode = "sell",
}: {
  products: PGItem[];
  onCardClick?: (p: PGItem) => void;
  priceMode?: "sell" | "wholesale";
}) {
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const hasA = Boolean(a.imageUrl?.trim());
      const hasB = Boolean(b.imageUrl?.trim());
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return 0;
    });
  }, [products]);

  return (
    <div className="product-grid-container">
      <div className="product-grid">
        {sortedProducts.map((p) => {
          const boxNumber = normalizeAlmacenBoxNumber(p.boxNumber);
          const explicitSource = normalizeInventorySourceTable(p.sourceTable);
          const isAlmacenItem = explicitSource ? explicitSource === "armacen" : Boolean(boxNumber) || isAlmacenCategory(p.category);
          const categoryLabel = isAlmacenItem ? getAlmacenCategoryLabel(p.category) : p.category || "Sin categoria";

          return (
            <article
              key={p.id}
              className={`product-card ${isAlmacenItem ? "product-card-almacen" : ""}`}
              onClick={() => onCardClick(p)}
              role="button"
              tabIndex={0}
            >
              <header className="card-header">
                <h3 className="card-title">{p.name}</h3>
                <div className="card-price">
                  {(() => {
                    const price = priceMode === "wholesale" ? (p.wholesalePrice ?? p.sellPrice ?? 0) : (p.sellPrice ?? 0);
                    const formatted = price % 1 === 0
                      ? price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                      : formatCurrency(price);
                    return `$${formatted}`;
                  })()}
                </div>
              </header>

              <div className="card-body">
                {p.imageUrl && (
                  <img src={p.imageUrl} alt={p.name} className="h-24 w-24 md:h-32 md:w-32 rounded-md object-cover border border-border mx-auto mb-2" />
                )}
                {isAlmacenItem && boxNumber && (
                  <div className="meta">
                    <span className="card-tag card-tag-box">Caja {boxNumber}</span>
                  </div>
                )}
                {p.capacity && <div className="meta">Capacidad: {p.capacity}</div>}
              </div>

              <footer className="card-footer">
                <span className="badge">{p.stock ?? 0}</span>
                <span className={`card-tag ${isAlmacenItem ? "card-tag-category-almacen" : "card-tag-category"}`}>
                  {categoryLabel}
                </span>
                {p.sku && (
                  <div className="meta meta-id text-xs">
                    ID: {(() => {
                      const displaySku = isAlmacenItem ? formatAlmacenSku(p.sku) || p.sku : p.sku;
                      return displaySku.slice(0, 9);
                    })()}
                  </div>
                )}
                {p.imei && <div className="imei">IMEI: {p.imei}</div>}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
