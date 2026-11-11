import asyncio

import network

from lib.config import Config
from lib.i18n import t


class WiFi:
    __instance: WiFi | None = None

    _wlan: network.WLAN | None = None

    async def connect(self) -> bool:
        """
        Establish an asynchronous Wi-Fi connection using loaded configurations.

        The method activates the station interface, applies the configured hostname,
        and waits up to 30 seconds for the network connection.

        Returns:
            True if the connection succeeds, otherwise False.
        """
        config = Config.create()
        wifi = config.get("wifi")
        hostname = config.get("device", {}).get("name", "Rozumari")

        self._wlan = network.WLAN(network.STA_IF)

        self._wlan.active(False)
        await asyncio.sleep(0.5)

        self._wlan.active(True)
        await asyncio.sleep(0.5)

        network.hostname(hostname)

        ssid = wifi.get("ssid")
        password = wifi.get("password")
        print(t("wifi.connecting", ssid=ssid), end="")

        timeout = 30
        self._wlan.connect(ssid, password)
        while not self._wlan.isconnected() and timeout > 0:
            await asyncio.sleep(1)
            print(".", end="")
            timeout -= 1

        if self._wlan.isconnected():
            print("\n" + t("wifi.connected", ip=self._wlan.ifconfig()[0]))
            return True
        else:
            print("\n" + t("wifi.failed"))
            return False

    def disconnect(self) -> None:
        """
        Disconnect from the current Wi-Fi network and deactivate the station interface.

        Returns:
            None
        """
        if self._wlan is None:
            self._wlan = network.WLAN(network.STA_IF)

        if self._wlan.isconnected():
            self._wlan.disconnect()
        self._wlan.active(False)

    def reset(self) -> None:
        """
        Reset the Wi-Fi configuration to default values and disconnect from any active network.

        Returns:
            None
        """
        if self._wlan is None:
            self._wlan = network.WLAN(network.STA_IF)

        self._wlan.deinit()

    @classmethod
    async def check_connection(cls, ssid: str, password: str) -> bool:
        """
        Test specific wireless credentials asynchronously without altering primary network states.

        Verification process:
            - Temporarily disconnects active interface and attempts binding to the target SSID.
            - Polls connection status codes within a monitored timeout window.
            - Cleans up interface states upon completion.

        Args:
            ssid: Target wireless network SSID string.
            password: Wireless network password string.

        Returns:
            True if credentials authenticate successfully, False otherwise.
        """
        if not ssid or not password:
            return False

        wlan = network.WLAN(network.STA_IF)

        wlan.active(False)
        await asyncio.sleep(0.5)

        wlan.active(True)
        await asyncio.sleep(0.5)

        networks = wlan.scan()
        print(t("wifi.networks", networks=[net[0].decode() for net in networks]))

        try:
            print(t("wifi.attempting", ssid=ssid))
            wlan.connect(ssid, password)
        except Exception as e:
            print(t("wifi.connect_error", error=e))
            wlan.active(False)
            return False

        for _ in range(30):
            if wlan.isconnected():
                print(t("wifi.valid_credentials", ip=wlan.ifconfig()[0]))
                wlan.disconnect()
                wlan.active(False)
                return True

            status = wlan.status()
            if status in (201, 202, 203) or status < 0:
                print(t("wifi.connection_failed_status", status=status))
                break

            await asyncio.sleep(0.5)

        wlan.disconnect()
        wlan.active(False)
        return False

    @classmethod
    def create(cls) -> WiFi:
        if cls.__instance is None:
            cls.__instance = WiFi()
        return cls.__instance
