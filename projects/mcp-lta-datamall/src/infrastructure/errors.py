from __future__ import annotations


class TransitError(RuntimeError):
    code = "TRANSIT_ERROR"


class ConfigError(TransitError):
    code = "CONFIG_ERROR"


class UpstreamHttpError(TransitError):
    code = "UPSTREAM_HTTP_ERROR"


class UpstreamRateLimitError(TransitError):
    code = "UPSTREAM_RATE_LIMIT"


class UpstreamNetworkError(TransitError):
    code = "UPSTREAM_NETWORK_ERROR"


class DataNormalizationError(TransitError):
    code = "NORMALIZATION_ERROR"
