// Stand-in for HubSpot contacts. The contact is keyed by WhatsApp number.
export class MockHubSpot {
  contacts = new Map<string, Record<string, unknown>>();
  upsertContact(phone: string, props: Record<string, unknown>) {
    const prev = this.contacts.get(phone) ?? {};
    const next = { ...prev, ...props, phone };
    this.contacts.set(phone, next);
    return next;
  }
}
