import { db, whatsappTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getChannelCredentials, addEvent } from "../routes/channels";

// ── WhatsApp System Template Builders ─────────────────────────────────────

export function renderWhatsAppSystemMessage(options: {
  badge: string;
  storeName?: string;
  tagline?: string;
  recipientName?: string;
  bodyText: string;
  actionUrl?: string;
  footerNotice?: string;
}): string {
  const brand = options.storeName || "Boutique";
  const tagline = options.tagline || "Private Client Services";
  const header = `*[${brand.toUpperCase()} | ${options.badge.toUpperCase()}]*\n_${tagline}_`;
  const greeting = options.recipientName ? `Dear *${options.recipientName}*,\n\n` : "";
  const action = options.actionUrl ? `\n\n*Access Portal:*\n${options.actionUrl}` : "";
  const footer = `\n\n_${options.footerNotice || `${brand} Concierge Services`}_`;

  return `${header}\n\n${greeting}${options.bodyText}${action}${footer}`;
}

// ── Specialized Notification Builders ─────────────────────────────────────

export function buildWhatsAppOtpMessage(options: { code: string; expiresMinutes?: number; storeName?: string }): string {
  const brand = options.storeName || "Boutique";
  return renderWhatsAppSystemMessage({
    badge: "SECURITY VERIFICATION",
    storeName: brand,
    tagline: "Executive Security Desk",
    bodyText: `Your single-use sign-in verification code is:\n\n*${options.code}*\n\nThis code expires in *${options.expiresMinutes ?? 10} minutes*. Never share this code with anyone.`,
    footerNotice: `${brand} Security Desk`,
  });
}

export function buildWhatsAppPasswordResetMessage(options: { recipientName?: string; resetUrl: string; storeName?: string }): string {
  const brand = options.storeName || "Boutique";
  return renderWhatsAppSystemMessage({
    badge: "PASSWORD RESET",
    storeName: brand,
    tagline: "Account Security Notification",
    recipientName: options.recipientName,
    bodyText: `We received a request to reset the password for your ${brand} account.\n\nUse the link below to specify your new password (expires in *60 minutes*).`,
    actionUrl: options.resetUrl,
    footerNotice: `${brand} Security Desk`,
  });
}

export function buildWhatsAppWelcomeMessage(options: { recipientName?: string; storeUrl: string; storeName?: string }): string {
  const brand = options.storeName || "Boutique";
  return renderWhatsAppSystemMessage({
    badge: "PRIVATE CLIENT CLUB",
    storeName: brand,
    recipientName: options.recipientName || "Valued Member",
    bodyText: `Welcome to ${brand}! Your private client account is active.\nEnjoy complimentary express delivery, private lookbook access, and dedicated concierge support.`,
    actionUrl: options.storeUrl,
  });
}

export function buildWhatsAppOrderConfirmationMessage(options: {
  orderId: string;
  recipientName: string;
  total: number;
  itemSummary: string;
  orderUrl: string;
  storeName?: string;
}): string {
  const shortId = options.orderId.slice(0, 8).toUpperCase();
  return renderWhatsAppSystemMessage({
    badge: "ORDER CONFIRMED",
    storeName: options.storeName,
    recipientName: options.recipientName,
    bodyText: `Thank you for your order *#${shortId}* totaling *$${options.total.toLocaleString()}*.\nWe are preparing your items with care.\n\n*Order Details:*\n• Order ID: #${shortId}\n• Items: ${options.itemSummary}\n• Total Paid: $${options.total.toLocaleString()}`,
    actionUrl: options.orderUrl,
  });
}

export function buildWhatsAppOrderStatusUpdateMessage(options: {
  orderId: string;
  recipientName: string;
  status: string;
  orderUrl: string;
  storeName?: string;
}): string {
  const shortId = options.orderId.slice(0, 8).toUpperCase();
  return renderWhatsAppSystemMessage({
    badge: "ORDER STATUS UPDATE",
    storeName: options.storeName,
    recipientName: options.recipientName,
    bodyText: `Your order *#${shortId}* status has been updated to:\n\n*${options.status.toUpperCase()}*`,
    actionUrl: options.orderUrl,
  });
}

export function buildWhatsAppLowStockAlertMessage(options: {
  itemCount: number;
  threshold: number;
  itemList: string;
  adminUrl: string;
  storeName?: string;
}): string {
  const brand = options.storeName || "Boutique";
  return renderWhatsAppSystemMessage({
    badge: "INVENTORY ALERT",
    storeName: brand,
    tagline: "Admin System Warning",
    bodyText: `Attention Admin,\n\n*${options.itemCount} item(s)* have fallen below your stock threshold of *${options.threshold} units*:\n\n${options.itemList}`,
    actionUrl: options.adminUrl,
    footerNotice: `${brand} Automated System`,
  });
}

// ── Dispatcher Function ────────────────────────────────────────────────────

export async function sendWhatsAppNotification(toPhoneNumber: string, textContent: string, storeId: string): Promise<boolean> {
  const creds = await getChannelCredentials("whatsapp", storeId);
  const phoneNumberId = creds["phone_number_id"];
  const token = creds["system_access_token"];

  console.log(`[WhatsApp Service] [Store: ${storeId}] Dispatched to +${toPhoneNumber}:\n${textContent}`);

  if (!phoneNumberId || !token || !toPhoneNumber) {
    return false;
  }

  try {
    const cleanPhone = toPhoneNumber.replace(/\D/g, "");
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "text",
        text: { preview_url: false, body: textContent },
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && !data["error"]) {
      addEvent("whatsapp", `Notification sent to +${cleanPhone}`, textContent.slice(0, 60) + "…", "sync", storeId);
      return true;
    }
  } catch (err) {
    console.error(`[WhatsApp Send Error] [Store: ${storeId}]:`, err);
  }
  return false;
}
