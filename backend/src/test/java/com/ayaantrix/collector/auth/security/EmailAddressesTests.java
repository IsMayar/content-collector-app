package com.ayaantrix.collector.auth.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.Locale;
import static org.junit.jupiter.api.Assertions.*;

class EmailAddressesTests {
    @ParameterizedTest
    @ValueSource(strings = {" Alex@Example.COM ", "alex@example.com", "\tAlex@Example.Com\n"})
    void normalizesWhitespaceAndCase(String input) {
        assertEquals("alex@example.com", EmailAddresses.normalize(input));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void rejectsMissingValuesWithoutEchoingInput(String input) {
        var error = assertThrows(IllegalArgumentException.class, () -> EmailAddresses.normalize(input));
        assertEquals("Email address is required.", error.getMessage());
    }

    @Test
    void normalizationDoesNotDependOnDefaultLocale() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertEquals("identity@example.com", EmailAddresses.normalize("IDENTITY@EXAMPLE.COM"));
        } finally { Locale.setDefault(previous); }
    }
}
