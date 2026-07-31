export type Locale = "en" | "fr";

export function getLocale(): Locale {
  return process.env.NEXT_PUBLIC_LOCALE === "EN" ? "en" : "fr";
}

export function getCurrency(locale = getLocale()): string {
  return locale === "fr" ? "EUR" : "USD";
}

export function formatPrice(priceEn: number, priceFr: number, locale = getLocale()): string {
  if (locale === "fr") {
    return `${priceFr.toFixed(2)} €`;
  }
  return `$${priceEn.toFixed(2)}`;
}

export const labels = {
  en: {
    // Nav
    home: "Home",
    catalog: "Catalog",
    cart: "Cart",
    checkout: "Checkout",
    // Categories
    clothing: "Running",
    equipment: "Equipment",
    nutrition: "Nutrition",
    allCategories: "All Categories",
    // Product
    addToCart: "Add to Cart",
    outOfStock: "Out of Stock",
    inStock: "In Stock",
    size: "Size",
    color: "Color",
    reviews: "reviews",
    relatedProducts: "Related Products",
    backToCatalog: "Back to Catalog",
    sizeUnavailable: "This size is no longer available",
    // Cart
    promoCode: "Promo code",
    promoApply: "Apply",
    promoApplying: "Applying…",
    promoCampaign: "UTMB code: 25% off until race day",
    promoApplied: "Code UTMB25 applied, 25% off",
    promoInvalid: "This promo code is not valid",
    promoFailed: "The promo code could not be applied",
    discount: "Discount",
    yourCart: "Your Cart",
    emptyCart: "Your cart is empty",
    continueShopping: "Continue Shopping",
    remove: "Remove",
    quantity: "Qty",
    subtotal: "Subtotal",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    proceedToCheckout: "Proceed to Checkout",
    // Checkout
    checkoutTitle: "Checkout",
    contactInfo: "Contact Information",
    shippingAddress: "Shipping Address",
    paymentInfo: "Payment Information",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    city: "City",
    postalCode: "Postal Code",
    country: "Country",
    cardNumber: "Card Number",
    expiryDate: "Expiry Date",
    cvv: "CVV",
    placeOrder: "Place Order",
    orderProcessing: "Processing…",
    orderSummary: "Order Summary",
    paymentDeclined: "The payment was declined, please try again",
    // Confirmation
    orderConfirmed: "Order Confirmed!",
    orderThankYou:
      "Thank you for your purchase. Your order has been placed successfully.",
    orderNumber: "Order Number",
    continueBrowsing: "Continue Browsing",
    // Home
    heroTitle: "Built for the next finish line",
    heroSubtitle:
      "Expert-selected running, trail and triathlon gear. Tested for the miles that matter.",
    shopNow: "Shop Now",
    featuredProducts: "Featured Products",
    shopByCategory: "Shop by Category",
    whyChooseUs: "Why Choose AthleteDataHub",
    freeShipping: "Free Shipping",
    freeShippingDesc: "On all orders over $50",
    expertAdvice: "Expert Advice",
    expertAdviceDesc: "Guidance from certified coaches",
    fastDelivery: "Fast Delivery",
    fastDeliveryDesc: "2-3 business days delivery",
    // Filters
    filterBy: "Filter By",
    sortBy: "Sort By",
    priceAsc: "Price: Low to High",
    priceDesc: "Price: High to Low",
    ratingDesc: "Best Rated",
    newest: "Newest",
    showing: "Showing",
    products: "products",
    // Footer
    footerTagline: "Premium sports gear for serious athletes.",
    quickLinks: "Quick Links",
    categories: "Categories",
    support: "Support",
    contactUs: "Contact Us",
    faq: "FAQ",
    returns: "Returns & Refunds",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    allRightsReserved: "All rights reserved.",
    // Search
    search: "Search",
    searchPlaceholder: "Search products…",
    searchResults: "Search Results",
    searchResultsFor: "Results for",
    noResults: "No results",
    noResultsMessage: "No products match your search.",
  },
  fr: {
    // Nav
    home: "Accueil",
    catalog: "Catalogue",
    cart: "Panier",
    checkout: "Commander",
    // Categories
    clothing: "Running",
    equipment: "Équipements",
    nutrition: "Nutrition",
    allCategories: "Toutes les catégories",
    // Product
    addToCart: "Ajouter au panier",
    outOfStock: "Rupture de stock",
    inStock: "En stock",
    size: "Taille",
    color: "Couleur",
    reviews: "avis",
    relatedProducts: "Produits similaires",
    backToCatalog: "Retour au catalogue",
    sizeUnavailable: "Cette pointure n'est plus disponible",
    // Cart
    promoCode: "Code promo",
    promoApply: "Appliquer",
    promoApplying: "Application…",
    promoCampaign: "Code UTMB : -25 % jusqu'au départ",
    promoApplied: "Code UTMB25 appliqué, remise de 25 %",
    promoInvalid: "Ce code promo n'est pas valide",
    promoFailed: "Le code promo n'a pas pu être appliqué",
    discount: "Remise",
    yourCart: "Votre panier",
    emptyCart: "Votre panier est vide",
    continueShopping: "Continuer mes achats",
    remove: "Supprimer",
    quantity: "Qté",
    subtotal: "Sous-total",
    shipping: "Livraison",
    free: "Gratuite",
    total: "Total",
    proceedToCheckout: "Passer commande",
    // Checkout
    checkoutTitle: "Commande",
    contactInfo: "Informations de contact",
    shippingAddress: "Adresse de livraison",
    paymentInfo: "Informations de paiement",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
    phone: "Téléphone",
    address: "Adresse",
    city: "Ville",
    postalCode: "Code postal",
    country: "Pays",
    cardNumber: "Numéro de carte",
    expiryDate: "Date d'expiration",
    cvv: "CVV",
    placeOrder: "Valider la commande",
    orderProcessing: "Traitement en cours…",
    orderSummary: "Récapitulatif",
    paymentDeclined: "Le paiement a été refusé, merci de réessayer",
    // Confirmation
    orderConfirmed: "Commande confirmée !",
    orderThankYou:
      "Merci pour votre achat. Votre commande a bien été enregistrée.",
    orderNumber: "Numéro de commande",
    continueBrowsing: "Continuer mes achats",
    // Home
    heroTitle: "Pensé pour votre prochaine ligne d’arrivée",
    heroSubtitle:
      "Running, trail et triathlon : du matériel sélectionné par des pratiquants, pour les kilomètres qui comptent.",
    shopNow: "Découvrir",
    featuredProducts: "Produits vedettes",
    shopByCategory: "Nos catégories",
    whyChooseUs: "Pourquoi AthleteDataHub",
    freeShipping: "Livraison offerte",
    freeShippingDesc: "Pour toute commande supérieure à 50 €",
    expertAdvice: "Conseils d'experts",
    expertAdviceDesc: "Guidance par des coachs certifiés",
    fastDelivery: "Livraison rapide",
    fastDeliveryDesc: "Livraison en 2-3 jours ouvrés",
    // Filters
    filterBy: "Filtrer par",
    sortBy: "Trier par",
    priceAsc: "Prix croissant",
    priceDesc: "Prix décroissant",
    ratingDesc: "Mieux notés",
    newest: "Nouveautés",
    showing: "Affichage de",
    products: "produits",
    // Footer
    footerTagline: "Équipement sportif premium pour athlètes sérieux.",
    quickLinks: "Liens rapides",
    categories: "Catégories",
    support: "Support",
    contactUs: "Nous contacter",
    faq: "FAQ",
    returns: "Retours & Remboursements",
    privacy: "Politique de confidentialité",
    terms: "Conditions générales",
    allRightsReserved: "Tous droits réservés.",
    // Search
    search: "Rechercher",
    searchPlaceholder: "Rechercher un produit…",
    searchResults: "Résultats de recherche",
    searchResultsFor: "Résultats pour",
    noResults: "Aucun résultat",
    noResultsMessage: "Aucun produit ne correspond à votre recherche.",
  },
} as const;

export type LabelKey = keyof (typeof labels)["en"];

export function t(key: LabelKey, locale = getLocale()): string {
  return labels[locale][key];
}
