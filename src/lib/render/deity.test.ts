import { describe, expect, it } from "vitest";

import { deityFolder, DEITY_FOLDERS } from "@/lib/render/deity";

describe("deityFolder", () => {
  it("takes the model's answer when it names a god we file under", () => {
    expect(deityFolder("Shiva", "Shiva Purana")).toBe("shiva");
    expect(deityFolder("Krishna", "Bhagavata Purana")).toBe("krishna");
  });

  it("trusts the model over the scripture, because the episode is what matters", () => {
    // A Shiva Purana episode can centre on Ganesha, and the background should
    // follow the story rather than the book it sits in.
    expect(deityFolder("Ganesha", "Shiva Purana")).toBe("ganesha");
    expect(deityFolder("Markandeya", "Shiva Purana")).toBe("yama");
  });

  it("folds epithets and honorifics onto the same folder", () => {
    expect(deityFolder("Lord Shiva", "")).toBe("shiva");
    expect(deityFolder("Mahadeva", "")).toBe("shiva");
    expect(deityFolder("Sri Narayana", "")).toBe("vishnu");
    expect(deityFolder("Anjaneya", "")).toBe("hanuman");
  });

  it("folds the goddesses onto one folder, as the art is filed", () => {
    for (const name of ["Parvati", "Sati", "Durga", "Kali", "Lakshmi"]) {
      expect(deityFolder(name, "")).toBe("devi");
    }
  });

  it("survives long-vowel transliteration", () => {
    expect(deityFolder("Śiva", "")).toBe("shiva");
    expect(deityFolder("Kṛṣṇa", "")).toBe("krishna");
  });

  it("pulls the name out when the model answers with a phrase", () => {
    expect(deityFolder("the sage Narada", "")).toBe("sage");
    expect(deityFolder("Vishnu, in his Narasimha form", "")).toBe("vishnu");
  });

  it("falls back to the Purana when the model gives nothing usable", () => {
    expect(deityFolder("", "Shiva Purana")).toBe("shiva");
    expect(deityFolder(null, "Bhagavata Purana Canto 11")).toBe("vishnu");
    expect(deityFolder(undefined, "Devi Bhagavata")).toBe("devi");
    expect(deityFolder("   ", "Linga Purana")).toBe("shiva");
  });

  it("answers 'general' rather than guessing when nothing matches", () => {
    expect(deityFolder("", "")).toBe("general");
    expect(deityFolder("Nobody", "Some Unknown Text")).toBe("general");
  });

  it("never returns anything that could escape the backgrounds directory", () => {
    // The whole reason the list is closed: this string must not become a path.
    const nasty = deityFolder("../../etc/passwd", "");
    expect(DEITY_FOLDERS).toContain(nasty);
    expect(nasty).not.toContain("/");
    expect(nasty).not.toContain(".");
  });

  it("always answers with a folder from the closed list", () => {
    for (const input of ["Shiva", "banana", "", "Rama", "Yama", "12345"]) {
      expect(DEITY_FOLDERS).toContain(deityFolder(input, ""));
    }
  });
});
