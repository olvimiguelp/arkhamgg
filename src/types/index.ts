export interface Product {
  id: string;
  name: string;
  category: string;
  imei?: string;
  price: number;
  stock: number;
  image?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  debt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface Sale {
  id: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  client?: Client;
}

export interface Repair {
  id: string;
  device: string;
  client: string;
  issue: string;
  status: "pending" | "in-progress" | "completed";
  cost: number;
  date: string;
}
