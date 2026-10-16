import Link from "next/link";
export default function ContactNotFound() {
  return <section className="contacts"><h2>Contact not found</h2><p>This contact is no longer available.</p><Link href="/app/contacts">Return to Contacts</Link></section>;
}
