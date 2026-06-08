Loss/Escape Tracker browser script for TORN.

## Google Drive backup

The tracker can back up and restore its local data to Google Drive's hidden app data folder. Create a Google OAuth Web Client, add the Torn origin you use as an authorized redirect URI, then paste the Client ID into Settings.

- If you use `https://www.torn.com`, add `https://www.torn.com/`.
- If you use `https://torn.com`, add `https://torn.com/`.

Use **Backup to Google** to upload `torn-le-tracker-backup.json`; use **Restore from Google** to replace the current local tracker data from that file.
