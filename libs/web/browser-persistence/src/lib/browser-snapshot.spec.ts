import "fake-indexeddb/auto";
import { BrowserSnapshot } from "./browser-snapshot";
import { parseCaseFile } from "@pawtrace/case-domain";
import fixture from "@pawtrace/case-domain/fixtures/minimal-case-v1.json";

it("restores a complete snapshot after reopening the storage adapter", async () => {
  const parsed = parseCaseFile(JSON.stringify(fixture));
  if (!parsed.success) throw new Error("Invalid fixture");
  const storage = new BrowserSnapshot();
  await storage.write(parsed.data);
  expect(await new BrowserSnapshot().read()).toEqual(parsed.data);
});

it("rejects an aborted transaction and retains the last successful snapshot", async () => {
  const parsed = parseCaseFile(JSON.stringify(fixture));
  if (!parsed.success) throw new Error("Invalid fixture");
  const storage = new BrowserSnapshot();
  await storage.write(parsed.data);
  const put = IDBObjectStore.prototype.put;
  const failure = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
  await expect(
    storage.write({
      ...parsed.data,
      points: [],
      case: { ...parsed.data.case, title: "Replacement" },
    }),
  ).rejects.toBeDefined();
  failure.mockRestore();
  expect(await storage.read()).toEqual(parsed.data);
});
