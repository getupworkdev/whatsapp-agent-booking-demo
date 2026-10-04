import type { Db } from "../db.js";
import { MockBokun } from "../mocks/bokun.js";
import { MockHubSpot } from "../mocks/hubspot.js";
import { MockWhatsApp } from "../mocks/whatsapp.js";

export interface Ctx {
  db: Db;
  bokun: MockBokun;
  hubspot: MockHubSpot;
  whatsapp: MockWhatsApp;
  now: () => Date;                       // injectable clock, so the 24h rule is testable
  hotels: string[];                      // hotels the business serves
  airportRideCents: number;
  commissionRate: number;                // e.g. 0.10
  templates: Record<string, string>;     // Meta-approved template names -> text
}

// A tool error the agent can read and react to (ask the guest, try again).
export class ToolError extends Error {}
