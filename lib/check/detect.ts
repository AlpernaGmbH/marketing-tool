import { decode, textOf } from "@/lib/check/html";
import type { SocialNetwork } from "@/lib/check/types";

// Erkennung von Shop, Buchung, Newsletter, Tracking und Social-Links aus dem HTML der Startseite.
// Muster aus dem Agentur-Tool übernommen (Stand 02.10.2026).

type Pattern = readonly [name: string, re: RegExp];

const SHOP_SYSTEMS: Pattern[] = [
  ["Shopify", /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i],
  ["WooCommerce", /woocommerce|wc-ajax|wp-content\/plugins\/woocommerce/i],
  ["Shopware", /shopware/i],
  ["Magento", /mage\/cookies|Magento_|magento/i],
  ["PrestaShop", /prestashop/i],
  ["Wix Stores", /wixstores|wix-ecommerce/i],
  ["Squarespace Commerce", /squarespace-commerce|static\.squarespace\.com\/.*commerce/i],
  ["Jimdo Shop", /jimdo.*(shop|store)/i],
  ["Ecwid", /ecwid\.com|app\.ecwid/i],
  ["Gambio", /gambio/i],
  ["JTL-Shop", /jtl-shop|jtlshop/i],
];
const SHOP_WORDS = /in den warenkorb|zum warenkorb|warenkorb|add to cart|zur kasse|onlineshop|online-shop|\/shop\b|\/cart\b|\/checkout\b/i;

const BOOKING_SYSTEMS: Pattern[] = [
  ["Calendly", /calendly\.com/i],
  ["Cal.com", /cal\.com\//i],
  ["SimplyBook", /simplybook\./i],
  ["Booksy", /booksy\.com/i],
  ["Treatwell", /treatwell\./i],
  ["Shore", /shore\.com|connect\.shore/i],
  ["Timify", /timify\.com/i],
  ["Planity", /planity\.com/i],
  ["Salonized", /salonized\.com/i],
  ["Acuity", /acuityscheduling\.com/i],
  ["Microsoft Bookings", /outlook\.office365\.com\/owa\/calendar|bookings\.office/i],
  ["OneDoc", /onedoc\.ch/i],
  ["Doctolib", /doctolib\./i],
  ["Medicosearch", /medicosearch\.ch/i],
  ["OpenTable", /opentable\./i],
  ["Quandoo", /quandoo\./i],
  ["TheFork", /thefork\.|lafourchette/i],
  ["Lunchgate", /lunchgate\.ch/i],
  ["aleno", /aleno\.me/i],
  ["resmio", /resmio\./i],
  ["bookingkit", /bookingkit\./i],
  ["Regiondo", /regiondo\./i],
  ["Booking-Engine (Hotel)", /seekda|cultuzz|hotelnetsolutions|bookassist|simple-booking|mews\.(li|com)|sihot|protel|hotel-spider|guestline|cloudbeds|beds24|smoobu/i],
  ["Eversports", /eversports\./i],
  ["Magicline", /magicline\./i],
];
const BOOKING_WORDS = /termin buchen|termin vereinbaren|online buchen|jetzt buchen|online-termin|tisch reservieren|jetzt reservieren|online reservieren|book now|book online/i;

const NEWSLETTER_SYSTEMS: Pattern[] = [
  ["Mailchimp", /list-manage\.com|mailchimp|mc\.us\d+|chimpstatic/i],
  ["Brevo (Sendinblue)", /sibforms\.com|sendinblue|brevo\.com/i],
  ["CleverReach", /cleverreach/i],
  ["Klaviyo", /klaviyo/i],
  ["MailerLite", /mailerlite/i],
  ["rapidmail", /rapidmail/i],
  ["Newsletter2Go", /newsletter2go/i],
  ["GetResponse", /getresponse/i],
  ["ActiveCampaign", /activehosted\.com|activecampaign/i],
  ["HubSpot", /hsforms|hs-scripts|hubspot/i],
  ["Mailjet", /mailjet/i],
];

const SOCIAL_PATTERNS: Record<SocialNetwork, RegExp> = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i,
  facebook: /https?:\/\/(?:[a-z]+\.)?facebook\.com\/[A-Za-z0-9_.\-/?=]+/i,
  linkedin: /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in|school)\/[A-Za-z0-9_\-%.]+/i,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+/i,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9_\-.]+/i,
};
// Teilen-Knöpfe sind keine eigenen Kanäle.
const SHARE_LINK = /sharer|share\?|intent|plugins|dialog/i;

const names = (list: Pattern[], html: string): string[] => list.filter(([, re]) => re.test(html)).map(([name]) => name);

export type Detected = {
  shopSystems: string[];
  hasShop: boolean;
  bookingSystems: string[];
  hasBooking: boolean;
  newsletterSystems: string[];
  hasNewsletter: boolean;
  tracking: Tracking;
  socialLinks: Partial<Record<SocialNetwork, string>>;
  /** Link auf Google Maps im HTML (Hinweis auf ein Google-Profil). */
  mapsLink: boolean;
};

export type Tracking = { ga4: boolean; gtm: boolean; gads: boolean; meta: boolean; linkedin: boolean; tiktok: boolean };

export function detectTracking(html: string): Tracking {
  return {
    ga4: /G-[A-Z0-9]{6,12}/.test(html),
    gtm: /GTM-[A-Z0-9]{4,9}/.test(html),
    gads: /AW-\d{6,12}|googleadservices\.com|googleads\.g\.doubleclick\.net|google_conversion_id/i.test(html),
    meta: /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i.test(html),
    linkedin: /snap\.licdn\.com|_linkedin_partner_id/i.test(html),
    tiktok: /analytics\.tiktok\.com|ttq\.load/i.test(html),
  };
}

export function findSocialLinks(html: string): Partial<Record<SocialNetwork, string>> {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]));
  const found: Partial<Record<SocialNetwork, string>> = {};
  for (const [net, re] of Object.entries(SOCIAL_PATTERNS) as [SocialNetwork, RegExp][]) {
    const hit = hrefs.find((h) => re.test(h) && !SHARE_LINK.test(h));
    if (hit) found[net] = hit;
  }
  return found;
}

export function detectAll(html: string): Detected {
  const text = textOf(html);
  const shopSystems = names(SHOP_SYSTEMS, html);
  const bookingSystems = names(BOOKING_SYSTEMS, html);
  const newsletterSystems = names(NEWSLETTER_SYSTEMS, html);
  const hasEmailInput = /<input[^>]+type=["']?email/i.test(html);
  return {
    shopSystems,
    hasShop: shopSystems.length > 0 || SHOP_WORDS.test(html),
    bookingSystems,
    hasBooking: bookingSystems.length > 0 || BOOKING_WORDS.test(text),
    newsletterSystems,
    hasNewsletter: newsletterSystems.length > 0 || (/newsletter/i.test(text) && hasEmailInput),
    tracking: detectTracking(html),
    socialLinks: findSocialLinks(html),
    mapsLink: /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\//i.test(html),
  };
}
