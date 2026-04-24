export type GmailIngestEvent = {
  type: "gmail_ingested";
  at: string; // ISO
  mailboxEmail: string;
  fromEmail: string | null;
  toEmails: string[];
  gmailId: string;
};

type Subscriber = {
  send: (ev: GmailIngestEvent) => void;
};

// Simple in-memory pubsub keyed by email. Good enough for a single Fly machine.
// (If we scale to multiple machines, we’ll need Redis/PubSub fanout.)
const subsByEmail = new Map<string, Set<Subscriber>>();

function normEmail(x: string) {
  return x.trim().toLowerCase();
}

export function subscribeEmails(emails: string[], sub: Subscriber) {
  const uniq = Array.from(new Set(emails.map(normEmail).filter(Boolean)));
  for (const e of uniq) {
    let set = subsByEmail.get(e);
    if (!set) {
      set = new Set();
      subsByEmail.set(e, set);
    }
    set.add(sub);
  }
  return () => {
    for (const e of uniq) {
      const set = subsByEmail.get(e);
      if (!set) continue;
      set.delete(sub);
      if (!set.size) subsByEmail.delete(e);
    }
  };
}

export function publishGmailIngested(input: Omit<GmailIngestEvent, "type">) {
  const ev: GmailIngestEvent = { type: "gmail_ingested", ...input };
  const candidates = [
    input.mailboxEmail,
    ...(input.fromEmail ? [input.fromEmail] : []),
    ...(input.toEmails ?? []),
  ]
    .map(normEmail)
    .filter(Boolean);

  const seen = new Set<Subscriber>();
  for (const e of candidates) {
    const set = subsByEmail.get(e);
    if (!set) continue;
    for (const sub of set) {
      if (seen.has(sub)) continue;
      seen.add(sub);
      try {
        sub.send(ev);
      } catch {
        // ignore broken client
      }
    }
  }
}

