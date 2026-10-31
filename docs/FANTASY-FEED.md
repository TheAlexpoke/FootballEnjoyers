# Retired fantasy feed integration

The direct Sleeper/feed integration has been replaced by administrator score entry and locally processed screenshot recognition. No provider endpoint, API key or scheduled scoring worker is needed.

See [the screenshot operating guide](SCREENSHOT-SCORING.md). Existing CRON_SECRET, FANTASY_FEED_URL and FANTASY_FEED_TOKEN values can be removed from deployment configuration. Stop any previously running fantasy worker. The old cron endpoint no longer updates tournament data.
