import unittest
from bot.profile_validation import clean_optional_text, normalize_whatsapp


class NormalizeWhatsappTests(unittest.TestCase):
    def test_removes_spaces_and_punctuation(self):
        self.assertEqual(normalize_whatsapp("+242 06-123-45-67"), "242061234567")

    def test_rejects_too_short_number(self):
        self.assertIsNone(normalize_whatsapp("123-45"))

    def test_rejects_too_long_number(self):
        self.assertIsNone(normalize_whatsapp("1" * 16))

    def test_accepts_minimum_and_maximum_lengths(self):
        self.assertEqual(normalize_whatsapp("1" * 8), "1" * 8)
        self.assertEqual(normalize_whatsapp("1" * 15), "1" * 15)


class CleanOptionalTextTests(unittest.TestCase):
    def test_trims_and_removes_control_characters(self):
        self.assertEqual(clean_optional_text("  Ryah\nOtaku\t ", max_length=40), "RyahOtaku")

    def test_enforces_length_limit(self):
        self.assertEqual(clean_optional_text("abcdef", max_length=3), "abc")


if __name__ == "__main__":
    unittest.main()
