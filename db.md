
fb_comments

id

page_id

comment_id

commenter_name

comment_text

created_at

fb_pages

id

user_id

page_id

access_token

page_name

created_at

replies

id

comment_id

reply_text

status

sent_at

resource_vectors

id

resource_id

content

embedding

resources

id

user_id

title

file_url

resource_type

created_at

users

id

fb_user_id

name

email

access_token

created_at





USE test;

-- Drop existing in correct dependency order
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS fb_comments;
DROP TABLE IF EXISTS resource_vectors;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS fb_pages;
DROP TABLE IF EXISTS users;

-- ==============================
-- Users: FB-only auth
-- ==============================
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  fb_user_id VARCHAR(255) UNIQUE NOT NULL, -- Facebook's user ID
  name VARCHAR(255),
  email VARCHAR(255),
  access_token TEXT NOT NULL, -- long-lived user token
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- Facebook Pages linked to users
-- ==============================
CREATE TABLE fb_pages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  page_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  page_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_page (page_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- User Resources (FAQ, Products, etc.)
-- ==============================
CREATE TABLE resources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(255),
  file_url TEXT,
  resource_type ENUM('faq','product','discount','other') DEFAULT 'other',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- Vector Embeddings of Resources
-- ==============================
CREATE TABLE resource_vectors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  resource_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  embedding JSON NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- FB Comments on Pages
-- ==============================
CREATE TABLE fb_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  page_id BIGINT NOT NULL,
  comment_id VARCHAR(255) NOT NULL,
  commenter_name VARCHAR(255),
  comment_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id) ON DELETE CASCADE
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- AI Replies to Comments
-- ==============================
CREATE TABLE replies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  reply_text TEXT NOT NULL,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  FOREIGN KEY (comment_id) REFERENCES fb_comments(id) ON DELETE CASCADE
) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
