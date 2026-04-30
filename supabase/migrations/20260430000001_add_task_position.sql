ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position float8;

-- Seed initial positions based on creation order (earlier = smaller position)
UPDATE tasks
SET position = extract(epoch from created_at)
WHERE position IS NULL;
