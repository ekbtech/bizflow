import { normalizeMpesaPhone } from "@/lib/mpesa";

type ServiceReminderMessage = {
  customerName: string;
  phone: string;
  registrationNumber: string;
  dueDate: Date;
};

function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = process.env.WHATSAPP_SERVICE_REMINDER_TEMPLATE?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
  const businessNumber = normalizeMpesaPhone(process.env.WHATSAPP_BUSINESS_NUMBER ?? "");
  if (!accessToken || !phoneNumberId || !templateName || !businessNumber) {
    throw new Error("WHATSAPP_CONFIGURATION_MISSING");
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error("WHATSAPP_API_VERSION_INVALID");
  return { accessToken, phoneNumberId, templateName, apiVersion };
}

export function validateWhatsAppConfiguration() {
  return getWhatsAppConfig();
}

export async function verifyWhatsAppSender() {
  const config = getWhatsAppConfig();
  const response = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}?fields=display_phone_number`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      cache: "no-store",
    },
  );
  const result: { display_phone_number?: string; error?: { message?: string } } = await response.json();
  const configuredNumber = normalizeMpesaPhone(process.env.WHATSAPP_BUSINESS_NUMBER ?? "");
  const registeredNumber = result.display_phone_number
    ? normalizeMpesaPhone(result.display_phone_number)
    : null;
  if (!response.ok || !configuredNumber || registeredNumber !== configuredNumber) {
    console.error("WhatsApp sender number verification failed.", {
      status: response.status,
      message: result.error?.message,
    });
    throw new Error("WHATSAPP_SENDER_NUMBER_MISMATCH");
  }
}

export async function sendWhatsAppServiceReminder({
  customerName,
  phone,
  registrationNumber,
  dueDate,
}: ServiceReminderMessage) {
  const config = getWhatsAppConfig();
  const recipient = normalizeMpesaPhone(phone);
  if (!recipient) throw new Error("WHATSAPP_RECIPIENT_PHONE_INVALID");

  const response = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: config.templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: customerName },
              { type: "text", text: registrationNumber },
              { type: "text", text: dueDate.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }) },
            ],
          }],
        },
      }),
    },
  );
  const result: { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } } = await response.json();
  if (!response.ok || !result.messages?.[0]?.id) {
    console.error("WhatsApp reminder provider rejected a request.", {
      status: response.status,
      code: result.error?.code,
      message: result.error?.message,
    });
    throw new Error("WHATSAPP_PROVIDER_REJECTED");
  }
  return { messageId: result.messages[0].id };
}
