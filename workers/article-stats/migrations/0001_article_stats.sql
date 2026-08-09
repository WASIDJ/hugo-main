CREATE TABLE article_stats (
    path TEXT PRIMARY KEY,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    completions INTEGER NOT NULL DEFAULT 0 CHECK (completions >= 0),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE article_events (
    path TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('view', 'complete')),
    visitor_hash TEXT NOT NULL,
    event_date TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (path, event_type, visitor_hash, event_date)
) STRICT;

CREATE INDEX article_events_created_at_idx ON article_events (created_at);

CREATE TRIGGER article_events_increment_stats
AFTER INSERT ON article_events
BEGIN
    INSERT INTO article_stats (path, views, completions, updated_at)
    VALUES (
        NEW.path,
        CASE WHEN NEW.event_type = 'view' THEN 1 ELSE 0 END,
        CASE WHEN NEW.event_type = 'complete' THEN 1 ELSE 0 END,
        unixepoch()
    )
    ON CONFLICT(path) DO UPDATE SET
        views = views + excluded.views,
        completions = completions + excluded.completions,
        updated_at = unixepoch();
END;
