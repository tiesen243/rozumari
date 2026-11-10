import asyncio

import ntptime
from machine import Pin

from lib.config import Config
from lib.i18n import t
from lib.pins import Pins
from modules.ble import BLE
from modules.wifi import WiFi
from services.display import Display
from services.sync_info import SyncInfo
from tasks.link import Link
from tasks.schedules import Schedules
from tasks.streaming import Streaming
from tasks.sync_schedule import SyncSchedule

CONFIG_MODE_VALUE = 0
NORMAL_MODE_VALUE = 1
SWITCH_DEBOUNCE_MS = 50


class Bootstrap:
    _ble: BLE | None = None
    _wifi: WiFi

    _streaming: Streaming
    _schedules: Schedules
    _sync_schedule: SyncSchedule
    _sync_info: SyncInfo
    _display: Display
    _link: Link

    _switch: Pin
    _switch_flag: asyncio.ThreadSafeFlag

    def __init__(self) -> None:
        pins = Pins.create()
        self._switch = pins.switch
        self._switch_flag = asyncio.ThreadSafeFlag()
        self._switch.irq(
            trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING,
            handler=self._switch_irq_handler,
        )

        self._wifi = WiFi.create()
        self._streaming = Streaming.create()
        self._schedules = Schedules.create()
        self._sync_schedule = SyncSchedule.create()
        self._sync_info = SyncInfo.create()
        self._display = Display.create()
        self._link = Link.create()

    def _switch_irq_handler(self, pin: Pin) -> None:
        self._switch_flag.set()

    async def _wait_for_switch_change(
        self, current_mode: int, mode_task: asyncio.Task
    ) -> None:
        while not mode_task.done():
            await self._switch_flag.wait()
            await asyncio.sleep(SWITCH_DEBOUNCE_MS / 1000)

            if self._switch.value() == current_mode:
                continue

            mode_task.cancel()
            return

    async def _config_mode(self) -> None:
        """Run Config Mode (BLE) until the mode switch is released."""
        try:
            self._ble = BLE.create()
            self._display.show_config_mode()

            if not self._ble.is_ready():
                self._ble.activate()

            if self._ble.is_connected():
                self._ble.disconnect()

            self._ble.start_advertising()
            print(t("config.started"))

            while True:
                await asyncio.sleep(3600)
        except asyncio.CancelledError:
            raise

        except Exception as e:
            print(t("config.error", error=e))

        finally:
            if self._ble and self._ble.is_connected():
                self._ble.stop()
            print(t("config.stopped"))

    async def _normal_mode(self) -> None:
        """Run Normal Mode (WiFi, Sync, Tasks) and terminate cleanly when stop_event is set."""
        _ = Config.create(force=True)
        self._display.show_boot_logo()

        retry_count, max_retries, is_connected = 0, 3, False
        while retry_count < max_retries:
            is_connected = await self._wifi.connect()
            if is_connected:
                break
            retry_count += 1
            print(
                t(
                    "setup.wifi_failed_attempt",
                    attempt=retry_count,
                    max_retries=max_retries,
                )
            )
            self._wifi.reset()
            await asyncio.sleep(2)

        if not is_connected:
            print(t("setup.wifi_failed_max"))
            return

        print(t("setup.syncing_time"))
        retry_count, max_retries = 0, 3
        while is_connected and retry_count < max_retries:
            try:
                ntptime.settime()
                print(t("setup.time_synced"))
                break
            except Exception as e:
                retry_count += 1
                print(
                    t(
                        "setup.time_sync_failed",
                        attempt=retry_count,
                        max_retries=max_retries,
                        error=e,
                    )
                )
                await asyncio.sleep(2)

        print(t("setup.syncing_device"))
        _ = await self._sync_info.execute()

        print(t("setup.syncing_schedules"))
        _ = await self._sync_schedule.execute()

        print(t("normal.setup_complete"))

        tasks = [
            asyncio.create_task(self._display.start()),
            asyncio.create_task(self._link.start()),
            asyncio.create_task(self._sync_schedule.start()),
            asyncio.create_task(self._streaming.start()),
            asyncio.create_task(self._schedules.start()),
        ]

        try:
            while True:
                await asyncio.sleep(3600)
        finally:
            print(t("normal.cleaning"))
            for task in tasks:
                task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)
            print(t("normal.stopped"))

    async def _run_mode(self, mode: int) -> None:
        mode_name = "Unknown Mode"

        if mode == CONFIG_MODE_VALUE:
            mode_name = "Config Mode"
            mode_coro = self._config_mode()
        elif mode == NORMAL_MODE_VALUE:
            mode_name = "Normal Mode"
            mode_coro = self._normal_mode()
        else:
            raise ValueError("Invalid mode value")

        mode_task = asyncio.create_task(mode_coro)
        switch_task = asyncio.create_task(self._wait_for_switch_change(mode, mode_task))

        try:
            await mode_task

        except asyncio.CancelledError:
            print(f"{mode_name} MODE interrupted")

        except Exception as error:
            print(t("error.unexpected", error=error))

        finally:
            switch_task.cancel()
            await asyncio.gather(
                switch_task,
                return_exceptions=True,
            )

    async def start(self) -> None:
        """Main loop managing seamless soft transitions between Config Mode and Normal Mode."""
        while True:
            current_mode = self._switch.value()
            await self._run_mode(current_mode)
            await self.stop()
            await asyncio.sleep(1)

    async def stop(self) -> None:
        if self._ble and self._ble.is_connected():
            self._ble.stop()
        if self._wifi:
            self._wifi.disconnect()

        await self._display.stop()
        await self._link.stop()
        await self._sync_schedule.stop()
        await self._streaming.stop()
        await self._schedules.stop()


if __name__ == "__main__":
    bootstrap = Bootstrap()

    try:
        asyncio.run(bootstrap.start())
    except KeyboardInterrupt:
        print(t("cleanup.interrupted"))
    except Exception as error:
        print(t("error.unexpected", error=error))
    finally:
        asyncio.run(bootstrap.stop())
        print(t("cleanup.stopped"))
