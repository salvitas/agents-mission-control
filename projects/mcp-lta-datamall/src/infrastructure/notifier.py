from __future__ import annotations

import subprocess


class Notifier:
    def send(self, channel: str, target: str, text: str) -> None:
        raise NotImplementedError


class ConsoleNotifier(Notifier):
    def send(self, channel: str, target: str, text: str) -> None:
        print(f"[{channel}] -> {target}: {text}")


class WacliNotifier(Notifier):
    """WhatsApp notifier via wacli JID/number."""

    def send(self, channel: str, target: str, text: str) -> None:
        if channel != "whatsapp":
            return
        subprocess.run([
            "wacli", "send", "text", "--to", target, "--message", text
        ], check=True)


class OpenClawMessageNotifier(Notifier):
    """Telegram notifier placeholder for OpenClaw message routing."""

    def send(self, channel: str, target: str, text: str) -> None:
        if channel != "telegram":
            return
        # TODO: bind to official OpenClaw message send bridge for MCP runtime.
        print(f"[telegram] -> {target}: {text}")
