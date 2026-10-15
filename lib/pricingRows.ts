// Compare-features matrix: rows and plan availability as listed on calendly.com/pricing (checked Oct 2026). "✓" = included, "–" = not included.
// Row labels are short feature names; the longer descriptions are recreated in the tooltip (title) text.
export const COMPARE: { t: string; beta: boolean; rows: [string, string[]][] }[] = [
 { t: "Scheduling", beta: false, rows: [
    ["One-on-one meetings", ["Unlimited", "Unlimited", "Unlimited", "Unlimited"]],
    ["Connect calendars", ["1", "6", "6", "6"]],
    ["Unlimited meetings", ["✓", "✓", "✓", "✓"]],
    ["Customize your booking link", ["✓", "✓", "✓", "✓"]],
    ["Mobile app and browser extension", ["✓", "✓", "✓", "✓"]],
    ["Meeting polls and one-off meetings", ["✓", "✓", "✓", "✓"]],
    ["Control your meeting availability", ["✓", "✓", "✓", "✓"]],
    ["Multi-person meeting types", ["–", "Unlimited", "Unlimited", "Unlimited"]],
    ["Round-robin meeting distribution", ["–", "–", "Unlimited", "Unlimited"]],
    ["Book meetings on behalf of others", ["–", "✓", "✓", "✓"]],
    ["Automate meeting reminders", ["–", "✓", "✓", "✓"]],
    ["Automate scheduling outreach", ["–", "✓", "✓", "✓"]],
    ["Add a meeting cancellation policy", ["–", "✓", "✓", "✓"]],
    ["Create forms, screen invitees, and route leads based on responses", ["–", "–", "✓", "✓"]]
  ] },
 { t: "Notetaker", beta: false, rows: [
    ["Automate meeting recaps and pre-drafted follow-up emails", ["–", "Standard Plus", "Teams Plus", "Inquire"]],
    ["Joins meetings on Zoom, Google Meet, and Microsoft Teams", ["–", "Standard Plus", "Teams Plus", "Inquire"]],
    ["Download full transcripts and share recaps with passcode-protected links", ["–", "Standard Plus", "Teams Plus", "Inquire"]],
    ["Advanced admin controls", ["–", "–", "Teams Plus", "Inquire"]]
  ] },
 { t: "Callie", beta: true, rows: [
    ["AI assistant for scheduling over email", ["–", "Standard Plus", "Teams Plus", "Inquire"]],
    ["Flexible email scheduling for one-time exceptions and changes", ["–", "Standard Plus", "Teams Plus", "Inquire"]],
    ["Ask the assistant in-app for help with meeting tasks", ["–", "Standard Plus", "Teams Plus", "Inquire"]]
  ] },
 { t: "Payments", beta: false, rows: [
    ["Collect payments at booking via Stripe and PayPal", ["–", "✓", "✓", "✓"]],
    ["Custom payment links for one-off services and fees", ["–", "✓", "✓", "✓"]],
    ["Meeting packages for prepaid sessions", ["–", "✓", "✓", "✓"]],
    ["Send invoices for project-based work", ["–", "✓", "✓", "✓"]],
    ["Custom payment terms, discounts, and coupon codes", ["–", "✓", "✓", "✓"]]
  ] },
 { t: "Contacts", beta: false, rows: [
    ["Auto-generated contact profiles and relationship history", ["✓", "✓", "✓", "✓"]],
    ["Notes, reminders, custom fields, and lists", ["✓", "✓", "✓", "✓"]],
    ["Book meetings from contact profiles", ["✓", "✓", "✓", "✓"]],
    ["Email contacts directly from Calendly", ["–", "✓", "✓", "✓"]]
  ] },
 { t: "Automations", beta: false, rows: [
    ["Google, Microsoft Teams, Outlook, and Office 365 calendar integrations", ["1", "✓", "✓", "✓"]],
    ["Zoom, Google Meet, Microsoft Teams and other video conferencing tools", ["✓", "✓", "✓", "✓"]],
    ["Custom webhooks to get Calendly meeting information in real time", ["–", "✓", "✓", "✓"]],
    ["HubSpot, Mailchimp, and Zapier for automations", ["–", "✓", "✓", "✓"]],
    ["Google Analytics and Meta Pixel for tracking conversions and booking activity", ["–", "✓", "✓", "✓"]],
    ["Gmail and Outlook for workflows", ["–", "✓", "✓", "✓"]],
    ["Marketo for syncing event data", ["–", "–", "✓", "✓"]],
    ["Salesforce for automating CRM record updates", ["–", "–", "✓", "✓"]],
    ["Route by HubSpot assignment", ["–", "–", "✓", "✓"]],
    ["Route by Salesforce assignment", ["–", "–", "–", "✓"]],
    ["Microsoft Dynamics 365 and Power Automate for CRM workflows", ["–", "–", "–", "✓"]]
  ] },
 { t: "Personalizations", beta: false, rows: [
    ["Custom branding on the booking page", ["✓", "✓", "✓", "✓"]],
    ["Remove Calendly branding", ["–", "✓", "✓", "✓"]],
    ["Customize colors when you add Calendly to your website", ["–", "✓", "✓", "✓"]],
    ["Custom confirmation pages with links and redirects", ["–", "✓", "✓", "✓"]]
  ] },
 { t: "Admin tools", beta: false, rows: [
    ["Team scheduling analytics and insights", ["–", "✓", "✓", "✓"]],
    ["Organize teams into groups and assign admins", ["–", "–", "✓", "✓"]],
    ["Create admin-managed events and assign them to your team for consistency", ["–", "–", "✓", "✓"]],
    ["Connect Zoom for your team", ["–", "–", "✓", "✓"]]
  ] },
 { t: "Security", beta: false, rows: [
    ["Data deletion for compliance", ["✓", "✓", "✓", "✓"]],
    ["Data Deletion API", ["–", "–", "–", "✓"]],
    ["SAML Single Sign-On (SSO)", ["–", "–", "Add-on", "✓"]],
    ["Automate and secure user identities using SCIM", ["–", "–", "–", "✓"]],
    ["Automate group provisioning", ["–", "–", "–", "✓"]],
    ["Domain control and account oversight", ["–", "–", "–", "✓"]],
    ["Security and legal reviews", ["–", "–", "–", "✓"]]
  ] },
 { t: "Support", beta: false, rows: [
    ["Help Center and Calendly Community access", ["✓", "✓", "✓", "✓"]],
    ["24/7 email support", ["✓", "✓", "✓", "✓"]],
    ["24/7 chat support", ["–", "✓", "✓", "✓"]],
    ["Phone support", ["–", "–", "–", "✓"]],
    ["Dedicated account support", ["–", "–", "–", "✓"]],
    ["Dedicated account onboarding and implementation", ["–", "–", "–", "✓"]],
    ["Personalized account consultations and success metrics", ["–", "–", "–", "✓"]]
  ] }
];
