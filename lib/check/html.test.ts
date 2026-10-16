import { describe, expect, it } from "vitest";
import { decode } from "@/lib/check/html";

describe("decode", () => {
  it("löst Zeichen- und Zahlen-Entitäten auf", () => {
    expect(decode("Tom &amp; Jerry &lt;b&gt; &quot;x&quot; &#228; &#xE4; a&nbsp;b")).toBe('Tom & Jerry <b> "x" ä ä a b');
  });
  it("löst die benannten Umlaute und Anführungszeichen auf und unterscheidet Gross und Klein", () => {
    expect(decode("K&auml;se, &Auml;pfel, &ouml;l, &Ouml;sterreich, &uuml;ber, &Uuml;bung, Stra&szlig;e")).toBe("Käse, Äpfel, öl, Österreich, über, Übung, Stra\u00dfe");
    expect(decode("&laquo;Hallo&raquo; &ndash; &mdash; &hellip; &euro; &copy;")).toBe("«Hallo» – — … € ©");
  });
  it("lässt Unbekanntes stehen und verwirft verbotene Zeichen", () => {
    expect(decode("&unbekannt; &#0; &#xD800;")).toBe("&unbekannt; &#0; &#xD800;");
    expect(decode("a\u0000b")).toBe("ab");
  });
});
