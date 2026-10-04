// Stand-in for the WhatsApp solutions provider's send API.
export class MockWhatsApp {
  outbox: { to: string; kind: "text" | "template"; body: string }[] = [];
  send(to: string, kind: "text" | "template", body: string) {
    this.outbox.push({ to, kind, body });
  }
}
