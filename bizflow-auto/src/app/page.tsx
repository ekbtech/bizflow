import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/permissions";

export default async function HomePage() {
  const user = await getSessionUser();
  redirect(user ? getRoleHomePath(user.role) : "/login");
}
