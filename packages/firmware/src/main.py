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
SWITCH_DEBOUNCE = 0.01


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

        # Thread-safe signal for GPIO interrupt.
        self._switch_flag = asyncio.ThreadSafeFlag()

        # Initialize services.
        self._wifi = WiFi.create()
        self._streaming = Streaming.create()
        self._schedules = Schedules.create()
        self._sync_schedule = SyncSchedule.create()
        self._sync_info = SyncInfo.create()
        self._display = Display.create()
        self._link = Link.create()

        # Register GPIO interrupt.
        self._switch.irq(
            handler=self._on_switch_changed,
            trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
        )

    # ---------------------------------------------------------
    # SWITCH INTERRUPT
    # ---------------------------------------------------------

    def _on_switch_changed(self, pin: Pin) -> None:
        """GPIO interrupt callback."""
        self._switch_flag.set()

    async def _watch_switch(
        self,
        current_mode: int,
        mode_task: asyncio.Task,
    ) -> None:
        """Wait for a physical switch change and interrupt current mode."""

        while not mode_task.done():
            await self._switch_flag.wait()

            # Debounce.
            await asyncio.sleep(SWITCH_DEBOUNCE)

            new_mode = self._switch.value()

            # Ignore bouncing.
            if new_mode == current_mode:
                continue

            if new_mode == CONFIG_MODE_VALUE:
                print(t("normal.switch_triggered"))
            else:
                print(t("config.stopped"))

            print("Switch changed. Interrupting current mode...")

            mode_task.cancel()
            return

    # ---------------------------------------------------------
    # CONFIG MODE
    # ---------------------------------------------------------

    async def _config_mode(self, stop_event: asyncio.Event) -> None:
        try:
            self._ble = BLE.create()
            self._display.show_config_mode()

            if not self._ble.is_ready():
                self._ble.activate()

            if self._ble.is_connected():
                self._ble.disconnect()

            self._ble.start_advertising()
            print(t("config.started"))

            # Wait until mode is interrupted.
            await stop_event.wait()

        except asyncio.CancelledError:
            raise

        except Exception as e:
            print(t("config.error", error=e))

        finally:
            if self._ble:
                self._ble.stop()

            print(t("config.stopped"))

    # ---------------------------------------------------------
    # NORMAL MODE
    # ---------------------------------------------------------

    async def _normal_mode(self, stop_event: asyncio.Event) -> None:
        self._display.show_boot_logo()

        _ = Config.create(force=True)

        retry_count, max_retries, is_connected = 0, 3, False

        # Connect WiFi.
        while retry_count < max_retries and not stop_event.is_set():
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

        if stop_event.is_set():
            return

        if not is_connected:
            print(t("setup.wifi_failed_max"))
            return

        # Synchronize time.
        print(t("setup.syncing_time"))

        retry_count, max_retries = 0, 3

        while is_connected and retry_count < max_retries and not stop_event.is_set():
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

        if stop_event.is_set():
            return

        # Synchronize device information.
        print(t("setup.syncing_device"))
        _ = await self._sync_info.execute()

        if stop_event.is_set():
            return

        # Synchronize schedules.
        print(t("setup.syncing_schedules"))
        _ = await self._sync_schedule.execute()

        if stop_event.is_set():
            return

        print(t("normal.setup_complete"))

        # Background tasks.
        tasks = [
            asyncio.create_task(self._display.start()),
            asyncio.create_task(self._link.start()),
            asyncio.create_task(self._sync_schedule.start()),
            asyncio.create_task(self._streaming.start()),
            asyncio.create_task(self._schedules.start()),
        ]

        try:
            while not stop_event.is_set():
                await asyncio.sleep(0.5)

        finally:
            print(t("normal.cleaning"))

            for task in tasks:
                task.cancel()

            await asyncio.gather(
                *tasks,
                return_exceptions=True,
            )

            print(t("normal.stopped"))

    # ---------------------------------------------------------
    # MODE MANAGER
    # ---------------------------------------------------------

    async def _run_mode(self, mode: int) -> None:
        """Run current mode and interrupt it when switch changes."""

        stop_event = asyncio.Event()

        if mode == CONFIG_MODE_VALUE:
            mode_name = "CONFIG"
            mode_coro = self._config_mode(stop_event)
        else:
            mode_name = "NORMAL"
            mode_coro = self._normal_mode(stop_event)

        print(
            "\n"
            + (
                t("mode.enter_config")
                if mode == CONFIG_MODE_VALUE
                else t("mode.enter_normal")
            )
        )

        mode_task = asyncio.create_task(mode_coro)

        switch_task = asyncio.create_task(self._watch_switch(mode, mode_task))

        try:
            await mode_task

        except asyncio.CancelledError:
            print(f"{mode_name} MODE interrupted")

        except Exception as error:
            print(t("error.unexpected", error=error))

        finally:
            stop_event.set()

            switch_task.cancel()

            await asyncio.gather(
                switch_task,
                return_exceptions=True,
            )

            await self.stop()

    # ---------------------------------------------------------
    # MAIN LOOP
    # ---------------------------------------------------------

    async def start(self) -> None:
        """Main loop managing mode transitions."""

        while True:
            current_mode = self._switch.value()

            await self._run_mode(current_mode)

            await asyncio.sleep(0.1)

    # ---------------------------------------------------------
    # CLEANUP
    # ---------------------------------------------------------

    async def stop(self) -> None:
        try:
            if self._ble:
                self._ble.stop()

            if self._wifi:
                self._wifi.disconnect()

            await self._display.stop()
            await self._link.stop()
            await self._sync_schedule.stop()
            await self._streaming.stop()
            await self._schedules.stop()
        except:  # noqa: E722
            pass


# -------------------------------------------------------------
# ENTRY POINT
# -------------------------------------------------------------

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
