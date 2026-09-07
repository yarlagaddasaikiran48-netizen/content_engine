/**
 * Which script is this text written in?
 *
 * The narration is spoken by a Telugu voice (te-IN), which reads the Telugu
 * alphabet and nothing else. Two failure modes make it past every other check
 * in the pipeline and only reveal themselves in the finished audio:
 *
 *   1. The model quietly reverts to English. The voice reads it with Telugu
 *      phonetics and the result is unlistenable.
 *   2. The model writes Telugu but spells it in Latin letters — "neeku telusa"
 *      instead of "నీకు తెలుసా". Correct language, wrong alphabet, same
 *      unusable audio.
 *
 * Both are caught by asking what share of the letters are Telugu. Word counts,
 * safety filters and the duplicate hash all pass happily on English, so this is
 * the only gate that sees the difference.
 *
 * Scope: this judges the ALPHABET, not the register. Literary grandhika Telugu
 * and modern spoken Telugu use the same letters and both pass here — keeping
 * the register modern is the prompt's job.
 */

/** The Telugu Unicode block. */
const TELUGU_LETTER = /[ఀ-౿]/;
const LATIN_LETTER = /[A-Za-z]/;

/**
 * Telugu letters as a fraction of all letters, ignoring punctuation, digits
 * and whitespace. Returns 0 for text containing no letters at all.
 */
export function teluguShare(text: string): number {
  let telugu = 0;
  let latin = 0;

  for (const char of text) {
    if (TELUGU_LETTER.test(char)) telugu += 1;
    else if (LATIN_LETTER.test(char)) latin += 1;
  }

  const total = telugu + latin;
  return total === 0 ? 0 : telugu / total;
}

/**
 * Is this usable as Telugu narration?
 *
 * The threshold is deliberately loose. A stray Latin loanword costs a few
 * percent and should not throw away an otherwise good script, while the
 * failures worth catching — full English, or romanised Telugu — score at or
 * near zero. There is no useful middle ground to tune between.
 */
export function isPredominantlyTelugu(text: string, minShare = 0.7): boolean {
  return teluguShare(text) >= minShare && TELUGU_LETTER.test(text);
}
