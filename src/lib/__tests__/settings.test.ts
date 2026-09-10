import { describe, expect, it } from "vitest";
import { cleanTheme } from "../settings-store";

describe("cleanTheme", () => {
  it("accepts the two surfaces", () => {
    expect(cleanTheme("light")).toBe("light");
    expect(cleanTheme("dark")).toBe("dark");
  });

  it("refuses anything else, so a crafted body cannot stamp arbitrary markup", () => {
    for (const bad of ["system", "LIGHT", "", " dark", null, undefined, 1, {}, ['"><script>']]) {
      expect(cleanTheme(bad)).toBeNull();
    }
  });
});
