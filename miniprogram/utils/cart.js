function getCart() {
  return getApp().globalData.cart || [];
}

function saveCart(cart) {
  getApp().setCart(cart);
  return cart;
}

function addProduct(product, quantity) {
  const cart = [...getCart()];
  const existing = cart.find((item) => item.product.id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ product, quantity });
  }
  return saveCart(cart);
}

function updateQuantity(productId, quantity) {
  const cart = getCart()
    .map((item) => item.product.id === productId ? { ...item, quantity } : item)
    .filter((item) => item.quantity > 0);
  return saveCart(cart);
}

function removeProduct(productId) {
  return saveCart(getCart().filter((item) => item.product.id !== productId));
}

function clearCart() {
  return saveCart([]);
}

function cartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function cartTotal() {
  return Math.round(getCart().reduce((sum, item) => sum + item.product.price * item.quantity, 0) * 100) / 100;
}

module.exports = {
  getCart,
  addProduct,
  updateQuantity,
  removeProduct,
  clearCart,
  cartCount,
  cartTotal
};
