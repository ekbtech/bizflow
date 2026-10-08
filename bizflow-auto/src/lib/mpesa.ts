let cachedToken: { value: string; expiresAt: number } | null = null;

export function getMpesaConfig() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET?.trim();
  const shortcode = process.env.MPESA_SHORTCODE?.trim();
  const passkey = process.env.MPESA_PASSKEY?.trim();
  const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim();
  const callbackToken = process.env.MPESA_CALLBACK_TOKEN?.trim();

  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl || !callbackToken) {
    throw new Error("MPESA_CONFIGURATION_MISSING");
  }
  if (process.env.MPESA_ENVIRONMENT && process.env.MPESA_ENVIRONMENT !== "sandbox") {
    throw new Error("MPESA_SANDBOX_ONLY");
  }

  let callback: URL;
  try {
    callback = new URL(callbackUrl);
  } catch {
    throw new Error("MPESA_CALLBACK_INVALID");
  }
  if (callback.protocol !== "https:") throw new Error("MPESA_CALLBACK_REQUIRES_HTTPS");
  callback.searchParams.set("token", callbackToken);

  return {
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    callbackUrl: callback.toString(),
    baseUrl: "https://sandbox.safaricom.co.ke",
  };
}

export async function getMpesaAccessToken(config: ReturnType<typeof getMpesaConfig>) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    cache: "no-store",
  });
  const body: { access_token?: string; expires_in?: string | number } = await response.json();
  if (!response.ok || !body.access_token) throw new Error("MPESA_AUTHENTICATION_FAILED");

  const expiresIn = Number(body.expires_in ?? 3599);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return body.access_token;
}

export function getMpesaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export function normalizeMpesaPhone(value: string) {
  const compact = value.replace(/[\s()+-]/g, "");
  const phone = compact.startsWith("0") ? `254${compact.slice(1)}` : compact;
  return /^254(?:7|1)\d{8}$/.test(phone) ? phone : null;
}
