import type { ExampleQuery, Mode } from "../types/api";

/**
 * One-click examples. Every id below exists in the seeded SQLite database, so
 * each of these produces a real answer from the backend rather than a 404.
 *
 * The set is chosen to exercise the different reasoning paths the agent has:
 * SLA lookup, known-issue matching, contract-specific terms, and the source
 * precedence rules (a signed agreement outranking historical notes).
 *
 * `accountId` is the record's real owner, sent as X-Account-ID. Access control
 * is enforced in the backend against the operational database, so changing the
 * Account ID field to a different account produces a 403.
 */
export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    mode: "ticket",
    id: "TKT-501",
    label: "Severity & SLA",
    account: "Northstar Logistics",
    accountId: "ACCT-001",
    query:
      "All shipment creation is failing with HTTP 500. What is the severity and response time?",
  },
  {
    mode: "ticket",
    id: "TKT-502",
    label: "Known issue",
    account: "LumenWorks",
    accountId: "ACCT-002",
    query:
      "A 4,200-row bulk CSV upload keeps failing around 70%. What severity applies and is there a documented workaround?",
  },
  {
    mode: "ticket",
    id: "TKT-505",
    label: "Security incident",
    account: "Axis Labs",
    accountId: "ACCT-004",
    query:
      "A production API key was exposed in a public channel. What severity is this and what should the customer do immediately?",
  },
  {
    mode: "ticket",
    id: "TKT-501",
    label: "Escalation (confirm)",
    account: "Northstar Logistics",
    accountId: "ACCT-001",
    query:
      "Check this ticket, determine the applicable policy, calculate whether the SLA has been breached, and escalate it if necessary.",
  },
  {
    mode: "ticket",
    id: "TKT-450",
    label: "Source precedence",
    account: "Northstar Logistics",
    accountId: "ACCT-001",
    query:
      "An agent previously applied a 250 INR cancellation fee on this ticket. Was that correct for this account?",
  },
  {
    mode: "order",
    id: "ORD-1001",
    label: "Cancellation fee",
    account: "Northstar Logistics",
    accountId: "ACCT-001",
    query: "Can this booked shipment be cancelled without a fee?",
  },
  {
    mode: "order",
    id: "ORD-2001",
    label: "Fee window",
    account: "LumenWorks",
    accountId: "ACCT-002",
    query:
      "Cancellation was requested 75 minutes after booking and the parcel has not been picked up. Does a cancellation fee apply?",
  },
  {
    mode: "order",
    id: "ORD-2002",
    label: "Service credit",
    account: "LumenWorks",
    accountId: "ACCT-002",
    query:
      "The carrier missed the pickup window and accepted fault. Is this account entitled to a service credit?",
  },
  {
    mode: "order",
    id: "ORD-3001",
    label: "Standard policy",
    account: "Beacon Retail",
    accountId: "ACCT-003",
    query:
      "Cancellation was requested within 30 minutes of booking. What fee applies here?",
  },
];

/** Defaults prefilled into the form for each mode. */
export const DEFAULTS: Record<
  Mode,
  { id: string; query: string; accountId: string }
> = {
  ticket: {
    id: "TKT-501",
    accountId: "ACCT-001",
    query:
      "All shipment creation is failing with HTTP 500. What is the severity and response time?",
  },
  order: {
    id: "ORD-1001",
    accountId: "ACCT-001",
    query: "Can this booked shipment be cancelled without a fee?",
  },
};

export function examplesForMode(mode: Mode): ExampleQuery[] {
  return EXAMPLE_QUERIES.filter((example) => example.mode === mode);
}
