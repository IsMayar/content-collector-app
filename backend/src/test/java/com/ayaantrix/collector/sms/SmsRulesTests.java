package com.ayaantrix.collector.sms;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.sms.security.TwilioSignatures;
import com.ayaantrix.collector.sms.service.SmsRules;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

class SmsRulesTests {
    @Test
    void phoneRegionIsUSRatherThanAnyNANP() {
        assertThat(SmsRules.usPhone("+12025550123")).isEqualTo("+12025550123");
        assertThatThrownBy(() -> SmsRules.usPhone("+14165550123"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SmsRules.usPhone("+442079460123"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void countsGsmExtensionAndUtf16Segments() {
        assertThat(SmsRules.segments("a".repeat(160))).isEqualTo(1);
        assertThat(SmsRules.segments("a".repeat(161))).isEqualTo(2);
        assertThat(SmsRules.segments("^".repeat(81))).isEqualTo(2);
        assertThat(SmsRules.segments("中".repeat(70))).isEqualTo(1);
        assertThat(SmsRules.segments("中".repeat(71))).isEqualTo(2);
        assertThat(SmsRules.segments("😀".repeat(36))).isEqualTo(2);
    }

    @Test
    void quietWindowSkipsWeekendsAndUsesDst() {
        String z = "America/New_York";
        assertThat(SmsRules.quiet(Instant.parse("2026-11-03T13:59:59Z"), z)).isTrue();
        assertThat(SmsRules.quiet(Instant.parse("2026-11-03T14:00:00Z"), z)).isFalse();
        assertThat(SmsRules.quiet(Instant.parse("2026-11-04T01:00:00Z"), z)).isTrue();
        assertThat(SmsRules.nextAllowed(Instant.parse("2026-10-31T00:00:00Z"), z))
                .isEqualTo(Instant.parse("2026-11-02T14:00:00Z"));
    }

    @Test
    void signsCanonicalUrlAndEveryDecodedParameter() throws Exception {
        String account = "AC" + "0".repeat(32),
                scope = "MG" + "0".repeat(32),
                url = "https://collector.test/api/v1/webhooks/twilio/inbound",
                token = "synthetic";
        var values =
                new TreeMap<>(
                        Map.of(
                                "AccountSid",
                                account,
                                "MessagingServiceSid",
                                scope,
                                "MessageSid",
                                "SM" + "0".repeat(32),
                                "OptOutType",
                                "STOP",
                                "From",
                                "+12025550123",
                                "NewProviderParameter",
                                "value"));
        var text = new StringBuilder(url);
        values.forEach((k, v) -> text.append(k).append(v));
        var mac = javax.crypto.Mac.getInstance("HmacSHA1");
        mac.init(
                new javax.crypto.spec.SecretKeySpec(
                        token.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String sig =
                Base64.getEncoder()
                        .encodeToString(
                                mac.doFinal(text.toString().getBytes(StandardCharsets.UTF_8)));
        var verifier =
                new TwilioSignatures(token, url, url.replace("inbound", "status"), account, scope);
        assertThat(verifier.valid("inbound", url, null, values, sig)).isTrue();
        assertThat(verifier.valid("inbound", url + "/", null, values, sig)).isFalse();
        values.put("OptOutType", "START");
        assertThat(verifier.valid("inbound", url, null, values, sig)).isFalse();
    }
}
