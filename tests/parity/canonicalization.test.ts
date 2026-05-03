import { describe, it, expect } from "vitest";
import { canonical } from "../../src/utils/route-canonical.js";

describe("canonical() – route canonicalization helper", () => {
  it("lowercases the HTTP method", () => {
    expect(canonical("GET", "/api/v1/roots")).toBe("get /api/v1/roots");
    expect(canonical("POST", "/api/v1/items")).toBe("post /api/v1/items");
    expect(canonical("DELETE", "/api/v1/items/1")).toBe("delete /api/v1/items/1");
  });

  it("strips trailing slash (except bare /)", () => {
    expect(canonical("GET", "/api/v1/roots/")).toBe("get /api/v1/roots");
    expect(canonical("GET", "/api/v1/roots")).toBe("get /api/v1/roots");
    expect(canonical("GET", "/")).toBe("get /");
  });

  it("converts Fastify :param notation to OpenAPI {param}", () => {
    expect(canonical("GET", "/api/surahs/:number")).toBe("get /api/surahs/{number}");
    expect(canonical("GET", "/api/surah/:s/ayah/:a")).toBe("get /api/surah/{s}/ayah/{a}");
    expect(canonical("GET", "/api/surah/:s/ayah/:a/word/:w")).toBe(
      "get /api/surah/{s}/ayah/{a}/word/{w}",
    );
  });

  it("leaves {param} OpenAPI notation unchanged", () => {
    expect(canonical("GET", "/api/surahs/{number}")).toBe("get /api/surahs/{number}");
    expect(canonical("GET", "/api/surah/{s}/ayah/{a}")).toBe("get /api/surah/{s}/ayah/{a}");
  });

  it("collapses consecutive slashes", () => {
    expect(canonical("GET", "/api//roots")).toBe("get /api/roots");
    expect(canonical("GET", "//api/v1//quran")).toBe("get /api/v1/quran");
  });

  it("handles combined transformations", () => {
    expect(canonical("GET", "/api/v1/roots/:root/lemmas/")).toBe(
      "get /api/v1/roots/{root}/lemmas",
    );
    expect(canonical("get", "/api/v1/quran/surah/:s/ayah/:a/word/:w/")).toBe(
      "get /api/v1/quran/surah/{s}/ayah/{a}/word/{w}",
    );
  });
});
