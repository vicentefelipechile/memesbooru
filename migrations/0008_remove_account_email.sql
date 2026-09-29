-- Keep email exclusively for Google sign-ins; remove manually entered addresses and mail storage.
UPDATE users SET email = NULL;
ALTER TABLE users DROP COLUMN email_verified_at;
ALTER TABLE contact_tickets DROP COLUMN email;
DROP TABLE mail_messages;
DROP TABLE mail_thread_users;
DROP TABLE mail_threads;
