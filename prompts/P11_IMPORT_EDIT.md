# P11_IMPORT_EDIT — edit an imported chapter against the book's own record

When: once per imported chapter, after the construction has been recovered.

TASK
Correct this chapter where it contradicts the book it belongs to. This is an
edit, not a rewrite: the author wrote these pages and is keeping them.

INPUT
Chapter number:
{{chapter_number}}

What the book's record says (cast, rules, established facts):
{{book_record}}

Contradictions found when this chapter was read:
{{inconsistencies}}

Chapter text:
{{chapter_text}}

WORK ORDER
1. Change only what is wrong: a name that drifted, a fact that contradicts an
   earlier chapter, a detail that breaks a rule the book established. Leave
   voice, style, pacing, structure and the author's choices alone.
2. Where a contradiction could be honestly resolved either way, prefer the
   earlier chapter — it is what the reader already read.
3. Never delete a scene, never add one, never move events between chapters, and
   never resolve something the author deliberately left open.
4. If nothing genuinely contradicts anything, return the text unchanged and say
   so. Returning an "improved" version of a chapter that had no fault is a
   failure of this task, not a bonus.
5. Write in {{language}}, whatever language these instructions are in.

FORMAT
Return only JSON. `text` is the full chapter, corrected or unchanged:

{
  "text": "",
  "changes": [{"was": "", "now": "", "why": ""}]
}
