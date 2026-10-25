import { describe, it, expect } from "vitest";
import { echapperHtml, nettoyerTextePublic } from "./texteBrut";

describe("nettoyerTextePublic", () => {
  it("conserve un texte normal, accents, '<' et '>' compris", () => {
    expect(nettoyerTextePublic("Délai < 24 h → annulation > gratuite")).toBe("Délai < 24 h → annulation > gratuite");
  });
  it("normalise les retours chariot en sauts de ligne", () => {
    expect(nettoyerTextePublic("a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("retire l'octet nul et les contrôles C0, garde tabulation et saut de ligne", () => {
    expect(nettoyerTextePublic("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
  });
  it("retire les surcharges bidirectionnelles et caractères invisibles", () => {
    expect(nettoyerTextePublic("a‮b⁦c​d﻿e")).toBe("abcde");
  });
  it("conserve le ZWJ des emoji et les marques LRM/RLM", () => {
    expect(nettoyerTextePublic("a‍b‏c")).toBe("a‍b‏c");
  });
});

describe("echapperHtml", () => {
  it("neutralise les cinq caractères sensibles", () => {
    expect(echapperHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  });
});
