# API contract stability

Treat any change to an existing HTTP route's signature — its path, method,
request body shape, response shape, or status codes — as a breaking change
unless the diff also updates every caller. Flag a route signature change as a
breaking-change finding even when the PR description doesn't mention it.
