export type Group = "women" | "men" | "accessories";
export type Zone = "upper" | "lower" | "full" | "multi" | "accessory";

export type CatalogItem = {
  id: string;
  name: string;
  group: Group;
  zone: Zone;
  description: string;
  prompt: string;
  thumbnail?: string;
  experimental?: boolean;
};

export const catalog: CatalogItem[] = [
  {
    id: "chudithar",
    name: "Chudithar",
    group: "women",
    zone: "multi",
    description: "Churidar / chudithar sets",
    prompt:
      "Apply the provided chudithar outfit naturally. Preserve the person's identity, face, pose and body proportions. Preserve the product's colors, embroidery, pattern and design as closely as possible.",
  },
  {
    id: "salwar-suit",
    name: "Salwar Suit",
    group: "women",
    zone: "multi",
    description: "Salwar kameez sets",
    prompt:
      "Apply the provided salwar suit naturally. Preserve identity, pose and body proportions. Preserve the kameez, salwar and visible product design, colors, embroidery and patterns as closely as possible.",
  },
  {
    id: "anarkali",
    name: "Anarkali",
    group: "women",
    zone: "full",
    description: "Long flared ethnic wear",
    prompt:
      "Dress the person in the provided Anarkali. Preserve identity, face, pose and body proportions. Preserve the exact colors, flare, embroidery, border and motifs as closely as possible.",
  },
  {
    id: "lehenga",
    name: "Lehenga",
    group: "women",
    zone: "multi",
    description: "Lehenga / lehenga choli",
    prompt:
      "Apply the provided lehenga outfit naturally. Preserve identity, face, pose and body proportions. Preserve the blouse, skirt, colors, embroidery, border and motifs as closely as possible.",
  },
  {
    id: "kurti-set",
    name: "Kurti / Kurti Set",
    group: "women",
    zone: "multi",
    description: "Kurti and coordinated sets",
    prompt:
      "Apply the provided kurti or kurti set naturally. Preserve identity and pose. Preserve the exact product colors, neckline, sleeves, pattern, embroidery and coordinated pieces as closely as possible.",
  },
  {
    id: "long-gown",
    name: "Long Gown",
    group: "women",
    zone: "full",
    description: "Long gowns / ethnic gowns",
    prompt:
      "Dress the person in the provided long gown. Preserve identity, face, pose and body proportions. Preserve the product color, neckline, sleeves, print, embroidery and silhouette as closely as possible.",
  },
  {
    id: "saree",
    name: "Saree",
    group: "women",
    zone: "full",
    description: "Indian saree with blouse and draping",
    prompt:
      "Dress the person in the provided saree.\n\nTransfer the provided saree design and blouse naturally onto the person.\n\nPreserve the person's identity, face, facial features, hairstyle, skin tone, body proportions and pose as much as possible.\n\nPreserve the saree's exact primary color, secondary colors, fabric appearance, print, embroidery, motifs, border design, pallu design and visible decorative details as closely as possible.\n\nPreserve the provided blouse color, blouse pattern, neckline, sleeve style and visible design as closely as possible.\n\nDrape the saree naturally around the person's body with a realistic waist, pleats and pallu.\n\nThe pallu should fall naturally according to the person's pose.\n\nDo not change the person's face or hairstyle.\n\nDo not create a different person.\n\nDo not unnecessarily change the background.\n\nThe final image should look like the original customer is realistically wearing the provided saree.",
  },

  {
    id: "formal-shirt",
    name: "Formal Shirt",
    group: "men",
    zone: "upper",
    description: "Replace upper garment only",
    prompt:
      "Replace only the person's upper garment with the provided formal shirt. Preserve identity, face, hair, body, pose, trousers and background. Preserve the exact shirt color, collar, buttons, pattern and design as closely as possible.",
  },
  {
    id: "casual-shirt",
    name: "Casual Shirt",
    group: "men",
    zone: "upper",
    description: "Casual shirts and checks",
    prompt:
      "Replace only the person's upper garment with the provided casual shirt. Keep the existing lower garment unchanged. Preserve identity, face, pose and background. Preserve shirt color, collar, buttons and pattern as closely as possible.",
  },
  {
    id: "tshirt",
    name: "T-Shirt",
    group: "men",
    zone: "upper",
    description: "T-shirts / polo styles",
    prompt:
      "Replace only the upper garment with the provided T-shirt. Preserve the person's identity, pose, existing trousers and background. Preserve the product's color, logo or pattern and neckline as closely as possible.",
  },
  {
    id: "formal-trouser",
    name: "Formal Trouser",
    group: "men",
    zone: "lower",
    description: "Change trousers only",
    prompt:
      "Replace only the person's lower garment with the provided formal trousers. Keep the existing shirt and upper clothing unchanged. Preserve identity, face, pose, body proportions and background. Preserve the trouser color, cut and design as closely as possible.",
  },
  {
    id: "casual-trouser",
    name: "Casual Trouser / Chino",
    group: "men",
    zone: "lower",
    description: "Chinos and casual trousers",
    prompt:
      "Replace only the lower garment with the provided casual trousers or chinos. Keep the existing upper clothing unchanged. Preserve identity, pose and body proportions. Preserve the exact product color and cut as closely as possible.",
  },
  {
    id: "jeans",
    name: "Jeans",
    group: "men",
    zone: "lower",
    description: "Denim / jeans",
    prompt:
      "Replace only the person's lower garment with the provided jeans. Keep the existing upper clothing unchanged. Preserve identity, pose and body proportions. Preserve the denim color, wash and cut as closely as possible.",
  },
  {
    id: "kurta",
    name: "Kurta",
    group: "men",
    zone: "upper",
    description: "Men's Indian kurta",
    prompt:
      "Apply the provided kurta naturally while preserving identity, face, pose and body proportions. Preserve the exact product color, neckline, buttons, embroidery and pattern as closely as possible.",
  },
  {
    id: "kurta-pajama",
    name: "Kurta Pajama",
    group: "men",
    zone: "multi",
    description: "Complete kurta pajama set",
    prompt:
      "Dress the person in the provided kurta pajama set. Preserve identity, face, pose and body proportions. Preserve the kurta and pajama colors, embroidery, pattern and design as closely as possible.",
  },
  {
    id: "sherwani",
    name: "Sherwani",
    group: "men",
    zone: "full",
    description: "Wedding / occasion wear",
    prompt:
      "Dress the person in the provided sherwani. Preserve identity, face, pose and body proportions. Preserve the exact product color, embroidery, buttons, motifs and design as closely as possible.",
  },

  {
    id: "bag",
    name: "Bag",
    group: "accessories",
    zone: "accessory",
    description: "Handbags / shoulder bags",
    prompt:
      "Add the provided bag naturally to the person.\n\nThe person must physically carry or wear the provided bag.\n\nPreferred placement:\n1. Carry naturally using one hand by the handles, OR\n2. Wear naturally over the shoulder if the product has a shoulder strap, OR\n3. Wear naturally crossbody if the supplied product is a crossbody bag.\n\nThe bag must be physically associated with the person's hand, arm, shoulder or body.\n\nDO NOT:\n- place the bag on the floor\n- place the bag beside the person\n- place the bag floating near the person\n- display the bag as a separate product\n- create an additional bag\n\nPreserve the provided bag's:\n- color\n- shape\n- size/proportions\n- material appearance\n- handles\n- shoulder strap\n- zippers\n- pockets\n- visible hardware\n- visible design\n\nPreserve the person's:\n- identity\n- face\n- hairstyle\n- skin tone\n- body proportions\n- existing accepted clothing\n- pose as much as practical\n- background\n\nIf an accepted outfit already exists, DO NOT replace or redesign that outfit merely to add the bag.",
  },
  {
    id: "shoes",
    name: "Shoes",
    group: "accessories",
    zone: "accessory",
    description: "Wearable footwear",
    prompt:
      "Apply the provided footwear naturally. Preserve identity, pose, clothing and background. Preserve the footwear's color, material, silhouette and design as closely as possible.",
  },
  {
    id: "jewellery",
    name: "Jewellery",
    group: "accessories",
    zone: "accessory",
    description: "Wearable jewellery",
    prompt:
      "Add the provided jewellery naturally. Preserve the person's identity, face, hair, clothing, pose and background. Preserve the jewellery's visible design, stones, metal color and proportions as closely as possible.",
  },
  {
    id: "headwear",
    name: "Headwear",
    group: "accessories",
    zone: "accessory",
    description: "Hats / caps / wearable headwear",
    prompt:
      "Add the provided headwear naturally. Preserve the person's identity, face, clothing, pose and background. Preserve the product's color, shape and design as closely as possible.",
  },
  {
    id: "glasses",
    name: "Glasses",
    group: "accessories",
    zone: "accessory",
    description: "Experimental — validate before production",
    prompt:
      "Add the provided eyeglasses or sunglasses naturally to the face. Preserve identity, facial structure, eyes, hair, clothing, pose and background. Preserve the frame shape, frame color and lens appearance as closely as possible.",
    experimental: true,
  },
];

export function getItem(id: string) {
  return catalog.find((x) => x.id === id);
}
