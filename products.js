const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, 'products.json');

function getProducts() {
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
  const all = JSON.parse(raw);
  return all.filter(p => p.active !== false); // only active products
}

function buildProductListText() {
  const products = getProducts();
  return products.map(p => {
    const variantLines = p.variants.map(v => `   • ${v.label}: ${v.price} ₾`).join('\n');
    return `🔹 ${p.name}\n   ${p.description}\n${variantLines}`;
  }).join('\n\n');
}

module.exports = { getProducts, buildProductListText };
