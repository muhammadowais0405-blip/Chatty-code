-- Re-classify SillyTavern narrator/system/comment messages that were imported
-- before system messages were detected (is_user was stored as 0).
UPDATE messages
   SET is_user = 2
 WHERE is_user = 0
   AND json_valid(raw_json)
   AND json_extract(raw_json, '$.is_system') = 1
   AND json_type(raw_json, '$.extra.type') = 'text';