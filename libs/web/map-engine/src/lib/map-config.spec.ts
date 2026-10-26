import { parseMapConfig } from "./map-config";

describe("Public map configuration", () => {
  it("accepts default sources and independently configurable source/attribution pairs", () => {
    expect(parseMapConfig({ mapboxToken: "" })).toEqual({ mapboxToken: "" });
    const config = {
      mapboxToken: "pk.test",
      osm: {
        urlTemplate: "https://maps.example.test/{z}/{x}/{y}.png",
        attribution: "Street provider",
      },
      satellite: {
        urlTemplate: "/satellite/{z}/{x}/{y}?token={accessToken}",
        attribution: "Satellite provider",
      },
    };
    expect(parseMapConfig(config)).toEqual(config);
  });

  it.each([
    {
      urlTemplate: "javascript:alert(1)//{z}/{x}/{y}",
      attribution: "Provider",
    },
    {
      urlTemplate: "https://maps.example.test/{z}/{x}.png",
      attribution: "Provider",
    },
    {
      urlTemplate: "https://maps.example.test/{z}/{x}/{y}.png",
      attribution: "",
    },
    { attribution: "Provider" },
    null,
  ])("rejects malformed source settings: %j", (source) => {
    expect(parseMapConfig({ mapboxToken: "", osm: source })).toBeUndefined();
    expect(
      parseMapConfig({ mapboxToken: "", satellite: source }),
    ).toBeUndefined();
  });
});
