import json

from lib.config import Config


class Translation:
    __instance: Translation | None = None

    def __init__(self, locale_dir: str = "/data/locales") -> None:
        self._locale_dir = locale_dir
        self._language = ""
        self._translations: dict = {}
        self._fallback: dict = {}
        self._load_language("en")

    def _load_file(self, language: str) -> dict:
        """
        Load the translation file for the specified language.

        Args:
            language: The language code (e.g., 'en', 'es') for which to load the translation file.

        Returns:
            A dictionary containing the translation key-value pairs for the specified language.
        """

        path = f"{self._locale_dir}/{language}.json"
        try:
            with open(path, "r") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception as error:
            print(f"[i18n] Failed to load locale '{language}': {error}")
            return {}

    def _load_language(self, language: str) -> None:
        """
        Load the translation files for the specified language and set up the fallback.

        Args:
            language: The language code (e.g., 'en', 'es') for which to load the translation files.
        """
        language = str(language or "en").lower().split("-")[0]
        self._fallback = self._load_file("en")
        self._translations = (
            self._fallback if language == "en" else self._load_file(language)
        )
        self._language = language

    def _sync_language(self) -> None:
        """
        Synchronize the current language with the configuration settings.
        This method checks the current language setting in the configuration and loads
        the appropriate translation files if the language has changed.
        """
        config = Config.create()
        language = config.get("language", "en")
        language = str(language or "en").lower().split("-")[0]
        if language != self._language:
            self._load_language(language)

    def translate(self, key: str, **params) -> str:
        """
        Translate the given key into the current language, applying any provided parameters.

        Args:
            key: The translation key to look up.
            params: Optional keyword arguments to format the translation string.

        Returns:
            The translated string with parameters applied, or the key itself if no translation is found.
        """
        self._sync_language()

        value = self._translations.get(key)
        if value is None:
            value = self._fallback.get(key, key)

        value = str(value)
        if params:
            try:
                value = value.format(**params)
            except Exception:
                pass
        return value

    def use(self):
        """
        Return the translate method for use as a callable function.

        Returns:
            A callable function that translates keys into the current language.
        """
        return self.translate

    def __call__(self, key: str, **params) -> str:
        return self.translate(key, **params)

    @classmethod
    def create(
        cls, locale_dir: str = "/data/locales", force: bool = False
    ) -> Translation:
        if cls.__instance is None or force:
            cls.__instance = cls(locale_dir)
        return cls.__instance


t = Translation.create().use()
