type EmailNotification = {
  to: string | null | undefined;
  subject: string;
  text: string;
};

export async function sendEmailNotification({ to, subject, text }: EmailNotification) {
  if (!to?.trim()) return { sent: false, reason: "recipient_email_missing" as const };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { sent: false, reason: "email_provider_not_configured" as const };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ from, to: [to.trim()], subject, text }),
    });
    if (!response.ok) {
      const responseBody = await response.text();
      console.error("Email notification provider rejected the request.", {
        status: response.status,
        response: responseBody.slice(0, 500),
      });
      return { sent: false, reason: "email_provider_rejected" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("Email notification could not reach the provider.", error);
    return { sent: false, reason: "email_provider_unreachable" as const };
  }
}
