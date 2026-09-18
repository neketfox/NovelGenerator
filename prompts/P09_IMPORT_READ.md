# P09_IMPORT_READ — read one chapter of an existing manuscript

When: once per chapter of an imported manuscript, before anything is designed.

TASK
Read the chapter below and report what it puts on the page. You are not
improving it and not continuing it — you are recording what is already there,
so the book's construction can be recovered from its own prose.

INPUT
Chapter number:
{{chapter_number}}

Chapter title as the document gives it:
{{chapter_title}}

Chapter text:
{{chapter_text}}

What earlier chapters already established:
{{prior_context}}

WORK ORDER
1. Summarize what happens, in causal terms: who acts, why, and what changes
   as a result. Not a blurb — the summary is the only form later chapters see.
2. List every person who appears, under the name the text uses. Note the
   variants the text also uses for the same person, so a later chapter does not
   invent a second character out of a nickname.
3. List the facts the chapter establishes about the world that a later chapter
   could contradict: places, relationships, capabilities, rules, dates.
4. List what the chapter opens and leaves standing — a question, a promise, a
   threat — and what it closes.
5. Report contradictions against what earlier chapters established, and
   contradictions inside this chapter. Report only what the text actually says,
   quoting the words that clash. An absence is not a contradiction: a fact this
   chapter simply does not mention is not a problem to report.
6. Name the point of view this chapter is written from, and the tense.

FORMAT
Return only JSON:

{
  "summary": "",
  "characters": [{"name": "", "aliases": [], "role_here": ""}],
  "facts": [{"fact": "", "about": ""}],
  "opened": [],
  "closed": [],
  "inconsistencies": [{"problem": "", "quote": "", "against": ""}],
  "pov": "",
  "tense": ""
}
