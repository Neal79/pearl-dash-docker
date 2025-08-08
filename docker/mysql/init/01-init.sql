-- Pearl Dashboard Database Initialization
-- This script runs automatically when the database container starts for the first time

-- Set timezone
SET time_zone = '+00:00';

-- Create additional database if needed (optional)
-- CREATE DATABASE IF NOT EXISTS pearl_dash_test;

-- Grant additional permissions if needed
GRANT ALL PRIVILEGES ON pearl_dash.* TO 'pearldashuser'@'%';
FLUSH PRIVILEGES;

-- You can add any initial data or schema modifications here
-- For example:
-- INSERT INTO users (name, email, password) VALUES ('Admin', 'admin@example.com', '$2y$10$...');
