-- SQL Schema for Supabase (PostgreSQL)
-- Copy and paste this into the Supabase SQL Editor

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  picture TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  region TEXT,
  battery_preference TEXT,
  devices JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create results table
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  profile_name TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create hardware table
CREATE TABLE IF NOT EXISTS hardware (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT, -- 'inverter', 'panel', 'battery'
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
-- Note: These rules are simple. For production, refine based on your needs.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow users to see and modify only their own data)
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own profiles" ON profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own results" ON results FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own hardware" ON hardware FOR ALL USING (user_id = auth.uid());
