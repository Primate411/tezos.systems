-- Supabase Schema for Tezos Systems Historical Data
-- Run this in Supabase SQL Editor to create the necessary table and policies

-- Create historical data table
CREATE TABLE tezos_history (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Priority metrics (displayed in sparklines and main charts)
  tz4_bakers INTEGER,
  tz4_percentage NUMERIC(5,2),
  staking_ratio NUMERIC(5,2),
  total_bakers INTEGER,
  current_issuance_rate NUMERIC(5,2),
  total_supply NUMERIC(12,2),

  -- Contextual metrics
  cycle INTEGER,
  tx_volume_24h INTEGER,
  delegated_ratio NUMERIC(5,2),
  total_burned NUMERIC(12,2)
);

-- Create index for faster time-range queries
CREATE INDEX idx_tezos_history_timestamp ON tezos_history(timestamp DESC);

-- Add comment for documentation
COMMENT ON TABLE tezos_history IS 'Historical Tezos network statistics collected every 2 hours via GitHub Actions';

-- Enable Row Level Security (required for public access)
ALTER TABLE tezos_history ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow public read access
-- This allows the frontend to fetch historical data
CREATE POLICY "Allow public read access"
  ON tezos_history
  FOR SELECT
  USING (true);

-- Create policy: Allow public insert access
-- This allows GitHub Actions to store new data points
CREATE POLICY "Allow public insert access"
  ON tezos_history
  FOR INSERT
  WITH CHECK (true);

-- Verify setup
-- Run these queries to confirm everything is working:

-- Check table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tezos_history';

-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'tezos_history';

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'tezos_history';
