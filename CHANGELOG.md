# Changelog

## [1.0.1] - 2026-10-05

- Prepare the first standalone source-release recipe for `tech-progress/dlt-rest-postgres`, branch `release-v1`, root `/`, using dlt `1.30.0`. [VERSION](VERSION) is authoritative; final image/dependency pins are recorded in [Dockerfile](Dockerfile), [Dockerfile.postgres](Dockerfile.postgres), [pyproject.toml](pyproject.toml), and [uv.lock](uv.lock).
- Document precise authenticated orders schema, page-number pagination, merge/lookback, required real API inputs, independent database secrets, private two-service/one-volume topology, and hourly UTC exiting loader.
- Add public-document verification and negative regression tests. Separate historical local proof from independent source/image/live qualification, recipe licensing from upstream/runtime rights, and source release from marketplace publication. Document accepted standard deletion, verified zero compute, and disclosed retention.

A source release does not prove marketplace publication or live Railway qualification. This release must be qualified independently. No current live result, marketplace identifier, or share code is asserted by this changelog.

## [1.0.0] - 2026-10-02

- Historical unpublished local recipe: paginated orders-to-PostgreSQL merge loading, destination-restored completed cursors, isolated interruption/replay, least-privilege denial, failed-source exit, whole-destination dump/restore followed by replay, and offline draft tooling.
- Authenticated synthetic-fixture results qualified the specific local orders contract under earlier pins; they did not establish a real-provider adapter, current-release live qualification, or observed hourly Railway scheduler firing.
