export interface Captured {
  id: string;
  receivedAt: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  truncated: boolean;
}

export const MAX_BODY_CHARS = 256 * 1024;

/** Fixed-size, newest-first buffer of captured requests. */
export class RequestStore {
  private items: Captured[] = [];
  private counter = 0;

  constructor(private readonly capacity = 200) {}

  add(entry: Omit<Captured, "id" | "receivedAt" | "truncated">): Captured {
    const truncated = entry.body.length > MAX_BODY_CHARS;
    const captured: Captured = {
      ...entry,
      body: truncated ? entry.body.slice(0, MAX_BODY_CHARS) : entry.body,
      id: `r${++this.counter}`,
      receivedAt: new Date().toISOString(),
      truncated,
    };
    this.items = [captured, ...this.items].slice(0, this.capacity);
    return captured;
  }

  list(): Captured[] {
    return [...this.items];
  }

  get(id: string): Captured | undefined {
    return this.items.find((i) => i.id === id);
  }

  clear(): void {
    this.items = [];
  }
}
