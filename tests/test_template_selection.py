import unittest
from bot.app import template_keyboard


class TemplateKeyboardTests(unittest.TestCase):
    def test_buttons_use_template_keys_not_labels(self):
        markup = template_keyboard([
            {"template_key": "blue-special", "label": "Bleu spécial"},
            {"template_key": "green", "label": "Vert"},
        ])
        self.assertEqual(markup.inline_keyboard[0][0].text, "Bleu spécial")
        self.assertEqual(markup.inline_keyboard[0][0].callback_data, "template:blue-special")
        self.assertEqual(markup.inline_keyboard[1][0].callback_data, "template:green")

    def test_menu_button_is_appended(self):
        markup = template_keyboard([{"template_key": "blue", "label": "Bleu"}])
        self.assertEqual(markup.inline_keyboard[-1][0].callback_data, "home")


if __name__ == "__main__":
    unittest.main()
