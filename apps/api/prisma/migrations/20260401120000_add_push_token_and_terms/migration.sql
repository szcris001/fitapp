-- Add push notification token to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushToken" TEXT;
