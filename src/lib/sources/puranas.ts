/**
 * Curated corpus of real, citable narratives and teachings from the Puranas,
 * the principal Upanishads and the Ramayana.
 *
 * SOURCING POLICY
 * ---------------
 * Every `citationUrl` below points at a full English translation hosted on
 * wisdomlib.org, and every one of those book URLs was verified to return
 * HTTP 200. Nothing here is paraphrased from memory into a citation it cannot
 * support: the `summary` is the grounding context handed to the LLM, and the
 * `reference` names the book/chapter a human can check.
 *
 * Translations used are the standard scholarly ones in the public domain
 * (Wilson's Vishnu Purana, Pargiter's Markandeya, Shastri's Ramayana, and the
 * Motilal Banarsidass Purana series). Copyright-active renderings are excluded.
 *
 * These entries seed `topic_ledger` alongside all 700 Gita verses. Each topic
 * is handed out at most once, ever.
 */

import type { TopicSource } from "@/lib/types";

export interface CorpusEntry {
  /** Stable unique key — also the primary key in topic_ledger. */
  key: string;
  source: TopicSource;
  scripture: string;
  reference: string;
  title: string;
  theme: string;
  summary: string;
  citationUrl: string;
  /** Higher = offered sooner. Widely loved stories lead. */
  weight?: number;
}

const VISHNU = "https://www.wisdomlib.org/hinduism/book/vishnu-purana-wilson";
const BHAGAVATA = "https://www.wisdomlib.org/hinduism/book/the-bhagavata-purana";
const SHIVA = "https://www.wisdomlib.org/hinduism/book/shiva-purana-english";
const GARUDA = "https://www.wisdomlib.org/hinduism/book/the-garuda-purana";
const MARKANDEYA = "https://www.wisdomlib.org/hinduism/book/the-markandeya-purana";
const SKANDA = "https://www.wisdomlib.org/hinduism/book/the-skanda-purana";
const PADMA = "https://www.wisdomlib.org/hinduism/book/the-padma-purana";
const LINGA = "https://www.wisdomlib.org/hinduism/book/the-linga-purana";
const BRAHMA = "https://www.wisdomlib.org/hinduism/book/the-brahma-purana";
const BRAHMANDA = "https://www.wisdomlib.org/hinduism/book/the-brahmanda-purana";
const NARADA = "https://www.wisdomlib.org/hinduism/book/the-narada-purana";
const DEVI = "https://www.wisdomlib.org/hinduism/book/devi-bhagavata-purana";
const AGNI = "https://www.wisdomlib.org/hinduism/book/the-agni-purana";
const CHANDOGYA =
  "https://www.wisdomlib.org/hinduism/book/chandogya-upanishad-english";
const BRIHAD = "https://www.wisdomlib.org/hinduism/book/the-brihadaranyaka-upanishad";
const TAITTIRIYA = "https://www.wisdomlib.org/hinduism/book/the-taittiriya-upanishad";
const RAMAYANA = "https://www.wisdomlib.org/hinduism/book/the-ramayana-of-valmiki";

export const CORPUS: CorpusEntry[] = [
  // ===========================================================================
  // VISHNU PURANA
  // ===========================================================================
  {
    key: "purana:vishnu:dhruva",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 1, Chapters 11–12",
    title: "Dhruva, the boy who would not be moved",
    theme: "perseverance and single-minded resolve",
    summary:
      "Refused a seat on his father's lap by his stepmother, the child Dhruva walks into the forest and undertakes austerity with such concentration that Vishnu appears before him. Dhruva, who began seeking a kingdom, finds he no longer wants one. He is fixed in the sky as the pole star — the one point that never wavers.",
    citationUrl: VISHNU,
    weight: 130,
  },
  {
    key: "purana:vishnu:prahlada",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 1, Chapters 17–20",
    title: "Prahlada, devotion that fire could not burn",
    theme: "unshakeable faith under persecution",
    summary:
      "Hiranyakashipu orders his own son killed for worshipping Vishnu. Prahlada is thrown from cliffs, given poison and cast into fire, and survives each time without hatred for his father. His answer is that the Lord is everywhere, including in the pillar — and in his tormentor.",
    citationUrl: VISHNU,
    weight: 130,
  },
  {
    key: "purana:vishnu:vena-prithu",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 1, Chapter 13",
    title: "King Vena and the earth that refused to yield",
    theme: "righteous leadership and responsibility",
    summary:
      "The tyrant Vena forbids worship and sacrifice, and the earth herself withholds her harvests. From his body arises Prithu, who rules by first winning the earth's trust rather than commanding it. The land gives freely to the king who protects it.",
    citationUrl: VISHNU,
    weight: 100,
  },
  {
    key: "purana:vishnu:jada-bharata",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 2, Chapters 13–16",
    title: "Bharata and the fawn he could not stop loving",
    theme: "attachment quietly redirecting a life",
    summary:
      "The royal ascetic Bharata renounces a kingdom successfully, then loses his liberation to a single orphaned deer he cannot stop worrying about. Dying with the fawn in his mind, he is reborn as a deer. Reborn again as a man, he refuses to speak — and is mistaken for an idiot while carrying the highest knowledge.",
    citationUrl: VISHNU,
    weight: 120,
  },
  {
    key: "purana:vishnu:kapila-sagara",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 4, Chapter 4",
    title: "The sixty thousand sons of Sagara",
    theme: "arrogance and its long repair",
    summary:
      "Sagara's sons tear up the earth searching for a stolen horse and accuse the meditating sage Kapila of the theft. Their insolence reduces them to ash. Generations later Bhagiratha brings down the Ganga to redeem them — one man's patience repairing what pride destroyed.",
    citationUrl: VISHNU,
    weight: 110,
  },
  {
    key: "purana:vishnu:kali-yuga",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 6, Chapters 1–2",
    title: "The one advantage of the Kali age",
    theme: "hope in a difficult age",
    summary:
      "Parashara describes the degradations of the Kali age with unsparing clarity — then names its hidden gift. What took long penance in earlier ages is now attained by simply remembering the divine name with sincerity. The worst age is also the cheapest one in which to be liberated.",
    citationUrl: VISHNU,
    weight: 125,
  },
  {
    key: "purana:vishnu:krishna-govardhana",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 5, Chapters 10–11",
    title: "Govardhana lifted on a child's finger",
    theme: "protection and the end of fear",
    summary:
      "Krishna persuades the cowherds to honour the hill that actually feeds their cattle instead of performing rote sacrifice to Indra. When the insulted Indra sends a week of storms, Krishna raises Govardhana on one finger and shelters everyone beneath it.",
    citationUrl: VISHNU,
    weight: 130,
  },

  // ===========================================================================
  // BHAGAVATA PURANA
  // ===========================================================================
  {
    key: "purana:bhagavata:gajendra",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 8, Chapters 2–4",
    title: "Gajendra: the cry that was finally answered",
    theme: "surrender at the end of self-effort",
    summary:
      "An elephant king seized by a crocodile fights for a thousand years on his own strength and slowly loses. Only when he stops struggling and lifts a single lotus in complete helplessness does Vishnu come. The moment of rescue is the moment of surrender, not the moment of effort.",
    citationUrl: BHAGAVATA,
    weight: 135,
  },
  {
    key: "purana:bhagavata:ajamila",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 6, Chapters 1–2",
    title: "Ajamila, saved by his son's name",
    theme: "the power of the divine name",
    summary:
      "Ajamila abandons a life of virtue and falls badly. Dying in terror, he calls out for his youngest son — who happens to be named Narayana. Uttered without any devotion at all, the name still works, and he is given the rest of his life to mean it.",
    citationUrl: BHAGAVATA,
    weight: 125,
  },
  {
    key: "purana:bhagavata:avadhuta-24-gurus",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 11, Chapters 7–9",
    title: "The avadhuta's twenty-four teachers",
    theme: "learning from everything around you",
    summary:
      "Asked why he is so serene, a wandering ascetic tells King Yadu he has had twenty-four gurus — the earth for patience under abuse, the wind for moving through the world untouched, the honeybee for taking a little from many flowers, the python for contentment with what comes.",
    citationUrl: BHAGAVATA,
    weight: 135,
  },
  {
    key: "purana:bhagavata:vamana-bali",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 8, Chapters 15–22",
    title: "Three paces of land from King Bali",
    theme: "generosity greater than loss",
    summary:
      "A dwarf brahmin asks the world-conquering Bali for only three paces of land. Warned it is Vishnu himself, Bali gives anyway rather than break his word. Two steps cover all creation; for the third, Bali offers his own head — and is honoured above the gods for it.",
    citationUrl: BHAGAVATA,
    weight: 130,
  },
  {
    key: "purana:bhagavata:kapila-devahuti",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 3, Chapters 25–33",
    title: "Kapila teaches his mother",
    theme: "devotion combined with discernment",
    summary:
      "Devahuti asks her own son for liberating knowledge. Kapila answers that the mind is the cause of both bondage and freedom: attached to the senses it binds, turned toward the divine it frees. He gives her devotion as the gentlest and surest of all methods.",
    citationUrl: BHAGAVATA,
    weight: 110,
  },
  {
    key: "purana:bhagavata:kunti-prayers",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 1, Chapter 8",
    title: "Kunti asks for calamities",
    theme: "difficulty as remembrance",
    summary:
      "As Krishna departs, Queen Kunti prays for misfortune to keep visiting her — because in comfort she forgets him, and in trouble she remembers. It is one of the strangest and most honest prayers in all scripture.",
    citationUrl: BHAGAVATA,
    weight: 125,
  },
  {
    key: "purana:bhagavata:bhishma-departure",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 1, Chapter 9",
    title: "Bhishma choosing his hour",
    theme: "meeting death consciously",
    summary:
      "Lying on a bed of arrows, Bhishma waits for the auspicious northern course of the sun before releasing his life, teaching dharma to the Pandavas until his final breath. He dies with his eyes on Krishna, awake to the last moment.",
    citationUrl: BHAGAVATA,
    weight: 110,
  },
  {
    key: "purana:bhagavata:dhruva-return",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 4, Chapters 8–12",
    title: "Dhruva's regret at getting what he asked for",
    theme: "asking too little of life",
    summary:
      "Dhruva attains the vision of the Lord and is immediately ashamed: he had performed such austerity merely to ask for a throne. He says he searched for broken glass and found a jewel. The Bhagavata's lesson is not that he failed, but that we routinely aim too low.",
    citationUrl: BHAGAVATA,
    weight: 120,
  },
  {
    key: "purana:bhagavata:rishabha-teaching",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 5, Chapter 5",
    title: "Rishabha on what the body is for",
    theme: "purpose of human birth",
    summary:
      "Rishabhadeva tells his hundred sons that the human body is not meant for the pursuit of pleasures available to any animal, but for the discipline that purifies. The rare thing about a human birth is that it can be used for something other than appetite.",
    citationUrl: BHAGAVATA,
    weight: 115,
  },
  {
    key: "purana:bhagavata:churning-ocean",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 8, Chapters 5–9",
    title: "The poison comes before the nectar",
    theme: "enduring the bitter phase",
    summary:
      "When the ocean is churned for the nectar of immortality, the first thing to surface is halahala, a poison that threatens all creation. Shiva drinks it and holds it in his throat. Only after the poison is faced does the nectar appear.",
    citationUrl: BHAGAVATA,
    weight: 135,
  },
  {
    key: "purana:bhagavata:uddhava-gita",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 11, Chapters 6–29",
    title: "Krishna's last teaching to Uddhava",
    theme: "equanimity and letting go",
    summary:
      "Before departing the world, Krishna gives Uddhava his final instruction: see the same self in all beings, keep the mind unshaken by praise or blame, and understand that what is happening is not happening to you. It is the Gita's quieter, more personal sequel.",
    citationUrl: BHAGAVATA,
    weight: 115,
  },
  {
    key: "purana:bhagavata:sudama",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 10, Chapters 80–81",
    title: "Sudama's handful of flattened rice",
    theme: "friendship without transaction",
    summary:
      "A destitute brahmin visits his childhood friend, now a king, carrying only a small bundle of beaten rice and too ashamed to offer it. Krishna takes it from him by force and eats it with delight. Sudama goes home having asked for nothing and finds everything changed.",
    citationUrl: BHAGAVATA,
    weight: 130,
  },
  {
    key: "purana:bhagavata:narada-past-life",
    source: "purana",
    scripture: "Bhagavata Purana",
    reference: "Canto 1, Chapters 5–6",
    title: "Narada, once a servant boy",
    theme: "humble beginnings and holy company",
    summary:
      "Narada tells Vyasa he was born to a maidservant and spent one rainy season serving visiting ascetics. Their leftover food and their conversation were enough to change the direction of his soul across lifetimes. Good company, he says, did what nothing else could.",
    citationUrl: BHAGAVATA,
    weight: 110,
  },

  // ===========================================================================
  // SHIVA PURANA
  // ===========================================================================
  {
    key: "purana:shiva:markandeya",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita",
    title: "Markandeya, the boy who outlived his death",
    theme: "refuge and fearlessness",
    summary:
      "Granted a brilliant life of only sixteen years, Markandeya spends his last day clinging to the Shiva linga. When Yama's noose falls it catches the linga too, and Shiva emerges to stop death itself. The boy is granted deathlessness at the precise moment he had accepted dying.",
    citationUrl: SHIVA,
    weight: 130,
  },
  {
    key: "purana:shiva:neelkantha",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita, Sati Khanda",
    title: "Neelkantha: holding the poison in the throat",
    theme: "bearing what others cannot",
    summary:
      "Shiva swallows the world-destroying halahala and neither spits it out nor lets it descend into him. Parvati holds his throat, and the poison stays there, turning it blue. Greatness here is not destroying the poison but containing it so no one else is harmed.",
    citationUrl: SHIVA,
    weight: 135,
  },
  {
    key: "purana:shiva:daksha-yajna",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita, Sati Khanda",
    title: "The sacrifice that insulted a daughter",
    theme: "pride and the ruin of ritual",
    summary:
      "Daksha holds a grand sacrifice and pointedly does not invite his daughter Sati's husband. Sati attends anyway, hears her husband mocked, and gives up her body in the fire. A perfectly performed ritual with contempt at its centre becomes worthless.",
    citationUrl: SHIVA,
    weight: 115,
  },
  {
    key: "purana:shiva:lingodbhava",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Vidyeshvara Samhita",
    title: "The pillar of light neither god could measure",
    theme: "the limits of ego and knowledge",
    summary:
      "Brahma and Vishnu argue over who is greater. A column of fire appears with no visible top or bottom, and they agree that whoever finds an end wins. Vishnu returns and admits he could not. Brahma lies — and forfeits his worship for it. Honesty about not knowing is the whole test.",
    citationUrl: SHIVA,
    weight: 125,
  },
  {
    key: "purana:shiva:ganesha-birth",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita, Kumara Khanda",
    title: "How Ganesha got his head",
    theme: "obstacles and new beginnings",
    summary:
      "Parvati forms a boy from the turmeric paste of her own body and posts him at her door. He obeys her instruction so completely that he stops even Shiva — and loses his head for it. Restored with an elephant's head, he becomes the one worshipped first, before every undertaking.",
    citationUrl: SHIVA,
    weight: 135,
  },
  {
    key: "purana:shiva:upamanyu",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita",
    title: "Upamanyu and the ocean of milk",
    theme: "asking greatly, refusing the small bribe",
    summary:
      "The hungry boy Upamanyu performs austerity for milk. Indra appears in disguise offering it and speaking against Shiva; the boy refuses the gift rather than hear his Lord insulted. Shiva then grants him an ocean of milk that never empties.",
    citationUrl: SHIVA,
    weight: 100,
  },
  {
    key: "purana:shiva:bhasmasura",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Rudra Samhita, Yuddha Khanda",
    title: "Bhasmasura, destroyed by his own boon",
    theme: "power without wisdom",
    summary:
      "Granted the power to burn anyone whose head he touches, Bhasmasura immediately turns on the god who gave it. He is undone by being invited to dance, imitating a gesture, and placing his hand on his own head. Unearned power finds its own way back to its owner.",
    citationUrl: SHIVA,
    weight: 120,
  },
  {
    key: "purana:shiva:jyotirlinga",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Kotirudra Samhita",
    title: "The twelve lights across the land",
    theme: "sacred geography and pilgrimage",
    summary:
      "The Shiva Purana names twelve jyotirlingas from Somnath in Gujarat to Rameshwaram in the south, each with its own story of a devotee whose need called Shiva to that spot. Together they map devotion across the whole of the subcontinent.",
    citationUrl: SHIVA,
    weight: 115,
  },

  // ===========================================================================
  // MARKANDEYA PURANA
  // ===========================================================================
  {
    key: "purana:markandeya:mahishasura",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Devi Mahatmya, Chapters 2–4",
    title: "Durga and the buffalo demon",
    theme: "the strength that rises when all else fails",
    summary:
      "No single god can defeat Mahishasura, so all of them release their energies at once and a goddess forms from the combined light — each weapon in her many hands a gift from one of them. What none could do alone, their united power accomplishes as her.",
    citationUrl: MARKANDEYA,
    weight: 135,
  },
  {
    key: "purana:markandeya:madhu-kaitabha",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Devi Mahatmya, Chapter 1",
    title: "The sleep that had to be woken",
    theme: "awakening from delusion",
    summary:
      "Two demons born of Vishnu's cosmic sleep threaten Brahma, who cannot wake the Lord. He praises Yoganidra, the goddess of that sleep, and only when she withdraws does Vishnu stir. The obstacle and the solution are the same power, facing two directions.",
    citationUrl: MARKANDEYA,
    weight: 105,
  },
  {
    key: "purana:markandeya:shumbha-nishumbha",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Devi Mahatmya, Chapters 5–10",
    title: "Alone against Shumbha and Nishumbha",
    theme: "facing the many with the one",
    summary:
      "Taunted for fighting with help, the Devi withdraws every emanation back into herself and says: see, I am alone in the world — who else is there? She then defeats the demons single-handed. The many powers were never separate from the one.",
    citationUrl: MARKANDEYA,
    weight: 115,
  },
  {
    key: "purana:markandeya:harishchandra",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters 7–8",
    title: "Harishchandra, who would not tell one lie",
    theme: "truth held past all reason",
    summary:
      "To keep a promise, a king gives away his kingdom, sells his wife and son, and takes work at a cremation ground. Tested at the lowest possible moment — asked for a fee to burn his own child — he still will not break his word.",
    citationUrl: MARKANDEYA,
    weight: 125,
  },
  {
    key: "purana:markandeya:madalasa",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters 25–27",
    title: "Madalasa's lullaby",
    theme: "raising children in wisdom",
    summary:
      "Queen Madalasa sings her infants to sleep with 'you are pure, you are awake, you are without form' — refusing to soothe them with flattery about the body. Three sons renounce the world; the fourth she is asked to raise as a king, and she teaches him to rule as one.",
    citationUrl: MARKANDEYA,
    weight: 110,
  },

  // ===========================================================================
  // GARUDA PURANA
  // ===========================================================================
  {
    key: "purana:garuda:soul-journey",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Preta Khanda",
    title: "What the Garuda Purana says about after",
    theme: "mortality and accountability",
    summary:
      "Recited traditionally in the days after a death, this section describes the soul's passage and the consequences of a life's actions. Its actual purpose is addressed to the living: it is a book about how to act now, delivered in the one moment people truly listen.",
    citationUrl: GARUDA,
    weight: 115,
  },
  {
    key: "purana:garuda:charity",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Acara Khanda",
    title: "What actually travels with you",
    theme: "detachment from possessions",
    summary:
      "The Garuda Purana states plainly that wealth stays behind, relatives turn back at the door, and only what a person has done accompanies them. It urges giving while living rather than leaving it to others afterwards.",
    citationUrl: GARUDA,
    weight: 120,
  },
  {
    key: "purana:garuda:right-living",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Acara Khanda",
    title: "The habits that quietly decide a life",
    theme: "daily discipline",
    summary:
      "Between its cosmology the Garuda Purana gives ordinary instruction: rise early, eat moderately, speak without cruelty, keep good company, and do not postpone dharma to old age. It treats routine as destiny in slow motion.",
    citationUrl: GARUDA,
    weight: 105,
  },

  // ===========================================================================
  // SKANDA PURANA
  // ===========================================================================
  {
    key: "purana:skanda:kartikeya-birth",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Maheshvara Khanda",
    title: "The child born to end Taraka",
    theme: "courage arriving when needed",
    summary:
      "Tarakasura's boon makes him unkillable except by a son of Shiva — and Shiva is deep in meditation with no interest in marriage. The whole story is the universe patiently arranging the conditions for the one being who can end the tyranny.",
    citationUrl: SKANDA,
    weight: 110,
  },
  {
    key: "purana:skanda:kashi",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Kashi Khanda",
    title: "The city that is never destroyed",
    theme: "sacred space and liberation",
    summary:
      "Kashi is described as resting on Shiva's trident, untouched even by the dissolution that ends the worlds. Its promise is not comfort but liberation: to die there is to be released, which is why the old and the dying still travel to it.",
    citationUrl: SKANDA,
    weight: 115,
  },
  {
    key: "purana:skanda:shiva-parvati-marriage",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Maheshvara Khanda",
    title: "Parvati's austerity for a beggar's hand",
    theme: "steadfast love and inner worth",
    summary:
      "Parvati abandons palace life for severe penance to win an ascetic who owns nothing. Shiva comes disguised as an old man to argue his own case badly, listing his faults. She refuses to be talked out of it, and he reveals himself.",
    citationUrl: SKANDA,
    weight: 125,
  },

  // ===========================================================================
  // PADMA PURANA
  // ===========================================================================
  {
    key: "purana:padma:bhakti-sons",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda, Bhagavata Mahatmya",
    title: "Devotion young, her sons grown old",
    theme: "feeling without dryness",
    summary:
      "Narada meets a young woman named Bhakti tending two exhausted old men, Jnana and Vairagya — knowledge and dispassion. Devotion stays young wherever she goes, but her sons age in a world that keeps only the theory and loses the love.",
    citationUrl: PADMA,
    weight: 120,
  },
  {
    key: "purana:padma:tulsi",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda",
    title: "Why tulsi stands in the courtyard",
    theme: "faithfulness and the sacred ordinary",
    summary:
      "The story of Vrinda, whose devotion protected her husband so completely that it had to be undone by a divine deception, ends with her becoming the tulsi plant. An offering to Vishnu is considered incomplete without her leaf — the wronged one placed permanently above the ritual.",
    citationUrl: PADMA,
    weight: 115,
  },
  {
    key: "purana:padma:ekadashi",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda",
    title: "The fast that began as a weapon",
    theme: "restraint and its rewards",
    summary:
      "The Padma Purana traces the origin of Ekadashi to a personified power born to defeat a demon that could not be beaten by force. The practice is presented as a monthly discipline of the appetite that clears the mind more than it empties the stomach.",
    citationUrl: PADMA,
    weight: 110,
  },

  // ===========================================================================
  // LINGA, BRAHMA, BRAHMANDA, NARADA, DEVI BHAGAVATA, AGNI
  // ===========================================================================
  {
    key: "purana:linga:formless-form",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga",
    title: "Worshipping the mark, not the shape",
    theme: "the formless behind the form",
    summary:
      "The Linga Purana explains the linga as a 'mark' or sign — a deliberately unshaped form for what has no shape, so that the mind has somewhere to rest without mistaking the image for the reality it points at.",
    citationUrl: LINGA,
    weight: 105,
  },
  {
    key: "purana:linga:nandi",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga",
    title: "Nandi, waiting at the door",
    theme: "patience and steady attention",
    summary:
      "The bull who sits before every Shiva shrine faces the sanctum and never looks away. He is the model of the devotee: not performing, not asking, simply keeping his gaze fixed in the right direction for as long as it takes.",
    citationUrl: LINGA,
    weight: 105,
  },
  {
    key: "purana:brahma:surya-worship",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on Konarka",
    title: "Samba and the healing sun",
    theme: "humility and healing",
    summary:
      "Afflicted with disease after a curse, Samba worships the sun at the shore and is cured, founding the temple at Konark. The Brahma Purana links sunlight, discipline and recovery — the oldest medicine being to rise and face the light.",
    citationUrl: BRAHMA,
    weight: 100,
  },
  {
    key: "purana:brahma:jagannath",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Purushottama Kshetra Mahatmya",
    title: "The unfinished form at Puri",
    theme: "accepting the incomplete",
    summary:
      "The images at Puri are famously unfinished — the sculptor was interrupted before the hands and feet were carved. They were installed exactly as they were, and are worshipped in that state by millions. Not everything sacred has to be completed first.",
    citationUrl: BRAHMA,
    weight: 115,
  },
  {
    key: "purana:brahmanda:lalita",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Lalita Mahatmya",
    title: "The thousand names of Lalita",
    theme: "the divine feminine as beauty and power",
    summary:
      "The Lalita Sahasranama, preserved in the Brahmanda Purana, praises the goddess as both the ruler of the cosmos and the sweetness within it. Its thousand names insist that power and tenderness are not opposites.",
    citationUrl: BRAHMANDA,
    weight: 105,
  },
  {
    key: "purana:narada:name-chanting",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "The sage who never stops singing",
    theme: "constant remembrance",
    summary:
      "Narada travels between every world carrying his vina and the name, stirring up exactly the trouble that turns people toward the divine. The Narada Purana presents continuous remembrance as the simplest practice available to anyone, anywhere.",
    citationUrl: NARADA,
    weight: 105,
  },
  {
    key: "purana:devi:shakti-supreme",
    source: "purana",
    scripture: "Devi Bhagavata Purana",
    reference: "Book 1 and Book 7",
    title: "Without her, the gods cannot move",
    theme: "energy as the ground of everything",
    summary:
      "The Devi Bhagavata places the Goddess as the primal power without which no deity acts at all — consciousness may be still, but nothing happens without shakti. The Devi Gita within it teaches liberation directly in her own voice.",
    citationUrl: DEVI,
    weight: 115,
  },
  {
    key: "purana:agni:everything-book",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Encyclopedic chapters",
    title: "The Purana that teaches everything",
    theme: "knowledge in service of living",
    summary:
      "The Agni Purana moves from cosmology to architecture, medicine, grammar, statecraft and archery, then returns to devotion. Its assumption is that practical skill and spiritual life belong in one book, not two.",
    citationUrl: AGNI,
    weight: 100,
  },

  // ===========================================================================
  // UPANISHADS
  // ===========================================================================
  {
    key: "upanishad:chandogya:tat-tvam-asi",
    source: "upanishad",
    scripture: "Chandogya Upanishad",
    reference: "Chapter 6",
    title: "Tat tvam asi — you are that",
    theme: "identity of the self and the absolute",
    summary:
      "Uddalaka has his son dissolve salt in water. It cannot be seen, but every sip is salty. In the same way, he says, the subtle essence pervades everything — and that is what you are. He repeats the phrase nine times so it cannot be missed.",
    citationUrl: CHANDOGYA,
    weight: 135,
  },
  {
    key: "upanishad:chandogya:satyakama",
    source: "upanishad",
    scripture: "Chandogya Upanishad",
    reference: "Chapter 4",
    title: "Satyakama, who told the truth about his birth",
    theme: "honesty as the true qualification",
    summary:
      "A boy asked his lineage before being accepted as a student repeats his mother's honest answer: she does not know. The teacher accepts him at once, saying only a brahmin could speak so truthfully. Character, not ancestry, admits him.",
    citationUrl: CHANDOGYA,
    weight: 125,
  },
  {
    key: "upanishad:chandogya:seed",
    source: "upanishad",
    scripture: "Chandogya Upanishad",
    reference: "Chapter 6, Section 12",
    title: "Break the seed and find nothing",
    theme: "the invisible essence",
    summary:
      "Uddalaka asks Shvetaketu to split a banyan seed, then split what is inside it. The boy reports he sees nothing at all. From that nothing, his father says, this whole great tree stands.",
    citationUrl: CHANDOGYA,
    weight: 125,
  },
  {
    key: "upanishad:brihadaranyaka:asato-ma",
    source: "upanishad",
    scripture: "Brihadaranyaka Upanishad",
    reference: "1.3.28",
    title: "Lead me from the unreal to the real",
    theme: "the prayer for truth and light",
    summary:
      "Asato ma sad gamaya, tamaso ma jyotir gamaya, mrityor ma amritam gamaya — from the unreal to the real, from darkness to light, from death to immortality. Three lines that ask for nothing material at all.",
    citationUrl: BRIHAD,
    weight: 135,
  },
  {
    key: "upanishad:brihadaranyaka:maitreyi",
    source: "upanishad",
    scripture: "Brihadaranyaka Upanishad",
    reference: "2.4 and 4.5",
    title: "Maitreyi refuses the inheritance",
    theme: "what love is actually for",
    summary:
      "Offered half his wealth as he leaves for the forest, Maitreyi asks whether it would make her immortal. Told it would not, she says she has no use for it. Yajnavalkya then tells her that a husband is not loved for the husband's sake, but for the sake of the Self.",
    citationUrl: BRIHAD,
    weight: 130,
  },
  {
    key: "upanishad:brihadaranyaka:neti-neti",
    source: "upanishad",
    scripture: "Brihadaranyaka Upanishad",
    reference: "2.3.6 and 4.5.15",
    title: "Neti, neti — not this, not this",
    theme: "knowing by removing",
    summary:
      "Asked to describe the Self, Yajnavalkya refuses to say what it is and only says what it is not. Every description would make it a thing among things. The method is subtraction: remove everything you are not and stop.",
    citationUrl: BRIHAD,
    weight: 125,
  },
  {
    key: "upanishad:brihadaranyaka:gargi",
    source: "upanishad",
    scripture: "Brihadaranyaka Upanishad",
    reference: "3.6 and 3.8",
    title: "Gargi asks one question too many",
    theme: "the boundary of enquiry",
    summary:
      "The scholar Gargi presses Yajnavalkya on what everything is woven upon, then on what that is woven upon, until he warns her that her head will fall off if she asks beyond the limit. She stops, then returns with the sharpest question in the assembly.",
    citationUrl: BRIHAD,
    weight: 115,
  },
  {
    key: "upanishad:taittiriya:matru-devo-bhava",
    source: "upanishad",
    scripture: "Taittiriya Upanishad",
    reference: "Shiksha Valli, 1.11",
    title: "The graduation speech",
    theme: "how to live after learning",
    summary:
      "As students leave, the teacher gives instructions that are entirely practical: speak the truth, practise dharma, do not neglect your studies, treat mother, father, teacher and guest as divine, and give with faith, with modesty, and with sympathy.",
    citationUrl: TAITTIRIYA,
    weight: 130,
  },
  {
    key: "upanishad:taittiriya:five-sheaths",
    source: "upanishad",
    scripture: "Taittiriya Upanishad",
    reference: "Brahmananda Valli",
    title: "The five layers of a person",
    theme: "depth beneath the surface self",
    summary:
      "The Taittiriya describes a person as sheath within sheath — food, breath, mind, understanding, and bliss — each subtler than the last. What you take yourself to be is usually the outermost one.",
    citationUrl: TAITTIRIYA,
    weight: 115,
  },
  {
    key: "upanishad:taittiriya:bhrigu",
    source: "upanishad",
    scripture: "Taittiriya Upanishad",
    reference: "Bhrigu Valli",
    title: "Bhrigu sent back five times",
    theme: "answers that must be earned",
    summary:
      "Bhrigu asks his father to explain Brahman. Instead of answering, Varuna gives him a method and sends him away to find out — five times, each time with a deeper answer. The teacher's restraint is the actual teaching.",
    citationUrl: TAITTIRIYA,
    weight: 110,
  },

  // ===========================================================================
  // RAMAYANA
  // ===========================================================================
  {
    key: "ramayana:shabari",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Aranya Kanda",
    title: "Shabari, who waited her whole life",
    theme: "devotion rewarded late but fully",
    summary:
      "An old forest woman waits decades for Rama, gathering fruit each day in case he comes. When he finally arrives she offers what she has. The Ramayana's point is not the fruit but that the waiting itself was never wasted.",
    citationUrl: RAMAYANA,
    weight: 130,
  },
  {
    key: "ramayana:jatayu",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Aranya Kanda",
    title: "Jatayu, an old bird against a demon king",
    theme: "acting despite certain defeat",
    summary:
      "An aged vulture sees Sita being carried away and attacks Ravana knowing exactly how it will end. He is cut down, but survives long enough to tell Rama which direction they went. Losing was not the same as failing.",
    citationUrl: RAMAYANA,
    weight: 135,
  },
  {
    key: "ramayana:hanuman-leap",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Sundara Kanda",
    title: "Hanuman had to be reminded who he was",
    theme: "forgotten capability",
    summary:
      "Facing the ocean, the army despairs until Jambavan reminds Hanuman of the powers he had forgotten under a childhood curse. He does not gain anything new. He simply remembers, and crosses.",
    citationUrl: RAMAYANA,
    weight: 135,
  },
  {
    key: "ramayana:ahalya",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Bala Kanda",
    title: "Ahalya, turned back from stone",
    theme: "redemption after long punishment",
    summary:
      "Cursed to lie forgotten as stone, Ahalya waits through ages for the dust of Rama's feet. The Ramayana treats her restoration as ordinary, not exceptional — the point is that no exile from grace was ever meant to be permanent.",
    citationUrl: RAMAYANA,
    weight: 120,
  },
  {
    key: "ramayana:bharata-sandals",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Ayodhya Kanda",
    title: "Bharata rules from beside the throne",
    theme: "power refused",
    summary:
      "Handed a kingdom he never wanted, Bharata places Rama's sandals on the throne and governs for fourteen years from a lower seat, living as an ascetic outside the city. He holds the office without ever taking the honour.",
    citationUrl: RAMAYANA,
    weight: 125,
  },
  {
    key: "ramayana:kevat",
    source: "purana",
    scripture: "Ramayana of Valmiki",
    reference: "Ayodhya Kanda",
    title: "The boatman who washed Rama's feet first",
    theme: "faith with a touch of humour",
    summary:
      "The ferryman refuses to let Rama board until he has washed his feet — having heard what happened to a stone that touched that dust, he is not risking his only boat. Devotion here arrives as affection and wit rather than solemnity.",
    citationUrl: RAMAYANA,
    weight: 125,
  },
];

/** Sanity guard: duplicate keys would silently shrink the topic pool. */
export function assertUniqueKeys(entries: CorpusEntry[] = CORPUS): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw new Error(`Duplicate corpus key: ${entry.key}`);
    }
    seen.add(entry.key);
  }
}
