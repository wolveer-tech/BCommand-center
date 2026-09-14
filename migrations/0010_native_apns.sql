-- Store an APNs address against the existing paired device. The bearer device
-- credential is still required to register or replace this token.
ALTER TABLE transfer_devices ADD COLUMN apns_token TEXT;
ALTER TABLE transfer_devices ADD COLUMN apns_updated_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS transfer_devices_apns_token ON transfer_devices(apns_token) WHERE apns_token IS NOT NULL;
