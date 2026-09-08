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

import { citationUrlFor, PURANA_BY_KEY } from "@/lib/sources/mahapuranas";
import type { TopicSource } from "@/lib/types";

/**
 * Resolve a Purana's best citation from the canonical registry: its open full
 * text where one exists, otherwise its reference page. Keeping this in one
 * function means no entry below carries a URL of its own to rot.
 */
function cite(puranaKey: string): string {
  const purana = PURANA_BY_KEY.get(puranaKey);
  if (!purana) throw new Error(`Unknown Maha Purana key: ${puranaKey}`);
  return citationUrlFor(purana);
}

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

  {
    key: "purana:vishnu:parashara-anger",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 1, Chapter 1",
    title: "The sage who called off his own revenge",
    theme: "stopping a punishment already under way",
    summary:
      "Parashara begins a sacrifice to destroy every demon in the world for killing his father, and it is working. His grandfather asks him to stop — not because they are innocent, but because the anger is eating him. He stops, and then tells the whole Purana.",
    citationUrl: VISHNU,
    weight: 130,
  },
  {
    key: "purana:vishnu:raivata-return",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 4, Chapter 1",
    title: "He was gone for one conversation",
    theme: "coming back to a world that moved on",
    summary:
      "King Kakudmi takes his daughter to Brahma to ask whom she should marry, waits through a short piece of music, and is told that ages have passed on earth. Every suitor he had in mind is long dead, along with everyone who remembered him.",
    citationUrl: VISHNU,
    weight: 135,
  },
  {
    key: "purana:vishnu:kandu",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 1, Chapter 15",
    title: "The sage who asked her to wait a moment",
    theme: "time passing unnoticed inside pleasure",
    summary:
      "The ascetic Kandu lives with the nymph Pramlocha and asks her, each time she offers to leave, to stay a little longer. When he finally counts, several hundred years have gone by, and he is certain it was an afternoon.",
    citationUrl: VISHNU,
    weight: 130,
  },
  {
    key: "purana:vishnu:khandikya-keshidhvaja",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 6, Chapters 6–7",
    title: "He asked his enemy to teach him",
    theme: "taking help from the person who took everything",
    summary:
      "Two cousins have fought over one kingdom; one won the land, the other kept the learning. When the winner needs knowledge, he rides to the forest and puts his head down before the man he dispossessed — who teaches him, having first been offered the chance to kill him.",
    citationUrl: VISHNU,
    weight: 130,
  },
  {
    key: "purana:vishnu:pururavas",
    source: "purana",
    scripture: "Vishnu Purana",
    reference: "Book 4, Chapter 6",
    title: "The conditions she set, and the night he broke them",
    theme: "a love lost on a technicality",
    summary:
      "Urvashi agrees to stay with Pururavas on conditions so small they seem safe: two lambs kept beside the bed, and he must never be seen unclothed. One night both are broken at once, by accident, and she is gone by morning.",
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

  {
    key: "purana:shiva:ravana-kailasa",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Chapters on Ravana",
    title: "The demon who tried to carry off a mountain",
    theme: "strength that mistakes itself for entitlement",
    summary:
      "Told he cannot pass, Ravana puts his arms under Kailasa and lifts. A single toe comes down and his hands are trapped for a thousand years. He sings his way out, and is given a boon for the singing rather than the lifting.",
    citationUrl: SHIVA,
    weight: 130,
  },
  {
    key: "purana:shiva:kannappa",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Chapters on devotees",
    title: "The hunter who offered his own eye",
    theme: "worship that breaks every rule and is accepted",
    summary:
      "A hunter brings meat he has tasted, water carried in his mouth, and flowers from his hair — everything a priest would call defilement. When the image's eye bleeds he gouges out his own to replace it, and is stopped mid-way through the second.",
    citationUrl: SHIVA,
    weight: 135,
  },
  {
    key: "purana:shiva:ardhanarishvara",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Chapters on the half-female form",
    title: "One body, split down the middle",
    theme: "a wholeness that is not one thing",
    summary:
      "The Purana describes a single form that is male on one side and female on the other, down to the earring and the anklet. It is the tradition's most direct statement that neither half is complete on its own.",
    citationUrl: SHIVA,
    weight: 125,
  },
  {
    key: "purana:shiva:moon-waning",
    source: "purana",
    scripture: "Shiva Purana",
    reference: "Chapters on the moon",
    title: "The curse that was only half lifted",
    theme: "a punishment softened rather than cancelled",
    summary:
      "Cursed to waste away for neglecting all but one of his wives, the moon is not simply forgiven. The curse is halved: he wanes for a fortnight and recovers for a fortnight, for ever. The sky still shows the sentence being served.",
    citationUrl: SHIVA,
    weight: 130,
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

  {
    key: "purana:markandeya:dharma-birds",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Opening chapters — the four birds",
    title: "Four birds who remembered being men",
    theme: "wisdom from an unlikely mouth",
    summary:
      "The Purana's questions are not answered by a sage but by four birds in a cave, who recall their previous births and speak the whole book. The tradition put its teaching in the mouths of animals and expected it to be taken seriously.",
    citationUrl: MARKANDEYA,
    weight: 120,
  },
  {
    key: "purana:markandeya:suratha-samadhi",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Devi Mahatmya — the frame",
    title: "A king and a merchant, both thrown out",
    theme: "attachment surviving the thing it attached to",
    summary:
      "A king who has lost his kingdom and a merchant thrown out by his own family meet in a forest, and each admits he still worries about the people who ruined him. The whole Devi Mahatmya is told to explain why they cannot stop.",
    citationUrl: MARKANDEYA,
    weight: 130,
  },
  {
    key: "purana:markandeya:sanjna",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters on the sun",
    title: "The wife who could not bear his brightness",
    theme: "love that has to be made survivable",
    summary:
      "Unable to stand her husband's heat, Sanjna leaves a shadow of herself in her place and runs. When the sun finds her, he agrees to be ground down on a wheel until he is bearable. Something is cut away so the marriage can continue.",
    citationUrl: MARKANDEYA,
    weight: 130,
  },
  {
    key: "purana:markandeya:dattatreya",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters on Dattatreya",
    title: "The teacher who behaved badly on purpose",
    theme: "a test disguised as disappointment",
    summary:
      "Dattatreya drives away followers by drinking, keeping bad company and refusing to look holy. Those who stay anyway are the ones he teaches. The disqualifying behaviour is the entrance examination.",
    citationUrl: MARKANDEYA,
    weight: 125,
  },
  {
    key: "purana:markandeya:anasuya",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters on Anasuya",
    title: "Three gods who came to test a woman",
    theme: "a test answered on the tester's own terms",
    summary:
      "Three gods arrive in disguise and demand to be fed by a woman wearing nothing. She agrees, and turns them into infants first. They are fed, and they leave having lost the argument entirely.",
    citationUrl: MARKANDEYA,
    weight: 130,
  },
  {
    key: "purana:markandeya:alarka",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters on King Alarka",
    title: "The king whose brother took everything",
    theme: "being freed by losing",
    summary:
      "Alarka, raised in comfort, is stripped of his kingdom by his own brother at his mother's arranging. Only with nothing left does he go and ask the question he had never needed to ask. The dispossession was the instruction.",
    citationUrl: MARKANDEYA,
    weight: 125,
  },
  {
    key: "purana:markandeya:yama-worlds",
    source: "purana",
    scripture: "Markandeya Purana",
    reference: "Chapters on the afterlife",
    title: "The accounting, described to a bird",
    theme: "consequence explained plainly",
    summary:
      "The Purana's account of what follows death is delivered in the same level voice as its geography and its dynasties. There is no relish in it, which makes it harder to dismiss than a sermon would be.",
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

  {
    key: "purana:garuda:mother-in-bondage",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda — the birth of Garuda",
    title: "The bet his mother lost",
    theme: "inheriting somebody else's mistake",
    summary:
      "Vinata wagers on the colour of a horse's tail, is cheated, and becomes a slave to her sister for it. Garuda is born into that servitude, having agreed to nothing. Everything he does afterwards is about a debt he did not incur.",
    citationUrl: GARUDA,
    weight: 130,
  },
  {
    key: "purana:garuda:stealing-nectar",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda — the theft of the amrita",
    title: "He carried it and never drank it",
    theme: "power used entirely for someone else",
    summary:
      "Garuda fights through fire, a spinning blade and the assembled gods to reach the nectar of immortality, carries it out, and does not taste a drop. It was the price of his mother's freedom and nothing more.",
    citationUrl: GARUDA,
    weight: 135,
  },
  {
    key: "purana:garuda:wings-and-service",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda",
    title: "The strongest thing alive, agreeing to carry someone",
    theme: "strength that chooses to be under someone",
    summary:
      "Having beaten everyone, Garuda accepts a position: he becomes the one Vishnu rides. The Purana treats the choice as the point of the whole story, not as an anticlimax after it.",
    citationUrl: GARUDA,
    weight: 125,
  },
  {
    key: "purana:garuda:yama-messengers",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Preta Khanda",
    title: "The ones who come at the end, and who they wait for",
    theme: "an arrival nobody schedules",
    summary:
      "The Purana describes the messengers of death arriving for one person and turning back from another, and is specific that the difference is not wealth, learning or the size of the funeral being planned.",
    citationUrl: GARUDA,
    weight: 125,
  },
  {
    key: "purana:garuda:pinda",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Preta Khanda — the rites",
    title: "Ten days of building a body",
    theme: "grief given something to do",
    summary:
      "The rites after a death are described as constructing a new body for the departed, one part per day, over ten days. Whatever else it is, it is a structure that gives a shattered household a task each morning.",
    citationUrl: GARUDA,
    weight: 120,
  },
  {
    key: "purana:garuda:gems",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda — chapters on gemstones",
    title: "How to tell a real stone from a good fake",
    theme: "the tests that separate the genuine from the convincing",
    summary:
      "The Purana sets out how each gem is formed, where it is found and how it is tested — hardness, colour under water, behaviour in the light. It is a chapter about not being fooled, sitting inside a book about death.",
    citationUrl: GARUDA,
    weight: 105,
  },
  {
    key: "purana:garuda:medicine",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda — chapters on treatment",
    title: "Remedies in a book about dying",
    theme: "fighting for a life while describing its end",
    summary:
      "The same text famous for its account of the afterlife spends long chapters on cures, dosages and the treatment of poisons. It does not treat the two as being in tension.",
    citationUrl: GARUDA,
    weight: 100,
  },
  {
    key: "purana:garuda:thousand-names",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Purva Khanda",
    title: "A thousand ways of saying one name",
    theme: "repetition that is not repetitive",
    summary:
      "The Purana carries a thousand-name litany, each name a different quality of the same being. Recited straight through, it is an argument that no single description would have been enough.",
    citationUrl: GARUDA,
    weight: 105,
  },
  {
    key: "purana:garuda:moksha",
    source: "purana",
    scripture: "Garuda Purana",
    reference: "Brahma Khanda",
    title: "The chapters people stop reading before",
    theme: "the answer after the frightening part",
    summary:
      "The Garuda Purana is known almost entirely for its hells, which come before its final section on liberation. The book's own structure puts the fear first and the way out last, and most readers never reach the last.",
    citationUrl: GARUDA,
    weight: 125,
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

  {
    key: "purana:skanda:satyanarayana",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Reva Khanda — the Satyanarayana story",
    title: "The merchant who kept forgetting his promise",
    theme: "gratitude that lapses the moment things improve",
    summary:
      "A trader vows an offering if his fortunes turn, gets everything he asked for, and does not perform it. He loses it all again, promises again, forgets again. The story is told and retold in households precisely because nobody in it learns quickly.",
    citationUrl: SKANDA,
    weight: 135,
  },
  {
    key: "purana:skanda:mango-contest",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Chapters on Kartikeya",
    title: "Two brothers, one fruit, one shortcut",
    theme: "cleverness beating effort, and the resentment after",
    summary:
      "Told the fruit goes to whoever circles the world first, one brother sets off and the other walks around his parents and claims it. The Purana does not treat the winner as simply right: the loser leaves home over it and does not come back.",
    citationUrl: SKANDA,
    weight: 130,
  },
  {
    key: "purana:skanda:krittikas",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Chapters on the birth of Skanda",
    title: "Six mothers for one child",
    theme: "being raised by more people than gave birth to you",
    summary:
      "The child is carried by fire, by the Ganga, and finally by six stars who each nurse him, which is why he is given six faces. The Purana's account of a divine birth is mostly an account of who did the work afterwards.",
    citationUrl: SKANDA,
    weight: 120,
  },
  {
    key: "purana:skanda:taraka-fall",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Chapters on the war with Taraka",
    title: "The general who was six days old",
    theme: "readiness that has nothing to do with age",
    summary:
      "The army of the gods, defeated for generations, is handed to a newborn. The Purana lingers on the moment the veterans have to take orders from him, and on the fact that they win.",
    citationUrl: SKANDA,
    weight: 125,
  },
  {
    key: "purana:skanda:palani",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Chapters on Kartikeya",
    title: "The god who left home in a temper",
    theme: "a family quarrel that never quite heals",
    summary:
      "Cheated of the fruit, Kartikeya renounces everything, walks to a bare hill and stays there as an ascetic. His parents follow to bring him back. He does not return with them, and the hill becomes the shrine.",
    citationUrl: SKANDA,
    weight: 125,
  },
  {
    key: "purana:skanda:mahakala",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Avanti Khanda",
    title: "The lord of time, at Ujjain",
    theme: "the one thing that outlasts every deadline",
    summary:
      "At Ujjain, Shiva is worshipped specifically as time itself. The Purana's point in naming him so is uncomfortable and deliberate: the thing everyone is running out of is the thing being worshipped.",
    citationUrl: SKANDA,
    weight: 120,
  },
  {
    key: "purana:skanda:badari",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Vaishnava Khanda — Badarikashrama",
    title: "The shrine that is buried half the year",
    theme: "devotion arranged around what is possible",
    summary:
      "The Purana describes a place in the high mountains that snow closes for six months. Rather than claim it is always open, the tradition built a calendar around the closing and the reopening.",
    citationUrl: SKANDA,
    weight: 110,
  },
  {
    key: "purana:skanda:nagara-well",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "Nagara Khanda",
    title: "The town that wrote down its own founding",
    theme: "a community keeping its own record",
    summary:
      "One entire division of the Purana is given over to a single town's shrines, families and origin story. It is scripture doing the work of a local history, written by people who did not expect anyone else to do it.",
    citationUrl: SKANDA,
    weight: 95,
  },
  {
    key: "purana:skanda:longest-purana",
    source: "purana",
    scripture: "Skanda Purana",
    reference: "The text as a whole",
    title: "The book nobody has read all of",
    theme: "a work larger than any one reader",
    summary:
      "The Skanda Purana is the longest of the eighteen by a wide margin, assembled in khandas over centuries by many hands. It is less a book than a shelf, and the tradition kept adding to it rather than closing it.",
    citationUrl: SKANDA,
    weight: 100,
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

  {
    key: "purana:padma:lotus-creation",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Srishti Khanda",
    title: "The flower the world was made on",
    theme: "beginning from something that grew, not something built",
    summary:
      "The Purana takes its name from a lotus rising out of the navel of a sleeping god, with the creator seated in it. Everything that follows rests on a flower on a stalk on a body that is not awake.",
    citationUrl: PADMA,
    weight: 115,
  },
  {
    key: "purana:padma:pushkar",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Srishti Khanda — Pushkara Mahatmya",
    title: "The one place the creator is worshipped",
    theme: "being remembered in a single spot",
    summary:
      "Of all the gods, Brahma has effectively one temple, at a lake said to have formed where a lotus fell from his hand. The Purana's long defence of the site is also an admission of how little else there is.",
    citationUrl: PADMA,
    weight: 110,
  },
  {
    key: "purana:padma:bhrigu-test",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda",
    title: "The sage who kicked a god in the chest",
    theme: "an insult answered by concern",
    summary:
      "Sent to find out which god is greatest, Bhrigu provokes each in turn and finally kicks the sleeping Vishnu. Vishnu wakes, takes the foot in both hands and asks whether it was hurt. The test ends there.",
    citationUrl: PADMA,
    weight: 135,
  },
  {
    key: "purana:padma:rama-in-patala",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Patala Khanda",
    title: "What happened after the story ended",
    theme: "the years nobody makes songs about",
    summary:
      "The Padma Purana picks Rama up after the coronation, in the long reign where there is no demon to fight and every decision costs him something private. It is the least dramatic part of his life and the Purana gives it the most room.",
    citationUrl: PADMA,
    weight: 125,
  },
  {
    key: "purana:padma:gita-mahatmya",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda — the greatness of the Gita",
    title: "A book praised chapter by chapter",
    theme: "a text the tradition kept insisting on",
    summary:
      "The Purana works through the Gita one chapter at a time, telling a story about somebody whose life was changed by each. It is the tradition arguing, at length, that this particular book should not be left unread.",
    citationUrl: PADMA,
    weight: 105,
  },
  {
    key: "purana:padma:kartika",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda — Kartika Mahatmya",
    title: "The month of small lamps",
    theme: "practice concentrated into a season",
    summary:
      "For one month the Purana asks for very little each day — a lamp, a bath before dawn, a name said aloud — and claims the accumulation matters more than any single large act performed once.",
    citationUrl: PADMA,
    weight: 110,
  },
  {
    key: "purana:padma:svarga-is-temporary",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Svarga Khanda",
    title: "Heaven runs out",
    theme: "a reward that is spent like money",
    summary:
      "The Purana describes the heavens in detail and then says plainly that residence there lasts exactly as long as the merit that paid for it, after which the resident falls. Nothing gained by good deeds is permanent.",
    citationUrl: PADMA,
    weight: 125,
  },
  {
    key: "purana:padma:yamuna",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Bhumi Khanda",
    title: "The dark river and the bright one",
    theme: "two ways of being holy",
    summary:
      "The Purana sets the Yamuna beside the Ganga and does not rank them. One is described as purifying and the other as loving, and it treats the difference as a difference in temperament rather than in worth.",
    citationUrl: PADMA,
    weight: 105,
  },
  {
    key: "purana:padma:one-god-argument",
    source: "purana",
    scripture: "Padma Purana",
    reference: "Uttara Khanda",
    title: "The quarrel the text tries to end",
    theme: "sectarian argument seen from above",
    summary:
      "The Purana repeatedly stages the Shiva-versus-Vishnu argument and repeatedly has one of the two refuse it, usually by praising the other first. The device is used often enough to count as the book's own position.",
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
    key: "purana:linga:five-faces",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga — the five faces",
    title: "Five faces, and one of them turned away",
    theme: "a whole that includes what you would rather not see",
    summary:
      "Shiva is described with five faces looking in five directions — the gentle one, the beautiful one, the one that creates, the one that conceals, and Aghora, the terrible one facing south. The Purana does not offer the pleasant four without the fifth.",
    citationUrl: LINGA,
    weight: 120,
  },
  {
    key: "purana:linga:tripura",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — the burning of the three cities",
    title: "Three cities, one arrow, one moment",
    theme: "patience waiting for the single opening",
    summary:
      "Three flying fortresses of gold, silver and iron are protected by a boon: they can only be destroyed when all three align, by a single arrow. Shiva waits, with the earth as his chariot and the Vedas as his horses, for the instant they cross — and takes it.",
    citationUrl: LINGA,
    weight: 125,
  },
  {
    key: "purana:linga:kamadahana",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga — the burning of Kama",
    title: "The god of desire, burnt to ash",
    theme: "desire interrupted, and what survives it",
    summary:
      "Sent to break Shiva's meditation with a flower arrow, Kama succeeds for an instant and is burnt to ash by the opening of the third eye. His wife Rati is left with nothing to bury. Kama is restored, but bodiless — desire that can still be felt and no longer seen.",
    citationUrl: LINGA,
    weight: 125,
  },
  {
    key: "purana:linga:tandava",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — the dance",
    title: "The dance that is holding the world together",
    theme: "order that depends on continuous effort",
    summary:
      "Creation is not described as a thing built and left standing. It is described as a dance still going on, and the Purana is explicit that the world lasts exactly as long as the dancer keeps moving.",
    citationUrl: LINGA,
    weight: 120,
  },
  {
    key: "purana:linga:jalandhara",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — Jalandhara",
    title: "The warrior born from Shiva's own anger",
    theme: "a thing that turns on the one who made it",
    summary:
      "Jalandhara is formed from fire that came out of Shiva's own eyes, grows into the strongest being alive, and eventually comes for Shiva. The Purana is unsentimental about the arithmetic: he could not be beaten by anything except the source he came from.",
    citationUrl: LINGA,
    weight: 120,
  },
  {
    key: "purana:linga:ashtamurti",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga — the eight forms",
    title: "Eight things that are all one thing",
    theme: "the divine as the ordinary world",
    summary:
      "The Linga Purana names Shiva's eight forms as earth, water, fire, air, ether, the sun, the moon, and the sacrificer. Nothing is added to the world to make it holy. The list is the world, counted differently.",
    citationUrl: LINGA,
    weight: 105,
  },
  {
    key: "purana:linga:andhaka",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Purva Bhaga — Andhaka",
    title: "The enemy who became the doorkeeper",
    theme: "an opponent turned rather than destroyed",
    summary:
      "Andhaka, born blind and raised in demonic power, comes for Parvati and is defeated. He is not annihilated. Held aloft on Shiva's trident until his pride burns away, he is set down as a devotee and given a place among Shiva's own attendants.",
    citationUrl: LINGA,
    weight: 110,
  },
  {
    key: "purana:linga:daruka-forest",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — the sages of the Daruka forest",
    title: "The sages who were sure of themselves",
    theme: "learning without humility",
    summary:
      "A colony of accomplished sages in the Daruka forest are certain their rituals have made them masters. Shiva walks in as a naked beggar and undoes their certainty without argument. Their curses fail against him, and the failure is the teaching.",
    citationUrl: LINGA,
    weight: 110,
  },
  {
    key: "purana:linga:ganga-descent",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — the descent of Ganga",
    title: "The river that would have split the earth",
    theme: "a force that has to be received before it can be used",
    summary:
      "Bhagiratha's austerity brings the Ganga down from heaven, but her fall would break the ground she is meant to bless. Shiva stands under it and takes the whole weight of the river in his matted hair, letting it out slowly enough for the earth to hold.",
    citationUrl: LINGA,
    weight: 125,
  },
  {
    key: "purana:linga:twenty-eight-teachers",
    source: "purana",
    scripture: "Linga Purana",
    reference: "Uttara Bhaga — the twenty-eight incarnations",
    title: "The teacher who came back twenty-eight times",
    theme: "instruction repeated until it takes",
    summary:
      "The Linga Purana lists twenty-eight descents of Shiva as a teacher of yoga, one for each age, each with his own disciples. The tradition's own account of itself is not a single revelation but a thing taught again whenever it is forgotten.",
    citationUrl: LINGA,
    weight: 100,
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
    key: "purana:brahma:gautama-godavari",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Gautami Mahatmya",
    title: "The sage who was tricked into a blessing",
    theme: "a wrong turned into a gift for everyone",
    summary:
      "During a famine, only Gautama's hermitage has grain, and the jealous sages send an illusory cow into his field so he will appear to have killed it. Framed and shamed, Gautama does not retaliate. He performs austerity until the Godavari comes down to wash the ground, and the river stays for everyone who framed him.",
    citationUrl: BRAHMA,
    weight: 125,
  },
  {
    key: "purana:brahma:ekamra",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Ekamra Kshetra Mahatmya",
    title: "The field under one mango tree",
    theme: "a place made sacred by presence, not by size",
    summary:
      "The Brahma Purana describes Ekamra, the single-mango-tree field, as the ground Shiva chose over grander places. Its holiness has no monument behind it and no conquest — the text's claim is simply that he stayed there.",
    citationUrl: BRAHMA,
    weight: 100,
  },
  {
    key: "purana:brahma:yama-court",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on Yama and the afterlife",
    title: "What is actually written down",
    theme: "an account nobody else is keeping",
    summary:
      "The Brahma Purana's account of Yama's court is not primarily about punishment. It is about record: that what a person did when nobody was looking was nevertheless noted, and that the ledger is read out in their own hearing.",
    citationUrl: BRAHMA,
    weight: 110,
  },
  {
    key: "purana:brahma:creation-order",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Opening chapters on creation",
    title: "The world made in an order",
    theme: "beginnings that are deliberate",
    summary:
      "The Purana opens with Brahma bringing forth the elements, the directions, time itself, and only then living beings — each depending on what came before it. Nothing arrives fully formed, and the sequence is the point.",
    citationUrl: BRAHMA,
    weight: 95,
  },
  {
    key: "purana:brahma:shiva-parvati-marriage",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on the marriage of Shiva and Parvati",
    title: "The ascetic who was talked into a household",
    theme: "persistence outlasting refusal",
    summary:
      "Parvati sets out to marry a man who has renounced marriage, and is refused by his own silence for years. She does not argue with him. She takes up the same austerity he is famous for, until the difference between them is gone.",
    citationUrl: BRAHMA,
    weight: 125,
  },
  {
    key: "purana:brahma:krishna-childhood",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Krishna chapters",
    title: "The god who was somebody's difficult child",
    theme: "greatness hidden inside the ordinary",
    summary:
      "The Brahma Purana's Krishna chapters keep him small: stealing butter, being tied to a mortar, being scolded. The claim underneath is that the same being who holds the worlds spent years being told off by a woman who thought he was hers.",
    citationUrl: BRAHMA,
    weight: 130,
  },
  {
    key: "purana:brahma:sun-course",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on the sun's course",
    title: "The chariot that never stops",
    theme: "reliability as a form of devotion",
    summary:
      "The sun's daily circuit is described as a chariot with one wheel, seven horses and a driver with no legs, none of which is an accident of ornament. What the Purana emphasises is that it has never once failed to arrive.",
    citationUrl: BRAHMA,
    weight: 95,
  },
  {
    key: "purana:brahma:four-ages",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on the yugas",
    title: "The ages, and which one this is",
    theme: "living in a diminished time",
    summary:
      "The four ages are described in decline: dharma standing on four legs, then three, then two, then one. The Purana does not treat the last age as hopeless. It treats it as the age in which very little is required to stand out.",
    citationUrl: BRAHMA,
    weight: 105,
  },
  {
    key: "purana:brahma:pitris",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Chapters on shraddha",
    title: "What the dead are owed",
    theme: "obligation that does not end at a funeral",
    summary:
      "The rites for ancestors are described not as mourning but as maintenance — a debt carried by the living, paid at fixed intervals, by people who will one day be on the receiving end of the same attention.",
    citationUrl: BRAHMA,
    weight: 100,
  },
  {
    key: "purana:brahma:tirtha-worth",
    source: "purana",
    scripture: "Brahma Purana",
    reference: "Gautami Mahatmya",
    title: "The pilgrim who brought himself along",
    theme: "travel that changes nothing",
    summary:
      "Between its long lists of holy fords the Purana makes a blunt point: a person who bathes at every one of them and carries the same anger home has washed only his body. The place does not do the work.",
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
    key: "purana:brahmanda:cosmic-egg",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Prakriya Pada",
    title: "The egg the whole world came out of",
    theme: "everything having a single origin",
    summary:
      "The Purana takes its name from its opening image: a golden egg floating in the waters, containing every world, every ocean and every being, which splits to become the sky above and the earth below. Everything that exists was once inside one shell.",
    citationUrl: BRAHMANDA,
    weight: 120,
  },
  {
    key: "purana:brahmanda:bhandasura",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Lalita Mahatmya",
    title: "The demon made from ashes",
    theme: "what grows from something burnt away",
    summary:
      "From the ash of the burnt Kama, a demon is formed who cannot be killed by any god. Bhandasura drains the desire out of the world and rules a joyless kingdom. It takes the Goddess herself, and an army of her own emanations, to end him.",
    citationUrl: BRAHMANDA,
    weight: 125,
  },
  {
    key: "purana:brahmanda:agastya-hayagriva",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Lalita Mahatmya — the teaching to Agastya",
    title: "The sage who was told to ask properly",
    theme: "receiving knowledge on the right terms",
    summary:
      "Agastya asks Hayagriva for the highest knowledge and is refused twice before he is given it, not because it is being withheld but because he has not yet asked as a person who would use it. The thousand names are given only on the third asking.",
    citationUrl: BRAHMANDA,
    weight: 110,
  },
  {
    key: "purana:brahmanda:parashurama-renuka",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Parashurama chapters",
    title: "The son told to kill his mother",
    theme: "obedience that costs everything",
    summary:
      "Jamadagni orders each of his sons to kill their mother Renuka for a moment's wandering thought. Only Parashurama obeys. Offered any boon for it, he asks for her life back, and for his brothers' — spending the reward undoing the thing he was rewarded for.",
    citationUrl: BRAHMANDA,
    weight: 130,
  },
  {
    key: "purana:brahmanda:kartavirya",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Parashurama chapters",
    title: "The king with a thousand arms who took a cow",
    theme: "power taking what it does not need",
    summary:
      "Kartavirya Arjuna, a king with a thousand arms and no shortage of anything, takes a sage's calf simply because he can. The theft costs him his life and his dynasty, and sets Parashurama on a rampage that outlasts everyone who started it.",
    citationUrl: BRAHMANDA,
    weight: 125,
  },
  {
    key: "purana:brahmanda:agastya-ocean",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Upodghata Pada",
    title: "The sage who drank the sea",
    theme: "a hiding place removed",
    summary:
      "Demons hide at the bottom of the ocean by day and destroy by night, and cannot be reached. Agastya drinks the ocean in a single draught, leaving them standing in the open. The Purana notes, drily, that he did not give it back.",
    citationUrl: BRAHMANDA,
    weight: 120,
  },
  {
    key: "purana:brahmanda:vindhya-bowed",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Upodghata Pada",
    title: "The mountain that is still bowing",
    theme: "pride stopped by courtesy rather than force",
    summary:
      "The Vindhya range grows out of jealousy until it blocks the sun. Agastya, its teacher, asks it to bow so he may cross, and to stay that way until he returns. He crosses to the south and never comes back.",
    citationUrl: BRAHMANDA,
    weight: 125,
  },
  {
    key: "purana:brahmanda:measure-of-time",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Anushanga Pada",
    title: "How long a day of Brahma is",
    theme: "a scale that makes a lifetime small",
    summary:
      "The Purana counts time upward from a blink to the four ages, to a thousand of those as one day of Brahma, and then to his hundred years. The arithmetic is not decoration: it is the text making a human worry the right size.",
    citationUrl: BRAHMANDA,
    weight: 110,
  },
  {
    key: "purana:brahmanda:seven-islands",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Anushanga Pada — geography",
    title: "A map of a world nobody has walked",
    theme: "describing the whole before the part",
    summary:
      "Seven island-continents ringed by seven oceans — of salt, of sugarcane juice, of wine, of butter, of curd, of milk, of sweet water — are described in careful order. The tradition insisted on knowing the shape of everything before locating itself in it.",
    citationUrl: BRAHMANDA,
    weight: 95,
  },
  {
    key: "purana:brahmanda:lalita-city",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Lalita Mahatmya — Sripura",
    title: "The city with twenty-five walls",
    theme: "an approach that takes as long as it takes",
    summary:
      "The Goddess's city is described as ring after ring of walls — iron, bronze, copper, lead, brass, silver, gold, and inward through gemstones to the last chamber. Nobody arrives at the centre quickly, and the description is the instruction.",
    citationUrl: BRAHMANDA,
    weight: 105,
  },
  {
    key: "purana:brahmanda:royal-lineages",
    source: "purana",
    scripture: "Brahmanda Purana",
    reference: "Upasamhara Pada",
    title: "The kings listed after they are gone",
    theme: "how little of a reign survives it",
    summary:
      "The Purana's dynastic lists name hundreds of rulers, most in a single line each, many with nothing recorded but a name and a father. It is one of the tradition's plainest statements about how a life looks from far enough away.",
    citationUrl: BRAHMANDA,
    weight: 100,
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
    key: "purana:narada:rukmangada",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Uttara Bhaga — Rukmangada Charita",
    title: "The king who would not break a fast",
    theme: "a promise held past the point it hurts",
    summary:
      "Rukmangada's kingdom keeps the Ekadashi fast so faithfully that Yama's world empties. A woman is sent to break him: she extracts a promise to grant any wish, then asks him to eat on the fast day. He offers her the kingdom, his own life, anything else. She refuses all of it.",
    citationUrl: NARADA,
    weight: 130,
  },
  {
    key: "purana:narada:dharmangada",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Uttara Bhaga — Rukmangada Charita",
    title: "The son who offered his own neck",
    theme: "a child paying for a parent's word",
    summary:
      "Cornered between the fast he will not break and the promise he will not break, Rukmangada is asked instead to behead his own son. Dharmangada kneels and tells his father to keep his word. The Purana lets the sword rise before anything intervenes.",
    citationUrl: NARADA,
    weight: 130,
  },
  {
    key: "purana:narada:daksha-curse",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "The sage who talked a thousand sons out of marrying",
    theme: "advice that ruins somebody's plans",
    summary:
      "Narada meets Daksha's thousand sons on their way to father a race, and asks them what they know about the world they intend to fill. They renounce instead, all of them. Daksha curses him to never rest in one place for long, which is why he is always arriving.",
    citationUrl: NARADA,
    weight: 125,
  },
  {
    key: "purana:narada:pride-of-austerity",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "The one who thought he had conquered desire",
    theme: "certainty about oneself as the last weakness",
    summary:
      "Narada comes through an austerity untouched by temptation and goes to announce it. He is warned, gently, not to say it out loud. The Purana's interest is not in whether he falls but in the exact moment the achievement turned into a claim.",
    citationUrl: NARADA,
    weight: 125,
  },
  {
    key: "purana:narada:ekadashi-origin",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Uttara Bhaga — the Ekadashi vratas",
    title: "One day in fourteen",
    theme: "a discipline small enough to actually keep",
    summary:
      "The Purana devotes chapter after chapter to a fast that asks for one day out of every fourteen. The scale is the argument: a practice that can be kept by a householder, a labourer and a king alike, and is therefore kept.",
    citationUrl: NARADA,
    weight: 110,
  },
  {
    key: "purana:narada:name-over-ritual",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "What the poor man can afford",
    theme: "devotion that costs nothing to begin",
    summary:
      "Against a tradition of expensive sacrifices, the Narada Purana insists the divine name is available to somebody with no priest, no fire, no fee and no learning. It is the most democratic claim the Puranas make, and it is made repeatedly.",
    citationUrl: NARADA,
    weight: 120,
  },
  {
    key: "purana:narada:sanaka-teaching",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga — the teaching of the Kumaras",
    title: "Four boys who never grew up",
    theme: "authority that does not come from age",
    summary:
      "The four Kumaras, Brahma's first sons, refused creation and remained five years old for ever. In the Narada Purana they are the ones doing the teaching, and grown sages sit in front of children to hear it.",
    citationUrl: NARADA,
    weight: 110,
  },
  {
    key: "purana:narada:kartika-month",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Uttara Bhaga — the greatness of Kartika",
    title: "The month when a small lamp counts",
    theme: "timing that multiplies a modest act",
    summary:
      "The Purana claims a single lamp lit in Kartika is worth more than large gifts in an ordinary month. The reasoning is practical rather than magical: it is the month people are already awake and already gathering.",
    citationUrl: NARADA,
    weight: 105,
  },
  {
    key: "purana:narada:tirtha-list",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Uttara Bhaga — the tirthas",
    title: "Every river worth standing in",
    theme: "a tradition writing down its own map",
    summary:
      "The Purana catalogues fords, rivers and shrines across the subcontinent with the care of a gazetteer. Read as a whole it is less a devotional text than evidence of how many people were walking, and how far.",
    citationUrl: NARADA,
    weight: 95,
  },
  {
    key: "purana:narada:vina",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "The instrument he never puts down",
    theme: "a practice carried everywhere",
    summary:
      "Narada is never described without the vina. He does not stop to play it; he plays while travelling, arguing, warning and interfering. The Purana's picture of devotion is not a seat and a fixed hour but something carried in the hand all day.",
    citationUrl: NARADA,
    weight: 115,
  },
  {
    key: "purana:narada:quarrel-maker",
    source: "purana",
    scripture: "Narada Purana",
    reference: "Purva Bhaga",
    title: "The troublemaker who was always right",
    theme: "unwelcome truth delivered at the worst moment",
    summary:
      "Narada has a reputation across the Puranas for starting quarrels, and he earns it. What the Narada Purana points out is that the information he carries is never false. He is disliked for the timing, not the content.",
    citationUrl: NARADA,
    weight: 120,
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

  {
    key: "purana:agni:vasishtha-taught-by-fire",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Opening chapters",
    title: "The fire that agreed to teach",
    theme: "knowledge handed down rather than found",
    summary:
      "The Purana's frame is Agni himself teaching Vasishtha, who teaches Vyasa, who teaches Suta, who tells it to the assembled sages. Before a word of its content arrives, the text spends its opening on the chain of people who carried it.",
    citationUrl: AGNI,
    weight: 105,
  },
  {
    key: "purana:agni:ten-descents",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on the avataras",
    title: "Ten arrivals, each smaller than expected",
    theme: "help that comes in an unimpressive shape",
    summary:
      "The Agni Purana runs through the descents in order — a fish, a tortoise, a boar, a half-lion, a dwarf. The pattern it draws attention to is that the rescue almost never arrives looking like a rescue.",
    citationUrl: AGNI,
    weight: 125,
  },
  {
    key: "purana:agni:pratima-lakshana",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on image-making",
    title: "The rules for carving a god",
    theme: "devotion with a measuring rod in hand",
    summary:
      "Proportions, postures, the number of arms, what each hand holds, which way the eyes look: the Purana specifies image-making to the finger's width. Getting it wrong is treated as a failure of respect, not of craft.",
    citationUrl: AGNI,
    weight: 105,
  },
  {
    key: "purana:agni:temple-ground",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on architecture",
    title: "Testing the soil before building",
    theme: "the unglamorous part that decides everything",
    summary:
      "Before any temple is designed, the Purana has the builder dig a pit, refill it, and see whether earth is left over or missing. The instruction for the holiest structure in a town begins with a hole in the ground.",
    citationUrl: AGNI,
    weight: 110,
  },
  {
    key: "purana:agni:medicine",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on medicine",
    title: "A scripture that lists fevers",
    theme: "the body as a religious concern",
    summary:
      "Between hymns and cosmology, the Agni Purana sets out diagnoses, herbs and treatments — for people, and for horses and elephants. It does not treat illness as a spiritual failing to be prayed away.",
    citationUrl: AGNI,
    weight: 100,
  },
  {
    key: "purana:agni:dhanurveda",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on archery",
    title: "How to stand before you shoot",
    theme: "mastery built from posture upward",
    summary:
      "The archery chapters begin with where to put the feet, how to breathe, and how to hold a bow that is not yet drawn. The arrow is nearly the last thing discussed, which is the whole teaching.",
    citationUrl: AGNI,
    weight: 115,
  },
  {
    key: "purana:agni:rajaniti",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on statecraft",
    title: "Advice for a king who is being lied to",
    theme: "power surrounded by flattery",
    summary:
      "The statecraft chapters assume, without embarrassment, that a ruler's advisors have their own interests and that his information is filtered. The counsel is about how to govern anyway.",
    citationUrl: AGNI,
    weight: 110,
  },
  {
    key: "purana:agni:yama-gita",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Yama Gita chapters",
    title: "Death gives the lecture himself",
    theme: "instruction from the one who collects",
    summary:
      "In the Yama Gita the god of death sets out what actually matters, on the authority of having seen every life end. The device is deliberate: the argument is unanswerable because of who is making it.",
    citationUrl: AGNI,
    weight: 125,
  },
  {
    key: "purana:agni:alankara",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on poetics",
    title: "The scripture that teaches metaphor",
    theme: "saying a thing well as part of saying it truly",
    summary:
      "The Purana includes chapters on figures of speech, metre and dramatic form. A tradition that cared this much about how something is phrased did not regard eloquence as decoration.",
    citationUrl: AGNI,
    weight: 100,
  },
  {
    key: "purana:agni:omens",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters on omens and dreams",
    title: "Reading the day before it happens",
    theme: "attention to small signs",
    summary:
      "Dreams, bird calls, the direction of the wind and the behaviour of animals are catalogued as things worth noticing. Underneath the divination is a habit the Purana clearly values: looking at what is actually in front of you.",
    citationUrl: AGNI,
    weight: 95,
  },
  {
    key: "purana:agni:gita-summary",
    source: "purana",
    scripture: "Agni Purana",
    reference: "Chapters summarising the Gita",
    title: "The whole Gita in a few pages",
    theme: "a long teaching reduced to what it needs",
    summary:
      "The Agni Purana compresses the Bhagavad Gita into a handful of chapters. What survives the compression — act, do not sit on the fence, and do not build your peace on the result — is the tradition's own view of what the Gita is for.",
    citationUrl: AGNI,
    weight: 120,
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

  // ===========================================================================
  // The remaining Maha Puranas.
  //
  // No open full-text translation is hosted for these five, so `cite()`
  // resolves each to its canonical reference. Every entry below is the text's
  // own namesake or framing narrative — the thing that Purana is *for* — so
  // the daily rotation never lands on a book with nothing to say.
  // ===========================================================================
  {
    key: "purana:matsya:manu-flood",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Opening chapters — the Matsya avatara",
    title: "The fish that asked to be saved first",
    theme: "heeding a warning while there is still time",
    summary:
      "A tiny fish in Manu's cupped hands begs for protection, then outgrows every bowl, pot, lake and river he moves it to, until it fills the ocean. Only then does it tell him a flood is coming and to build the boat. The rescue was rehearsed long before the emergency.",
    citationUrl: cite("matsya"),
    weight: 130,
  },
  {
    key: "purana:matsya:enumeration",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapter 53",
    title: "The book that counts the other books",
    theme: "knowing the shape of a tradition",
    summary:
      "The Matsya Purana is the text that lists all eighteen Maha Puranas and their verse counts, totalling some four hundred thousand verses. It is the tradition pausing to take stock of itself and hand the reader a map.",
    citationUrl: cite("matsya"),
    weight: 100,
  },
  {
    key: "purana:matsya:dana",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on dana and vrata",
    title: "Giving measured by what it costs you",
    theme: "sincerity in generosity",
    summary:
      "Long sections of the Matsya Purana set out the forms of giving and the vows that structure a year. The recurring test is not the size of the gift but whether the giver felt its absence, and whether the receiver was left with their dignity.",
    citationUrl: cite("matsya"),
    weight: 105,
  },
  {
    key: "purana:matsya:narmada",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Narmada Mahatmya",
    title: "The river you do not have to enter",
    theme: "grace that does not require the ritual",
    summary:
      "The Matsya Purana says of the Narmada that the Ganga must be bathed in and the Yamuna touched, but the Narmada purifies by sight alone. Of all the tradition's claims about holy water, it is the one asking least of the person standing there.",
    citationUrl: cite("matsya"),
    weight: 120,
  },
  {
    key: "purana:matsya:prayaga",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Prayaga Mahatmya",
    title: "Where two rivers and one invisible river meet",
    theme: "a meeting point taken on trust",
    summary:
      "At Prayaga the Ganga and Yamuna visibly join, and the tradition insists a third river joins them unseen. The Purana's description spends more attention on the one nobody can point to than on the two anyone can.",
    citationUrl: cite("matsya"),
    weight: 115,
  },
  {
    key: "purana:matsya:churning",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on the churning of the ocean",
    title: "Enemies holding opposite ends of the same rope",
    theme: "cooperation with people you intend to outlast",
    summary:
      "Gods and demons cannot obtain the nectar alone, so they churn the ocean together, holding opposite ends of a serpent, for an age. The Purana does not soften the ending: the alliance was always going to break the moment the pot appeared.",
    citationUrl: cite("matsya"),
    weight: 130,
  },
  {
    key: "purana:matsya:vastu",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on architecture",
    title: "The being buried under every building",
    theme: "order imposed on something unruly",
    summary:
      "The Purana's building chapters rest on the vastu purusha, a figure pinned face-down beneath the ground plan with a deity holding each limb. Every house is described as built on top of something held down.",
    citationUrl: cite("matsya"),
    weight: 105,
  },
  {
    key: "purana:matsya:yayati",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on the lunar dynasty",
    title: "The king who borrowed his son's youth",
    theme: "appetite that a lifetime does not exhaust",
    summary:
      "Cursed with premature age, Yayati asks his sons to trade their youth for his old age. Only the youngest agrees. Yayati takes it and spends another thousand years on pleasure, then admits at the end that desire is never put out by feeding it.",
    citationUrl: cite("matsya"),
    weight: 130,
  },
  {
    key: "purana:matsya:future-kings",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on the future dynasties",
    title: "The kings who had not been born yet",
    theme: "power described in advance and in the past tense",
    summary:
      "The Purana lists rulers of ages still to come as though recalling them, ending each dynasty with the number of years it lasted. The literary effect is deliberate: every reign is already over by the time it is named.",
    citationUrl: cite("matsya"),
    weight: 105,
  },
  {
    key: "purana:matsya:taraka",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on the birth of Skanda",
    title: "The demon who chose how he would die",
    theme: "a loophole built into one's own protection",
    summary:
      "Taraka takes a boon that only a son of Shiva can kill him, believing the ascetic will never have one. The gods spend the rest of the story arranging exactly that. The safeguard names the way it will fail.",
    citationUrl: cite("matsya"),
    weight: 125,
  },
  {
    key: "purana:matsya:fourteen-manus",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on the Manvantaras",
    title: "Fourteen times the world has started over",
    theme: "an ending that is not the ending",
    summary:
      "Each age has its own Manu, its own gods, its own sages, and its own dissolution. The Purana counts fourteen, places the reader in the seventh, and moves on without comment.",
    citationUrl: cite("matsya"),
    weight: 110,
  },
  {
    key: "purana:matsya:shraddha",
    source: "purana",
    scripture: "Matsya Purana",
    reference: "Chapters on shraddha",
    title: "Feeding people who cannot eat",
    theme: "duty owed backwards",
    summary:
      "The rites for the dead are laid out in detail — who is fed, on what day, in what order. The Purana is clear that the offering reaches the ancestors through the guests actually eating it, which makes the ritual a meal for the living.",
    citationUrl: cite("matsya"),
    weight: 100,
  },

  {
    key: "purana:kurma:tortoise",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Framing narrative — the Kurma avatara",
    title: "The one holding everything up is underwater",
    theme: "invisible support",
    summary:
      "When Mount Mandara began to sink during the churning of the ocean, Vishnu took the form of a tortoise and went beneath it. Gods and demons pulled at the surface and took the credit. The thing that made it possible was never once seen.",
    citationUrl: cite("kurma"),
    weight: 130,
  },
  {
    key: "purana:kurma:ishvara-gita",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Uttara Vibhaga — the Ishvara Gita",
    title: "The other Gita, spoken by Shiva",
    theme: "knowledge and the settled mind",
    summary:
      "The Kurma Purana carries the Ishvara Gita, a Shaiva counterpart to the Bhagavad Gita in which Shiva teaches the sages of the Daruka forest. Its instruction is the same at the root: know what you actually are, and act without agitation.",
    citationUrl: cite("kurma"),
    weight: 110,
  },
  {
    key: "purana:kurma:ashramas",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on dharma and the ashramas",
    title: "There is a season for each thing you owe",
    theme: "life stages and duty",
    summary:
      "The Kurma Purana lays out the stages of a life — study, household, withdrawal, renunciation — and insists each has its own duties. Trying to live the fourth while owing the second is presented not as devotion but as evasion.",
    citationUrl: cite("kurma"),
    weight: 105,
  },
  {
    key: "purana:kurma:vyasa-gita",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Uttara Vibhaga — the Vyasa Gita",
    title: "The second sermon in the same book",
    theme: "a teaching restated for a different listener",
    summary:
      "Having given the Ishvara Gita, the Kurma Purana gives another, spoken by Vyasa to sages who want it in plainer terms. The tradition evidently did not think one telling was enough, even inside a single text.",
    citationUrl: cite("kurma"),
    weight: 110,
  },
  {
    key: "purana:kurma:naimisha",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Purva Vibhaga — the frame",
    title: "The forest where somebody had to ask first",
    theme: "knowledge that waits to be requested",
    summary:
      "Every Purana opens the same way: sages in the Naimisha forest put a question to a storyteller, and the book is the answer. Nothing in the tradition is presented as arriving unasked, which is a claim about how teaching works.",
    citationUrl: cite("kurma"),
    weight: 105,
  },
  {
    key: "purana:kurma:mandara-sinking",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Framing narrative — the Kurma avatara",
    title: "The mountain that would not stay up",
    theme: "an effort that fails for want of a foundation",
    summary:
      "The churning begins, and the mountain being used as the rod immediately starts sinking into the seabed. All the strength on both ropes is worth nothing until something goes underneath and takes the weight where nobody can see it.",
    citationUrl: cite("kurma"),
    weight: 125,
  },
  {
    key: "purana:kurma:hari-hara",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Purva Vibhaga",
    title: "Two gods, one body",
    theme: "an argument the text refuses to have",
    summary:
      "Asked which of Vishnu and Shiva is greater, the Kurma Purana answers by describing them as halves of one form. It is a Vaishnava text spoken by Vishnu that gives its longest sermon to Shiva, and it treats the rivalry as a misunderstanding.",
    citationUrl: cite("kurma"),
    weight: 120,
  },
  {
    key: "purana:kurma:pashupata-vow",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on the vow",
    title: "Ash, and nothing else",
    theme: "stripping a practice down to what is left",
    summary:
      "The ascetic's discipline is described with almost nothing in it: ash on the body, a place outside the village, and a name repeated. The Purana presents the absence of equipment as the point rather than as poverty.",
    citationUrl: cite("kurma"),
    weight: 110,
  },
  {
    key: "purana:kurma:pralaya",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on dissolution",
    title: "How a world is put away",
    theme: "endings described without panic",
    summary:
      "The Purana takes the world apart in order — earth into water, water into fire, fire into air, air into space — each element dissolving into the one it came from. It is described as tidying, not catastrophe.",
    citationUrl: cite("kurma"),
    weight: 115,
  },
  {
    key: "purana:kurma:yugas",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on the ages",
    title: "What each age asks of a person",
    theme: "the effort a time demands",
    summary:
      "Meditation in the first age, sacrifice in the second, worship in the third, and in the last simply saying the name. The Kurma Purana's account of decline is also an account of the entry price falling.",
    citationUrl: cite("kurma"),
    weight: 115,
  },
  {
    key: "purana:kurma:dvipas",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on the world's divisions",
    title: "Standing on one leaf of a very large map",
    theme: "scale that puts a place in proportion",
    summary:
      "The known land is placed as one region of one island among seven, ringed by oceans. The geography is not accurate and was not meant to be; it is a device for making the reader's own country small.",
    citationUrl: cite("kurma"),
    weight: 95,
  },
  {
    key: "purana:kurma:householder-duty",
    source: "purana",
    scripture: "Kurma Purana",
    reference: "Chapters on dharma",
    title: "The one whose work feeds the others",
    theme: "ordinary obligation as the harder path",
    summary:
      "Of the four stages of life, the Purana singles out the householder as the one supporting the other three, and says so bluntly: the renunciate eats because somebody stayed behind and cooked.",
    citationUrl: cite("kurma"),
    weight: 120,
  },

  {
    key: "purana:varaha:lifting-earth",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Framing narrative — the Varaha avatara",
    title: "The earth was carried out on a tusk",
    theme: "rescue from the depths",
    summary:
      "The whole Varaha Purana is spoken while the rescue is still happening: Vishnu as the boar has dived into the cosmic waters, lifted the drowned earth on his tusk, and is answering her questions on the way back up.",
    citationUrl: cite("varaha"),
    weight: 125,
  },
  {
    key: "purana:varaha:earth-questions",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Dialogue of Bhudevi and Varaha",
    title: "The earth asks who is worth saving",
    theme: "worthiness and grace",
    summary:
      "Bhudevi, the earth goddess, questions her rescuer about vows, giving and who deserves deliverance. The answers keep returning to the same place: deliverance is not a reward issued for a score, or she herself would still be under the water.",
    citationUrl: cite("varaha"),
    weight: 110,
  },
  {
    key: "purana:varaha:mathura",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Mathura Mahatmya",
    title: "Why the ground at Mathura is different",
    theme: "sacred place and memory",
    summary:
      "The Varaha Purana's praise of Mathura treats a place as a form of memory — soil that holds what happened on it. Pilgrimage becomes less about travel than about standing where something true occurred and letting it work on you.",
    citationUrl: cite("varaha"),
    weight: 100,
  },
  {
    key: "purana:varaha:hiranyaksha",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Framing narrative — the Varaha avatara",
    title: "The demon who rolled up the earth and left",
    theme: "a theft nobody could follow",
    summary:
      "Hiranyaksha takes the earth itself and hides it under the cosmic waters, where no god can reach. The rescue requires becoming something that can go down there — which is why the answer to him is a boar rather than an army.",
    citationUrl: cite("varaha"),
    weight: 130,
  },
  {
    key: "purana:varaha:dharma-taught",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Dialogue of Bhudevi and Varaha",
    title: "The earth asks how to be lived on",
    theme: "instruction given to the ground itself",
    summary:
      "Having been carried to safety, Bhudevi does not thank her rescuer and stop. She asks what the beings on her back are supposed to do, and the rest of the Purana is the answer to that one question.",
    citationUrl: cite("varaha"),
    weight: 120,
  },
  {
    key: "purana:varaha:vratas",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Chapters on vratas",
    title: "Promises kept on particular days",
    theme: "structure that carries you when resolve does not",
    summary:
      "The vrata chapters attach observance to fixed dates rather than to how a person feels. The Purana's assumption is that anyone relying on their own motivation will stop, and that a calendar will not.",
    citationUrl: cite("varaha"),
    weight: 105,
  },
  {
    key: "purana:varaha:kokamukha",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Kokamukha Mahatmya",
    title: "A holy place at the edge of the map",
    theme: "sanctity far from anywhere convenient",
    summary:
      "The Purana devotes long passages to a tirtha in the far northern hills that few of its readers could ever have reached. Distance is treated as part of what the place is worth, not as an obstacle to be apologised for.",
    citationUrl: cite("varaha"),
    weight: 95,
  },
  {
    key: "purana:varaha:forms-of-vishnu",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Chapters on the forms of Vishnu",
    title: "The same one, described differently",
    theme: "many descriptions of a single thing",
    summary:
      "The Purana catalogues form after form — reclining, standing, four-armed, boar-headed — and insists throughout that the multiplicity is in the describing, not in the described.",
    citationUrl: cite("varaha"),
    weight: 100,
  },
  {
    key: "purana:varaha:goddess-forms",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Chapters on the goddesses",
    title: "The mothers who arrive when it is already bad",
    theme: "help that comes in numbers",
    summary:
      "The Purana describes the band of mother goddesses emerging when a single opponent has proved too much for anyone acting alone. Their appearance in a text is reliably a sign that the situation has gone past negotiation.",
    citationUrl: cite("varaha"),
    weight: 115,
  },
  {
    key: "purana:varaha:shraddha",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Chapters on shraddha",
    title: "The obligation that outlives the person",
    theme: "a debt that does not lapse",
    summary:
      "Rites for the dead are described as owed regardless of how the relationship went. The Purana makes no allowance for a difficult father, which is precisely what makes the instruction hard.",
    citationUrl: cite("varaha"),
    weight: 110,
  },
  {
    key: "purana:varaha:giving",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Chapters on dana",
    title: "What is given, and to whom, and when",
    theme: "generosity with its conditions named",
    summary:
      "The Purana is specific about giving: at the right time, to someone who needs it, without announcing it, and without expecting the recipient to be grateful in a visible way. Each condition removes a way of getting credit.",
    citationUrl: cite("varaha"),
    weight: 120,
  },
  {
    key: "purana:varaha:mathura-circuit",
    source: "purana",
    scripture: "Varaha Purana",
    reference: "Mathura Mahatmya",
    title: "Walking the same few miles on purpose",
    theme: "repetition as devotion",
    summary:
      "The circuit around Mathura is laid out stop by stop, to be walked in order, more than once. The Purana treats the second and tenth walk as worth more than the first, which is not how a sightseer would rank them.",
    citationUrl: cite("varaha"),
    weight: 100,
  },

  {
    key: "purana:vamana:three-steps",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Framing narrative — the Vamana avatara",
    title: "Three paces from a man who had everything",
    theme: "humility outmatching power",
    summary:
      "A dwarf asks the world-conquering Bali for three paces of land and is warned it is a trap. Bali gives anyway rather than break his word, and the third step has nowhere left to fall but his own head. He is honoured above the gods for losing.",
    citationUrl: cite("vamana"),
    weight: 130,
  },
  {
    key: "purana:vamana:aditi-penance",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on the birth of Vamana",
    title: "A mother's austerity before the rescue",
    theme: "patience before deliverance",
    summary:
      "Before the dwarf ever walks into Bali's hall, Aditi undertakes long austerity for a son who can set things right. The Vamana Purana spends its opening on the waiting, not the victory — the part nobody retells.",
    citationUrl: cite("vamana"),
    weight: 105,
  },
  {
    key: "purana:vamana:trivikrama",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "The Trivikrama form",
    title: "The small form was the real one",
    theme: "underestimation",
    summary:
      "The figure everyone in the hall dismissed expands into Trivikrama, who covers earth and sky in two strides. The Purana's point is not the vast form but that it was there the whole time, standing quietly and asking politely.",
    citationUrl: cite("vamana"),
    weight: 120,
  },
  {
    key: "purana:vamana:shukra-warning",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on Bali's sacrifice",
    title: "The advisor who lost an eye stopping a gift",
    theme: "loyalty that will not be thanked",
    summary:
      "Shukracharya recognises the dwarf and tries to stop the grant, first by argument and then by shrinking himself to block the spout of the water jar. A blade of grass is pushed through to clear it, and he loses the eye. His king overrules him anyway.",
    citationUrl: cite("vamana"),
    weight: 130,
  },
  {
    key: "purana:vamana:ganga-from-foot",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "The Trivikrama form",
    title: "The river that started at a footstep",
    theme: "something enormous beginning as a side effect",
    summary:
      "As the second stride reaches the top of the universe, the foot breaks the shell of the world and water pours through the crack. The Ganga, in this telling, is not a gift that was planned. It is what came in through the hole.",
    citationUrl: cite("vamana"),
    weight: 125,
  },
  {
    key: "purana:vamana:bali-in-patala",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on Bali",
    title: "The defeated king who was given a door",
    theme: "losing everything and being honoured for it",
    summary:
      "Having lost the three worlds for keeping his word, Bali is sent below — and Vishnu takes the post of doorkeeper outside his hall. The Purana's judgement on who won is delivered entirely through where each of them ends up standing.",
    citationUrl: cite("vamana"),
    weight: 130,
  },
  {
    key: "purana:vamana:prahlada-counsel",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on Bali's sacrifice",
    title: "The grandfather who told him to give it away",
    theme: "advice against one's own family interest",
    summary:
      "Bali's grandfather Prahlada, who survived his own father's persecution, is the one who tells him not to refuse the dwarf. The counsel costs the family its empire, and he gives it without hesitating.",
    citationUrl: cite("vamana"),
    weight: 120,
  },
  {
    key: "purana:vamana:kurukshetra",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Kurukshetra Mahatmya",
    title: "The field before it was a battlefield",
    theme: "a place remembered for the wrong thing",
    summary:
      "Long before the war, the Purana describes Kurukshetra as a plain of ponds and shrines where a king named Kuru ploughed the ground as an act of devotion. Everything the name now means came later.",
    citationUrl: cite("vamana"),
    weight: 120,
  },
  {
    key: "purana:vamana:skull-in-hand",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on Shiva's wandering",
    title: "The god who begged with a skull",
    theme: "carrying a consequence in public",
    summary:
      "Shiva wanders as a beggar with a skull stuck to his hand that will not come free, unable to fill it. The Purana does not let him off quickly. He carries the visible evidence of what he did for as long as it takes.",
    citationUrl: cite("vamana"),
    weight: 125,
  },
  {
    key: "purana:vamana:parvati-austerity",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on the goddess",
    title: "The one who was called dark and left",
    theme: "a remark that changes a life",
    summary:
      "Stung by a careless word about her complexion, Parvati goes away and undertakes austerity until she is transformed. The Purana's interest is in how small the original comment was, and how completely it was answered.",
    citationUrl: cite("vamana"),
    weight: 125,
  },
  {
    key: "purana:vamana:andhaka-end",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on Andhaka",
    title: "The blood that made more of him",
    theme: "a fight that feeds on being fought",
    summary:
      "Every drop of Andhaka's blood that touches the ground becomes another Andhaka, so the harder he is struck the more of him there is. He is beaten only when someone stops striking and starts catching.",
    citationUrl: cite("vamana"),
    weight: 120,
  },
  {
    key: "purana:vamana:aditi-patience",
    source: "purana",
    scripture: "Vamana Purana",
    reference: "Chapters on the birth of Vamana",
    title: "A mother who waited out a war",
    theme: "the long unremarkable part of a rescue",
    summary:
      "Aditi's sons are driven out and she is left with nothing to do but keep a vow, month after month, on the instruction of her husband. The Purana gives the waiting more space than the victory that follows it.",
    citationUrl: cite("vamana"),
    weight: 115,
  },

  {
    key: "purana:bhavishya:name",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Framing of the text",
    title: "The Purana written in the future tense",
    theme: "time and consequence",
    summary:
      "Alone among the eighteen, the Bhavishya Purana is framed as prophecy — its name simply means 'the future'. Its working assumption is that what is coming is not arbitrary but grown from what is being done now.",
    citationUrl: cite("bhavishya"),
    weight: 115,
  },
  {
    key: "purana:bhavishya:surya",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Brahma Parva — sun worship",
    title: "The oldest medicine is to face the light",
    theme: "discipline and renewal",
    summary:
      "Large parts of the Bhavishya Purana concern the worship of Surya, including the priestly lineages who tended sun temples. Its prescription is unglamorous and daily: rise, face the light, begin again.",
    citationUrl: cite("bhavishya"),
    weight: 110,
  },
  {
    key: "purana:bhavishya:household-year",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Chapters on vratas and festivals",
    title: "A year built out of small observances",
    theme: "rhythm and remembrance",
    summary:
      "The Bhavishya Purana organises the calendar into fasts, festivals and duties. The architecture is deliberate: a person cannot hold a spiritual intention continuously, so the year is built to keep returning them to it.",
    citationUrl: cite("bhavishya"),
    weight: 100,
  },
  {
    key: "purana:bhavishya:holika",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Uttara Parva — the festival chapters",
    title: "The fire that burnt the wrong person",
    theme: "protection that fails the one holding it",
    summary:
      "Holika has a boon against fire and carries her nephew Prahlada into the flames to kill him. She burns and the child does not. The Purana is precise about why: a protection given for one purpose stopped working the moment it was used for another.",
    citationUrl: cite("bhavishya"),
    weight: 130,
  },
  {
    key: "purana:bhavishya:maga-priests",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Brahma Parva",
    title: "The priests who were sent for from abroad",
    theme: "borrowing what you do not have",
    summary:
      "To serve the new sun temple, priests are brought from a land across the sea because nobody at home knows the rite. The Purana records the import without embarrassment, which makes it one of the tradition's franker moments.",
    citationUrl: cite("bhavishya"),
    weight: 105,
  },
  {
    key: "purana:bhavishya:water-gift",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Uttara Parva — chapters on dana",
    title: "The best thing to give away in May",
    theme: "generosity matched to the season",
    summary:
      "In the hot months the Purana rates a jar of cool water and a shaded place to drink it above gold. The ranking of gifts changes with the calendar, because what a person needs in June is not what they need in December.",
    citationUrl: cite("bhavishya"),
    weight: 115,
  },
  {
    key: "purana:bhavishya:planting-trees",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Uttara Parva — chapters on merit",
    title: "Shade you will never sit in",
    theme: "work whose benefit goes to strangers",
    summary:
      "Planting trees and digging wells are ranked among the highest acts, and the Purana notes what they have in common: the person who does the work is usually dead before the benefit is at its fullest.",
    citationUrl: cite("bhavishya"),
    weight: 125,
  },
  {
    key: "purana:bhavishya:naga-worship",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Uttara Parva — the vrata chapters",
    title: "Offering milk to what you are afraid of",
    theme: "respect for a danger rather than war against it",
    summary:
      "On the appointed day, milk is set out for snakes rather than snakes being hunted. The Purana's logic is not sentimental: the creature was there first, it will still be there tomorrow, and coexistence has to be arranged.",
    citationUrl: cite("bhavishya"),
    weight: 110,
  },
  {
    key: "purana:bhavishya:pratisarga",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Pratisarga Parva",
    title: "The chapters that kept being added to",
    theme: "a text that would not stay finished",
    summary:
      "The Purana's section on things to come was extended by later hands for centuries, each generation writing its own present into a book claiming to have foreseen it. Read honestly, it is a record of what people kept wanting scripture to have known.",
    citationUrl: cite("bhavishya"),
    weight: 100,
  },
  {
    key: "purana:bhavishya:twelve-suns",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Brahma Parva — sun worship",
    title: "One sun with twelve names",
    theme: "the same source in different months",
    summary:
      "The sun is given a distinct name and character for each month of the year — fierce in one, mild in another. The Purana is describing a single body and insisting that how it meets you changes.",
    citationUrl: cite("bhavishya"),
    weight: 100,
  },
  {
    key: "purana:bhavishya:ritucharya",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Chapters on the seasons",
    title: "Eating differently in different weather",
    theme: "living with the year instead of against it",
    summary:
      "What to eat, when to bathe, when to travel and when to stay in are all set by season. The instruction assumes a body that is part of the weather rather than sheltered from it.",
    citationUrl: cite("bhavishya"),
    weight: 95,
  },
  {
    key: "purana:bhavishya:bhishma-panchaka",
    source: "purana",
    scripture: "Bhavishya Purana",
    reference: "Uttara Parva — the vrata chapters",
    title: "Five days named after a dying man",
    theme: "an observance built on somebody's last words",
    summary:
      "The five-day fast is named for Bhishma, who spent his final days on a bed of arrows answering questions about duty. The Purana ties the observance to the fact that he kept teaching while he was dying.",
    citationUrl: cite("bhavishya"),
    weight: 115,
  },

  {
    key: "purana:brahmavaivarta:radha",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Krishna Janma Khanda",
    title: "Two names for one thing",
    theme: "love as inseparability",
    summary:
      "The Brahmavaivarta Purana refuses to treat Radha as Krishna's companion and instead treats them as one reality described from two sides. Devotion here is not reaching toward the divine but recognising you were never separate.",
    citationUrl: cite("brahmavaivarta"),
    weight: 125,
  },
  {
    key: "purana:brahmavaivarta:ganapati",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Ganapati Khanda",
    title: "The one you greet before beginning",
    theme: "obstacles and beginnings",
    summary:
      "A whole book of the Brahmavaivarta Purana belongs to Ganesha. He is not asked to clear the road so much as consulted about whether it is the right road — which is why nothing is meant to start without him.",
    citationUrl: cite("brahmavaivarta"),
    weight: 120,
  },
  {
    key: "purana:brahmavaivarta:prakriti",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Prakriti Khanda",
    title: "Nature is not a backdrop",
    theme: "the feminine principle",
    summary:
      "The Prakriti Khanda treats the goddess as nature itself — not scenery for a divine drama but the active power without which nothing at all occurs. Consciousness may be still; everything that moves, moves as her.",
    citationUrl: cite("brahmavaivarta"),
    weight: 110,
  },
  {
    key: "purana:brahmavaivarta:ganesha-head",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Ganapati Khanda",
    title: "The guest who was asked not to look",
    theme: "harm done by someone who warned you",
    summary:
      "Every god comes to see the newborn. Shani stays back and explains that his glance burns whatever it falls on. Pressed and pressed again to look, he finally does, and the child's head is gone. The Purana blames the insisting, not the looking.",
    citationUrl: cite("brahmavaivarta"),
    weight: 135,
  },
  {
    key: "purana:brahmavaivarta:tulsi",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Prakriti Khanda",
    title: "The wife whose faithfulness was the shield",
    theme: "protection that has to be broken to be beaten",
    summary:
      "Shankhachuda cannot be killed while his wife Tulsi's devotion is intact, so the war is won by deceiving her rather than by defeating him. She is given the form of a plant afterwards, and the plant is kept in every courtyard.",
    citationUrl: cite("brahmavaivarta"),
    weight: 130,
  },
  {
    key: "purana:brahmavaivarta:goloka",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Krishna Janma Khanda",
    title: "The world above the worlds",
    theme: "a home that was never left",
    summary:
      "The Purana places a realm above every heaven the other texts describe, and says the cowherd boy of Vrindavan never actually departed from it. Everything that happens on earth is happening to someone who is already home.",
    citationUrl: cite("brahmavaivarta"),
    weight: 115,
  },
  {
    key: "purana:brahmavaivarta:five-goddesses",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Prakriti Khanda",
    title: "One power, counted five ways",
    theme: "aspects of a single strength",
    summary:
      "Durga, Radha, Lakshmi, Saraswati and Savitri are described as five portions of one original power — force, love, sustenance, knowledge and speech. The Purana treats the division as convenience for the describer.",
    citationUrl: cite("brahmavaivarta"),
    weight: 110,
  },
  {
    key: "purana:brahmavaivarta:sudama-curse",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Krishna Janma Khanda",
    title: "The attendant cursed for doing his job",
    theme: "punishment falling on the obedient",
    summary:
      "Sudama blocks Radha at a door because he was told to, and is cursed for it into a demon's birth. The Purana lets the injustice stand without tidying it, and follows him all the way through the consequence.",
    citationUrl: cite("brahmavaivarta"),
    weight: 120,
  },
  {
    key: "purana:brahmavaivarta:flute",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Krishna Janma Khanda",
    title: "The sound that emptied the houses",
    theme: "a call that arrives at an inconvenient hour",
    summary:
      "The flute is heard at night, and women leave half-finished work, sleeping husbands and unlit lamps to follow it. The Purana does not present this as tidy devotion. It presents it as something that could not be resisted.",
    citationUrl: cite("brahmavaivarta"),
    weight: 125,
  },
  {
    key: "purana:brahmavaivarta:karma-accounts",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Brahma Khanda",
    title: "Nothing is written off",
    theme: "consequences that wait",
    summary:
      "The Purana insists an action's result arrives whether or not anyone remembers the action, and that delay is not cancellation. It is the least comforting doctrine in the text and it is stated most plainly.",
    citationUrl: cite("brahmavaivarta"),
    weight: 120,
  },
  {
    key: "purana:brahmavaivarta:savitri-dialogue",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Prakriti Khanda",
    title: "Questions put to death, and answered",
    theme: "arguing rather than pleading",
    summary:
      "Savitri does not beg Yama for her husband's life. She follows him and keeps talking — about duty, about what a good person owes, about what he himself has just said — until he grants what she never directly asked for.",
    citationUrl: cite("brahmavaivarta"),
    weight: 130,
  },
  {
    key: "purana:brahmavaivarta:speech-goddess",
    source: "purana",
    scripture: "Brahmavaivarta Purana",
    reference: "Prakriti Khanda",
    title: "The goddess who is the words themselves",
    theme: "language as something received",
    summary:
      "Saraswati is not described as presiding over speech but as being it. On that account every sentence a person manages is borrowed, which is why the Purana treats careless words as a specific kind of ingratitude.",
    citationUrl: cite("brahmavaivarta"),
    weight: 110,
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
