import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { baseUrl } from "@/lib/booking";
import { MyLinkSettings } from "@/components/MyLinkSettings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  return <MyLinkSettings initial={{ username: user.username }} base={baseUrl().replace(/\/+$/, "")} />;
}
