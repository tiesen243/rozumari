import json


class Config:
    __instance: Config | None = None

    def __init__(self, file_path: str) -> None:
        self._file_path = file_path
        self._config = self._load()

    def get(self, key: str, default: str | int | dict | None = None):
        """
        Get the value associated with the specified key from the configuration.

        Args:
            key: The configuration key to retrieve.
            default: The default value to return if the key is not found.


        Returns:
            The value associated with the key, or the default value if the key is not found.
        """
        return self._config.get(key, default)

    def set(self, key: str, value: str | int | dict) -> bool:
        """
        Set the value for the specified key in the configuration and save it to the file.

        Args:
            key: The configuration key to set.
            value: The value to associate with the key.

        Returns:
            True if the configuration was saved successfully, False otherwise.
        """
        self._config[key] = value
        try:
            with open(self._file_path, "w") as f:
                json.dump(self._config, f)
            return True
        except Exception as e:
            from lib.i18n import t

            print(t("config.save_error", path=self._file_path, error=e))
            return False

    def _load(self) -> dict:
        """
        Load the configuration from the JSON file.

        Returns:
            A dictionary containing the configuration data.
        """
        with open(self._file_path, "r") as f:
            self._config = json.load(f)
        return self._config

    @classmethod
    def create(
        cls, file_path: str = "/data/config.json", force: bool = False
    ) -> Config:
        if cls.__instance is None or force:
            cls.__instance = cls(file_path)
        return cls.__instance
