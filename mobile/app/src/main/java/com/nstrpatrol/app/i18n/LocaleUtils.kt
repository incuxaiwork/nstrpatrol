package com.nstrpatrol.app.i18n

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

data class LanguageOption(
    val code: String,
    val displayName: String,
)

private const val PREFS = "nstr_locale"
private const val KEY = "code"

private val LANGUAGES = listOf(
    LanguageOption(code = "en", displayName = "English"),
    LanguageOption(code = "hi", displayName = "हिन्दी"),
    LanguageOption(code = "te", displayName = "తెలుగు"),
    LanguageOption(code = "bn", displayName = "বাংলা"),
)

object SupportedLanguages {

    fun options(): List<LanguageOption> = LANGUAGES

    fun currentCode(context: Context): String = prefs(context).getString(KEY, "en") ?: "en"

    fun apply(context: Context, code: String) {
        prefs(context).edit().putString(KEY, code).apply()
    }

    /** Wraps a base context so its resources resolve in the persisted locale. */
    fun wrapContext(context: Context): Context {
        val code = prefs(context).getString(KEY, "en") ?: "en"
        val locale = Locale.forLanguageTag(code)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        return context.createConfigurationContext(config)
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
