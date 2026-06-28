# Real ESPN Live Monitoring

B59 uses ESPN live data through a local persistent worker. ESPN live is treated as real best-effort live feed, not as a complete pre-match API.

Operational state is persisted as worker runs, monitoring sessions, fixture states, leases, recovery reports, and post-match outcomes. Missing pre-match data, missing lineup, unknown injury, and unknown suspension remain limitations.
