type EventName = "message" | "room";

interface Subscriber {
  id: number;
  send: (event: EventName, data: unknown) => void;
}

const subscribers = new Set<Subscriber>();
let nextId = 1;

export function subscribe(send: Subscriber["send"]): () => void {
  const sub: Subscriber = { id: nextId++, send };
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

export function publish(event: EventName, data: unknown): void {
  for (const sub of subscribers) {
    try {
      sub.send(event, data);
    } catch {
      subscribers.delete(sub);
    }
  }
}
