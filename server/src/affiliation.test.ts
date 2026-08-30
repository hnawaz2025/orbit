import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findOrganisations } from "./match/affiliation";

// "Who is here from Google?" is a lookup, not a search. Embedding it puts
// "Google" next to a great deal of AI content and nowhere near a person whose
// subtitle ends in "@ Google" -- a corpus holding eight Google engineers
// returned one, behind two unrelated roundtables.

const KNOWN = ["google", "openai", "kong inc.", "salesforce", "you.com", "axway", "ibm"];

describe("findOrganisations", () => {
  test("finds the companies a question names", () => {
    assert.deepEqual(
      findOrganisations("tell me people i want to meet from Google and OpenAI", KNOWN).sort(),
      ["google", "openai"]
    );
  });

  test("is case insensitive", () => {
    assert.deepEqual(findOrganisations("anyone from SALESFORCE?", KNOWN), ["salesforce"]);
  });

  test("matches only whole words", () => {
    // "Kong" inside "Hong Kong" is not a company reference, and a substring
    // match would make this fire constantly.
    assert.deepEqual(findOrganisations("our team in Hong Kong", ["kong"]), []);
  });

  test("does not invent companies the corpus has never heard of", () => {
    // Matching against the corpus rather than extracting freely is what keeps
    // "I work at a bank" from becoming a search for a company called "a bank".
    assert.deepEqual(findOrganisations("I work at a small fintech startup", KNOWN), []);
  });

  test("ignores ordinary prose that happens to contain no company", () => {
    assert.deepEqual(
      findOrganisations("how do I stop my database falling over under load", KNOWN),
      []
    );
  });

  test("handles a company name with punctuation", () => {
    assert.deepEqual(findOrganisations("is anyone here from Kong Inc.?", KNOWN), ["kong inc."]);
  });

  test("requires affiliation wording before trusting a very short name", () => {
    // Two- and three-letter company names collide with ordinary words, so they
    // are only accepted when the question is clearly about who is here.
    assert.deepEqual(findOrganisations("who is here from IBM", KNOWN), ["ibm"]);
    assert.deepEqual(findOrganisations("ibm mainframes are interesting", KNOWN), []);
  });
});
