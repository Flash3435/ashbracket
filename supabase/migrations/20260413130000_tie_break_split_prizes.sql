-- Replace legacy "organizer decides" tie-break copy with split-prize wording.

UPDATE public.pools
SET tie_break_note = 'If two or more users finish with the same total score, the prize money for the tied positions is combined and split equally among those tied users.

Examples:
• If two users tie for 1st, they split 1st and 2nd prize money evenly.
• If three users tie across 2nd to 4th, they split the combined 2nd, 3rd, and 4th prize money evenly.'
WHERE btrim(tie_break_note) = 'If total points are tied, the organizer decides the tie-break rule.'
   OR tie_break_note ILIKE '%organizer decides%';
