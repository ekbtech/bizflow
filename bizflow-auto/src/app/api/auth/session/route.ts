import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ user: null }, { status: 401 });

  return Response.json(
    { user },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}
