import { normalizeMpesaPhone } from "@/lib/mpesa";

type ServiceReminderMessage = {
  customerName: string;
  phone: string;
  registrationNumber: string;
  dueDate: Date;
};

function getAfricaTalkingConfig() {
  const username = process.env.AFRICASTALKING_USERNAME?.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
  const senderId = process.env.AFRICASTALKING_SENDER_ID?.trim();
  if (!username || !apiKey) throw new Error("AFRICASTALKING_CONFIGURATION_MISSING");
  return { username, apiKey, senderId };
}

export function validateAfricaTalkingConfiguration() {
  return getAfricaTalkingConfig();
}

export async function sendAfricaTalkingServiceReminder({
  customerName,
  phone,
  registrationNumber,
  dueDate,
}: ServiceReminderMessage) {
  const config = getAfricaTalkingConfig();
  const recipient = normalizeMpesaPhone(phone);
  if (!recipient) throw new Error("AFRICASTALKING_RECIPIENT_PHONE_INVALID");

  const body = new URLSearchParams({
    username: config.username,
    to: `+${recipient}`,
    message: `Hello ${customerName}, service for ${registrationNumber} is due on ${dueDate.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}. Contact BizFlow Auto to book.`,
  });
  if (config.senderId) body.set("from", config.senderId);

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey: config.apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body,
  });

  const result: {
    SMSMessageData?: {
      Recipients?: Array<{ status?: string; statusCode?: number; messageId?: string }>;
    };
  } = await response.json();
  const recipientResult = result.SMSMessageData?.Recipients?.[0];
  if (!response.ok || recipientResult?.status !== "Success" || !recipientResult.messageId) {
    console.error("Africa's Talking rejected a service reminder.", {
      status: response.status,
      providerStatusCode: recipientResult?.statusCode,
      providerStatus: recipientResult?.status,
    });
    throw new Error("AFRICASTALKING_PROVIDER_REJECTED");
  }
  return { messageId: recipientResult.messageId };
}
