import type { Group } from "@/lib/catalog";

export type ProductTone =
  | "emerald"
  | "champagne"
  | "ink"
  | "rose"
  | "sapphire"
  | "ivory";

export type ShowroomProduct = {
  id: string;
  code: string;
  productCode: string;
  name: string;
  gender: Group;
  category: string;
  image: string;
  description: string;
  active: boolean;
  price?: number;
  brand?: string;
  color?: string;
  size?: string;
  stockStatus?: string;
  tone: ProductTone;
};

export type Product = ShowroomProduct;

type ProductSeed = Omit<ShowroomProduct, "id" | "code" | "image" | "active">;

function imageFolder(gender: Group, category: string) {
  if (gender === "accessories") {
    return category === "bag"
      ? "accessories/bags"
      : category === "shoes"
        ? "accessories/footwear"
        : `accessories/${category}`;
  }
  return `${gender}/${category === "kurti-set" ? "kurti" : category}`;
}

function seedProduct(product: ProductSeed): ShowroomProduct {
  return {
    ...product,
    id: product.productCode,
    code: product.productCode,
    image: `/products/${imageFolder(product.gender, product.category)}/${product.productCode}.jpg`,
    active: true,
  };
}

// Replace empty image values with real shop photographs as inventory becomes available.
export const products: ShowroomProduct[] = [
  seedProduct({
    productCode: "SR001",
    name: "Emerald Heritage Saree",
    gender: "women",
    category: "saree",
    description: "Silk-inspired drape with a measured gold border.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "SR002",
    name: "Ivory Zari Saree",
    gender: "women",
    category: "saree",
    description: "An ivory drape with a quiet woven border.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "CH001",
    name: "Ivory Churidar Set",
    gender: "women",
    category: "chudithar",
    description: "A clean ceremonial set with a soft ivory finish.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "CH002",
    name: "Rose Churidar Set",
    gender: "women",
    category: "chudithar",
    description: "A graceful set with a warm rose palette.",
    tone: "rose",
  }),
  seedProduct({
    productCode: "SS001",
    name: "Champagne Salwar Suit",
    gender: "women",
    category: "salwar-suit",
    description: "A polished kameez set with champagne detailing.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "SS002",
    name: "Emerald Salwar Suit",
    gender: "women",
    category: "salwar-suit",
    description: "A rich coordinated set with an emerald finish.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "AN001",
    name: "Ivory Anarkali",
    gender: "women",
    category: "anarkali",
    description: "A softly flared silhouette for occasion dressing.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "AN002",
    name: "Rose Anarkali",
    gender: "women",
    category: "anarkali",
    description: "A fluid Anarkali in a considered rose tone.",
    tone: "rose",
  }),
  seedProduct({
    productCode: "LH001",
    name: "Rose Ceremony Lehenga",
    gender: "women",
    category: "lehenga",
    description: "Structured occasionwear with a warm rose palette.",
    tone: "rose",
  }),
  seedProduct({
    productCode: "LH002",
    name: "Emerald Bridal Lehenga",
    gender: "women",
    category: "lehenga",
    description: "A deep emerald lehenga with ceremonial presence.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "KT001",
    name: "Ivory Daily Kurti Set",
    gender: "women",
    category: "kurti-set",
    description: "An easy coordinated kurti set in ivory.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "KT002",
    name: "Sapphire Printed Kurti",
    gender: "women",
    category: "kurti-set",
    description: "A modern kurti with a composed sapphire palette.",
    tone: "sapphire",
  }),
  seedProduct({
    productCode: "LG001",
    name: "Champagne Evening Gown",
    gender: "women",
    category: "long-gown",
    description: "A long gown with a soft evening sheen.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "LG002",
    name: "Midnight Long Gown",
    gender: "women",
    category: "long-gown",
    description: "A refined gown in a deep ink tone.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "FS001",
    name: "Midnight Formal Shirt",
    gender: "men",
    category: "formal-shirt",
    description: "A sharp evening shirt with a quiet satin sheen.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "FS002",
    name: "Ivory Formal Shirt",
    gender: "men",
    category: "formal-shirt",
    description: "A clean formal shirt for tailored dressing.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "CS001",
    name: "Sapphire Casual Shirt",
    gender: "men",
    category: "casual-shirt",
    description: "A relaxed shirt with a considered sapphire check.",
    tone: "sapphire",
  }),
  seedProduct({
    productCode: "CS002",
    name: "Emerald Casual Shirt",
    gender: "men",
    category: "casual-shirt",
    description: "A modern casual shirt in emerald tones.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "TS001",
    name: "Ivory Essential T-Shirt",
    gender: "men",
    category: "tshirt",
    description: "A clean everyday layer in warm ivory.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "TS002",
    name: "Ink Essential T-Shirt",
    gender: "men",
    category: "tshirt",
    description: "A minimal everyday layer in deep ink.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "FT001",
    name: "Sapphire Tailored Trouser",
    gender: "men",
    category: "formal-trouser",
    description: "A refined tailored trouser for a complete look.",
    tone: "sapphire",
  }),
  seedProduct({
    productCode: "FT002",
    name: "Ink Tailored Trouser",
    gender: "men",
    category: "formal-trouser",
    description: "A precise formal trouser in a deep ink tone.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "CT001",
    name: "Ivory Chino",
    gender: "men",
    category: "casual-trouser",
    description: "A versatile chino with a warm ivory finish.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "CT002",
    name: "Sapphire Casual Trouser",
    gender: "men",
    category: "casual-trouser",
    description: "A relaxed trouser in a composed sapphire tone.",
    tone: "sapphire",
  }),
  seedProduct({
    productCode: "JN001",
    name: "Midnight Denim",
    gender: "men",
    category: "jeans",
    description: "A clean dark denim with a tailored line.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "JN002",
    name: "Sapphire Denim",
    gender: "men",
    category: "jeans",
    description: "A classic denim wash in a sapphire palette.",
    tone: "sapphire",
  }),
  seedProduct({
    productCode: "KU001",
    name: "Ivory Festive Kurta",
    gender: "men",
    category: "kurta",
    description: "A refined kurta for festive occasions.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "KU002",
    name: "Emerald Textured Kurta",
    gender: "men",
    category: "kurta",
    description: "A textured kurta in a rich emerald tone.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "KP001",
    name: "Champagne Kurta Pajama",
    gender: "men",
    category: "kurta-pajama",
    description: "A complete occasion set in champagne tones.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "KP002",
    name: "Ivory Kurta Pajama",
    gender: "men",
    category: "kurta-pajama",
    description: "A considered kurta pajama set in ivory.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "SH001",
    name: "Midnight Sherwani",
    gender: "men",
    category: "sherwani",
    description: "A ceremonial sherwani with a deep ink finish.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "SH002",
    name: "Champagne Sherwani",
    gender: "men",
    category: "sherwani",
    description: "An occasion sherwani with quiet champagne detail.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "JW001",
    name: "Champagne Temple Jewellery",
    gender: "accessories",
    category: "jewellery",
    description: "A considered finishing detail for an occasion look.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "JW002",
    name: "Emerald Stone Jewellery",
    gender: "accessories",
    category: "jewellery",
    description: "A luminous jewellery accent with emerald detail.",
    tone: "emerald",
  }),
  seedProduct({
    productCode: "BG001",
    name: "Ink Structured Bag",
    gender: "accessories",
    category: "bag",
    description: "A structured accessory with a quiet polished finish.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "BG002",
    name: "Champagne Shoulder Bag",
    gender: "accessories",
    category: "bag",
    description: "A soft shoulder bag with champagne hardware.",
    tone: "champagne",
  }),
  seedProduct({
    productCode: "FW001",
    name: "Ivory Occasion Footwear",
    gender: "accessories",
    category: "shoes",
    description: "A considered finishing detail for occasion dressing.",
    tone: "ivory",
  }),
  seedProduct({
    productCode: "FW002",
    name: "Ink Everyday Footwear",
    gender: "accessories",
    category: "shoes",
    description: "A clean footwear silhouette in deep ink.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "HW001",
    name: "Ink Classic Headwear",
    gender: "accessories",
    category: "headwear",
    description: "A minimal finishing piece in a deep ink tone.",
    tone: "ink",
  }),
  seedProduct({
    productCode: "HW002",
    name: "Champagne Occasion Headwear",
    gender: "accessories",
    category: "headwear",
    description: "A polished headwear accent for special occasions.",
    tone: "champagne",
  }),
];

export function getProductsForCategory(
  category: string,
  gender: ShowroomProduct["gender"],
) {
  return products.filter(
    (product) =>
      product.active &&
      product.category === category &&
      product.gender === gender,
  );
}
