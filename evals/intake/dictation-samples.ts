// Dictation eval corpus (PRD 34).
//
// Twenty-two transcripts in the shape a phone keyboard actually produces: no
// punctuation, filler, false starts, spoken-out numbers, and topics that jump
// mid-sentence. Written rather than recorded because what reaches the model is
// *text* — the phone has already done the speech-to-text — so a hand-written
// transcript is the real input, not a stand-in for one.
//
// The corpus is deliberately weighted toward restraint cases. Roughly half the
// samples name nobody reachable, mention no date, or cover only one of the two
// property sections, because the failure this feature must not have is a
// confident invention, and you only measure that on inputs where the correct
// answer is "nothing".

export type DateExpectation =
  /** An unambiguous calendar day the speaker named outright. */
  | { kind: "absolute"; date: string }
  /** Days from the day the eval runs, for "tomorrow" / "in two weeks". */
  | { kind: "offsetDays"; days: number }
  /** The next occurrence of a day-of-month, e.g. "the fifteenth". */
  | { kind: "nextDayOfMonth"; day: number }
  /** The first of the following month. */
  | { kind: "firstOfNextMonth" };

export type Sample = {
  id: string;
  /** What the phone handed us. */
  transcript: string;
  /** Facts that must survive the tidy-up, lowercased substrings. */
  mustPreserve: string[];
  /** Digits of every phone number genuinely present. Empty = none. */
  contactPhones: string[];
  /** Emails genuinely present. */
  contactEmails: string[];
  /** Substrings that must land in guidelines, or null if it has none. */
  guidelines: string[] | null;
  /** Substrings that must land in how-to, or null if it has none. */
  howTo: string[] | null;
  /** Dates genuinely stated. Empty = no reminder may be proposed. */
  dates: DateExpectation[];
};

export const SAMPLES: Sample[] = [
  // --- reachable contacts, real dates -------------------------------------
  {
    id: "plumber-and-propane",
    transcript:
      "okay so um the plumber is Dave Kerrigan his number is five five five oh one four two he did the work on the upstairs bathroom last autumn and he knows where everything is uh also the propane bill is due on the fifteenth I keep forgetting it",
    mustPreserve: ["kerrigan", "propane"],
    contactPhones: ["5550142"],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [{ kind: "nextDayOfMonth", day: 15 }],
  },
  {
    id: "caretaker-with-email",
    transcript:
      "the caretaker over the winter is Marie Boucher you can reach her at marie dot boucher at example dot com she goes up every couple of weeks to check the pipes havent frozen",
    mustPreserve: ["boucher", "pipes"],
    contactPhones: [],
    contactEmails: ["marie.boucher@example.com"],
    guidelines: null,
    howTo: ["pipe"],
    dates: [],
  },
  {
    id: "two-trades",
    transcript:
      "right two people to write down the electrician is Sam Whitlock five five five two two nine one and the snow removal guy is Terry he does the drive every storm his number is five five five eight eight one four dont call Terry before November he doesnt answer",
    mustPreserve: ["whitlock", "terry"],
    contactPhones: ["5552291", "5558814"],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },

  // --- restraint: people named, no way to reach them -----------------------
  {
    id: "names-no-numbers",
    transcript:
      "um the neighbours are the Prescotts theyre lovely theyve got a key and old Mr Hendry down the lane keeps an eye on the place too hes been there forever",
    mustPreserve: ["prescott", "hendry"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },
  {
    id: "vague-tradesman",
    transcript:
      "there was a roofer who came out after the storm I cant remember his name now the invoice is in the drawer in the kitchen somewhere he said the flashing would need doing again in a few years",
    mustPreserve: ["roofer", "flashing"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },
  {
    id: "family-only",
    transcript:
      "so when Claire and the kids come up in August they take the back bedroom and the little room over the porch thats always been the arrangement and nobody minds",
    mustPreserve: ["claire", "porch"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },

  // --- restraint: no date at all ------------------------------------------
  {
    id: "soon-is-not-a-date",
    transcript:
      "the gutters need doing soon theyre full of pine needles again and at some point before winter someone should get up there and clear the valley behind the chimney",
    mustPreserve: ["gutter", "pine needle"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: ["gutter"],
    dates: [],
  },
  {
    id: "eventually",
    transcript:
      "eventually we should replace the mattress in the front bedroom its getting on a bit no rush though nobody has complained",
    mustPreserve: ["mattress"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },
  {
    id: "past-tense-date",
    transcript:
      "the insurance renewed back in March and that all went through fine so thats done for the year nothing to do about it",
    mustPreserve: ["insurance"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },

  // --- guidelines --------------------------------------------------------
  {
    id: "house-rules",
    transcript:
      "things for people staying no shoes upstairs the floors are original and they mark uh strip the beds before you leave and put the linen in the basket on the landing and please dont let the dog on the sofa in the front room",
    mustPreserve: ["shoes upstairs", "strip the beds"],
    contactPhones: [],
    contactEmails: [],
    guidelines: ["shoes"],
    howTo: null,
    dates: [],
  },
  {
    id: "quiet-hours",
    transcript:
      "one thing worth writing down is the noise the neighbours are close on that side so nothing loud outside after ten and if youre having people over let the Prescotts know first its only polite",
    // Not "after ten": tidying "ten" into "10 PM" is correct behaviour, so an
    // expectation written in the spoken word would fail the model for doing the
    // job. Asserted on the part that must survive either rendering.
    mustPreserve: ["outside"],
    contactPhones: [],
    contactEmails: [],
    guidelines: ["outside"],
    howTo: null,
    dates: [],
  },
  {
    id: "leaving-checklist",
    transcript:
      "when youre leaving turn the heat down to fifty not off never off take the bins out to the road if its a Tuesday and lock the shed the padlock sticks so give it a shove",
    mustPreserve: ["fifty", "shed"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [],
  },

  // --- how things work ----------------------------------------------------
  {
    id: "water-shutoff",
    transcript:
      "the water shut off is not in the house its out by the road under the green cover you need the long key thats hanging in the shed and you turn it uh anticlockwise",
    mustPreserve: ["shut off", "green cover"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: ["shut"],
    dates: [],
  },
  {
    id: "gate-code-correction",
    transcript:
      "the gate code is four four one seven no wait sorry its four four seven one four four seven one and the same code works for the padlock on the boathouse",
    mustPreserve: ["4471"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: ["4471"],
    dates: [],
  },
  {
    id: "heating-quirk",
    transcript:
      "the heating is fiddly the thermostat in the hall runs about three degrees warm so if it says sixty eight its really sixty five and the radiator in the back bedroom needs bleeding every autumn theres a key in the drawer",
    mustPreserve: ["thermostat", "bleed"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: ["thermostat"],
    dates: [],
  },

  // --- mixed topics, the realistic case ------------------------------------
  {
    id: "everything-at-once",
    transcript:
      "okay a few things um the water shut off is by the road under the green cover and no shoes upstairs please the floors mark and the plumber is Dave Kerrigan five five five oh one four two and I need to remember the propane on the fifteenth thats it I think",
    mustPreserve: ["kerrigan", "propane", "shut off"],
    contactPhones: ["5550142"],
    contactEmails: [],
    guidelines: ["shoes"],
    howTo: ["shut"],
    dates: [{ kind: "nextDayOfMonth", day: 15 }],
  },
  {
    id: "rambling-two-topics",
    transcript:
      "so I was up there at the weekend and the dock needs a board replaced its the third one out you can see where its gone soft anyway while I was there I noticed the guest room window doesnt latch properly you have to lift it while you turn the catch",
    mustPreserve: ["dock", "latch"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: ["window"],
    dates: [],
  },
  {
    id: "false-start-then-rules",
    transcript:
      "I wanted to say about the uh no hang on let me start again the thing about the boat is nobody takes it out alone thats the rule always two people and the life jackets live in the bench seat",
    mustPreserve: ["two people", "life jacket"],
    contactPhones: [],
    contactEmails: [],
    guidelines: ["alone"],
    howTo: null,
    dates: [],
  },

  // --- dates the speaker really named --------------------------------------
  {
    id: "tomorrow",
    transcript:
      "remind me tomorrow to call about the chimney sweep I keep meaning to book it before the season starts",
    mustPreserve: ["chimney"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [{ kind: "offsetDays", days: 1 }],
  },
  {
    id: "first-of-next-month",
    transcript:
      "the water rates come out on the first of next month its about ninety dollars I think and it goes out automatically but Id like it on the calendar anyway",
    mustPreserve: ["water rates"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [{ kind: "firstOfNextMonth" }],
  },
  {
    id: "explicit-date-and-repeat",
    transcript:
      "put down the septic inspection for the twelfth of October and that one is every year so it wants repeating annually the company sends a card but we never see it in time",
    mustPreserve: ["septic"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [{ kind: "absolute", date: "10-12" }],
  },
  {
    id: "two-dates",
    transcript:
      "two things for the calendar the dock goes in in two weeks and the propane is due on the fifteenth as usual",
    mustPreserve: ["dock", "propane"],
    contactPhones: [],
    contactEmails: [],
    guidelines: null,
    howTo: null,
    dates: [
      { kind: "offsetDays", days: 14 },
      { kind: "nextDayOfMonth", day: 15 },
    ],
  },
];
