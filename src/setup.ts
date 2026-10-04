import { openDb } from "./db.js";
import { MockBokun } from "./mocks/bokun.js";
import { MockHubSpot } from "./mocks/hubspot.js";
import { MockWhatsApp } from "./mocks/whatsapp.js";
import type { Ctx } from "./tools/context.js";

export function makeCtx(now = new Date("2027-01-20T15:00:00Z")): Ctx & { setNow(d: Date): void } {
  let clock = now;
  return {
    db: openDb(),
    bokun: new MockBokun(),
    hubspot: new MockHubSpot(),
    whatsapp: new MockWhatsApp(),
    now: () => clock,
    setNow: (d: Date) => { clock = d; },
    hotels: ["Barcelo Bavaro", "Hard Rock Punta Cana", "Paradisus Palma Real"],
    airportRideCents: 4500,
    commissionRate: 0.1,
    templates: {
      seller_statement: "Your weekly statement is ready.",
      morning_checkin: "Good morning! How was last night's show?",
    },
  };
}
