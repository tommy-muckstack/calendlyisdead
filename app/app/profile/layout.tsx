import { ProfileTabs } from "@/components/ProfileTabs";
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <><ProfileTabs />{children}</>;
}
