# P10_IMPORT_DESIGN — recover the construction of a manuscript already written

When: once, after every imported chapter has been read, before writing continues.

TASK
An author has written {{written_count}} chapters and wants to finish the book
here. Recover the construction those chapters are already following, and extend
it over the {{remaining_count}} chapters still to be written. The construction
must describe the book that exists, not the book you would have written.

INPUT
Chapter digests, in order (chapters 1 to {{written_count}} are already written):
{{chapter_digests}}

The author's own note about the book, if any:
{{author_requirements}}

Language of the manuscript:
{{language}}

WORK ORDER
1. Name what this book is: its genre, its premise in one paragraph, and a
   working_title — the author's own title where the document gives one.
2. Cast every person the written chapters put on the page, under the name those
   chapters use. Do not rename anybody and do not add a character the written
   chapters have never mentioned unless the remaining chapters need one; if you
   add one, they may only appear in chapters not yet written.
3. Recover the world rules and the causal map from what has already happened:
   which event caused which, and what each one made possible.
4. Decide the ending this book is heading for, from where it actually stands.
5. Fill chapter_map with exactly {{chapter_count}} entries. Entries 1 to
   {{written_count}} describe the chapters as written — their function, their
   change, their cost — and are a record, not a plan. The entries after them are
   the plan for what is left, and must follow from where the written chapters
   left the story.
6. Declare the profile honestly from the prose that exists: a book whose written
   chapters repeat one mechanism has a high mechanism_reuse, and saying
   otherwise would have code reject the book the author already wrote.
7. premise_givens and premise_names come from the premise you just recovered, and
   every one of them is already on the page — so each must appear in the
   construction below.

PROFILE
This is where you say what kind of book this is. Code enforces it afterwards,
so declare the book you mean to write, not the book that sounds safest.

- pressure_curve: how pressure is meant to move across the whole book.
  "rising" — it grows chapter by chapter (thriller, horror).
  "oscillating" — it closes and breaks on purpose (romance, some drama).
  "investigative" — what grows is what is known, not what threatens (mystery).
  "flat" — the pressure is a condition, not a rise (much literary fiction).
  "descending" — the book releases rather than tightens.
  Choose from what this premise actually is. A wrong curve is worse than a
  modest one: the chapter rungs are checked against the shape you name here.
- declared_motifs: the repetitions this book means. A returning image, phrase,
  or gesture that carries the book is a refrain; the same thing unmeant is a
  tic. Anything you declare here is exempt from the repetition check up to
  allowed_uses, and anything you do not declare is counted. Declare only what
  is load-bearing, give each one a reason, and keep the budgets honest — a
  large enough exemption disarms the check and the book goes formulaic
  unnoticed.
- cost_kinds: what paying a price means in this book. Material loss and injury
  in one genre; exposure and vulnerability in another; a discarded theory, a
  burned source, a lost witness in another. Every chapter must be able to take
  something from someone in these terms.
- dialogue_weight, staging_variety, mechanism_reuse: low / medium / high only.
  Never a number, a share, or a percentage — you cannot know the statistics of
  prose that does not exist yet, and a decimal invented here would be enforced
  as if it were measured. staging_variety "low" is the honest answer for a
  deliberately claustrophobic book: one house, one pair of eyes, and the
  repetition-of-staging check relaxes accordingly. mechanism_reuse "high" is
  the honest answer for a procedural, where repeating the method is the form.
- open_ending: true when threads left standing at the end are the design.
- mechanism_ledger: the distinct ways the central obstacle is met across the
  book. Not scenes and not plot points — kinds of solution. Chapters draw from
  this list and spend what they draw, so a book whose ledger is too short will
  repeat one solution in different scenery, and code will say so before a word
  is written.
- ending_invariants: what this book's kind promises a reader, in this book's
  own words. A mystery that the reader could have solved from clues planted
  before the revelation. A romance that ends on the pair. A horror that leaves
  the wrong thing alive. Name what yours owes.

VOICE
Describe the voice through narrative distance, traits of attention,
register, attitude to humor, and emotional restraint.
Do not set quotas on sentence length, dialogue, or metaphors.

FORMAT
Return only JSON with the following structure.
Fill lists as needed; chapter_map contains exactly
{{chapter_count}} entries.

{
  "contract": {
    "working_title": "",
    "explicit_requirements": [],
    "premise_givens": [
      {"given": "", "kind": "person | thing | situation | fact"}
    ],
    "premise_names": [],
    "inferred_decisions": [
      {"decision": "", "reason": ""}
    ],
    "tense": "",
    "narrative_perspective": "",
    "genre_expectations_selected": []
  },
  "profile": {
    "pressure_curve": "rising | oscillating | investigative | flat | descending",
    "curve_reason": "",
    "declared_motifs": [
      {"motif": "", "allowed_uses": 0, "reason": ""}
    ],
    "cost_kinds": [],
    "dialogue_weight": "low | medium | high",
    "staging_variety": "low | medium | high",
    "mechanism_reuse": "low | medium | high",
    "open_ending": false,
    "mechanism_ledger": [],
    "ending_invariants": []
  },
  "dramatic_core": {
    "distinctive_situation": "",
    "central_conflict": "",
    "stakes": "",
    "why_now": "",
    "sources_of_development": []
  },
  "style_contract": {
    "narrative_distance": "",
    "attention": "",
    "register": "",
    "humor": "",
    "emotional_expression": ""
  },
  "characters": [
    {
      "id": "C01",
      "name": "",
      "story_function": "",
      "goal": "",
      "motives": [],
      "capabilities": [],
      "limitations": [],
      "relationships": [],
      "behavior": "",
      "voice_and_perception": "",
      "initial_knowledge": [],
      "initial_beliefs": []
    }
  ],
  "world_rules": [
    {"id": "R01", "rule": "", "relevant_consequences": []}
  ],
  "causal_map": [
    {
      "id": "E01",
      "cause": "",
      "actor_id": "",
      "action_or_event": "",
      "consequence": "",
      "requires": [],
      "enables": []
    }
  ],
  "ending": {
    "central_resolution": "",
    "decisive_action_or_choice": "",
    "required_setup": [],
    "intentionally_open_questions": []
  },
  "chapter_map": [
    {
      "chapter": 1,
      "function": "",
      "main_change": "",
      "event_ids": [],
      "dependencies": [],
      "setup_or_payoff": [],
      "pov_id": null,
      "target_words": 0,
      "mechanism": "",
      "cost": "",
      "pressure_rung": 1
    }
  ]
}
