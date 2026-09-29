-- Roles grant independent permissions; existing trusted accounts retain their access as administrators.
CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  managed INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0, 1))
) STRICT;
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
) STRICT;
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
) STRICT;
CREATE INDEX idx_user_roles_role ON user_roles(role_id, user_id);

INSERT INTO roles (id, name, position, managed) VALUES (1, 'Administrator', 100, 1), (2, 'Moderator', 50, 0), (3, 'Contributor', 10, 0), (4, 'Member', 0, 1);
INSERT INTO role_permissions (role_id, permission) VALUES
  (1, 'manage_roles'), (1, 'moderate'), (1, 'edit_tags'), (1, 'manage_artists'), (1, 'manage_forum'), (1, 'upload_video'), (1, 'view_video'), (1, 'upload_without_cooldown'),
  (2, 'moderate'), (2, 'edit_tags'), (2, 'manage_artists'), (2, 'manage_forum'), (2, 'view_video'),
  (3, 'upload_without_cooldown'),
  (4, 'upload_post'), (4, 'comment'), (4, 'vote'), (4, 'favorite'), (4, 'report'),
  (4, 'create_pool'), (4, 'create_topic'), (4, 'edit_wiki'), (4, 'contact');
INSERT INTO user_roles (user_id, role_id)
SELECT id, CASE WHEN rank = 'trusted' THEN 1 WHEN rank = 'normal' THEN 3 ELSE 4 END FROM users;
INSERT INTO user_roles (user_id, role_id) SELECT id, 4 FROM users WHERE rank IN ('trusted', 'normal');

DROP TABLE user_rank_history;
ALTER TABLE users DROP COLUMN rank;
ALTER TABLE users DROP COLUMN trust_score;

-- Direct inserts, including registrations, always receive the base role.
CREATE TRIGGER users_default_role AFTER INSERT ON users BEGIN
  INSERT INTO user_roles (user_id, role_id) VALUES (NEW.id, 4);
END;
