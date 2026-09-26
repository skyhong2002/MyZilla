import type { BrowserEvent, Capture } from "../shared/events";
interface Stored {
  id: string;
  event: BrowserEvent;
  synced: number;
}
let connection: Promise<IDBDatabase> | undefined;
function open() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("myzilla", 1);
    request.onupgradeneeded = () => {
      request.result
        .createObjectStore("events", { keyPath: "id" })
        .createIndex("synced", "synced");
      request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Storage transaction aborted"));
  });
}
export async function putEvents(events: BrowserEvent[]) {
  const db = await open();
  const tx = db.transaction("events", "readwrite");
  const complete = done(tx);
  const store = tx.objectStore("events");
  for (const event of events) {
    const request = store.get(event.id);
    request.onsuccess = () => {
      if (!request.result) store.put({ id: event.id, event, synced: 0 });
    };
  }
  await complete;
}
export async function pending(): Promise<Stored[]> {
  const tx = (await open()).transaction("events");
  return result(tx.objectStore("events").index("synced").getAll(0, 250));
}
export async function acknowledge(records: Stored[]) {
  const tx = (await open()).transaction("events", "readwrite");
  const complete = done(tx);
  for (const record of records)
    tx.objectStore("events").put({ ...record, synced: 1 });
  await complete;
}
export async function getCapture(): Promise<Capture | undefined> {
  return result(
    (await open()).transaction("meta").objectStore("meta").get("capture"),
  );
}
export async function saveCapture(
  capture: Capture | undefined,
  event: BrowserEvent | null,
) {
  const tx = (await open()).transaction(["meta", "events"], "readwrite");
  const complete = done(tx);
  if (capture) tx.objectStore("meta").put(capture, "capture");
  else tx.objectStore("meta").delete("capture");
  if (event) tx.objectStore("events").put({ id: event.id, event, synced: 0 });
  await complete;
}
export async function counts() {
  const db = await open();
  const store = db.transaction("events").objectStore("events");
  const [total, pending] = await Promise.all([
    result(store.count()),
    result(store.index("synced").count(0)),
  ]);
  return { total, pending };
}
