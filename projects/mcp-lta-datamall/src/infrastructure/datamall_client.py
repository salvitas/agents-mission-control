"""LTA DataMall API client (stub)."""

class DataMallClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def bus_arrival(self, stop_code: str, service_no: str | None = None):
        raise NotImplementedError

    def bus_route(self, service_no: str, direction: int | None = None):
        raise NotImplementedError
