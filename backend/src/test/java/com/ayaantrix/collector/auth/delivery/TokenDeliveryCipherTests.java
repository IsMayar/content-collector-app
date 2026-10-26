package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.common.error.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class TokenDeliveryCipherTests {
    private TokenDeliveryCipher cipher() {
        byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);
        return new TokenDeliveryCipher(Base64.getEncoder().encodeToString(key),"test-v1");
    }
    @Test void authenticatedEncryptionRoundTripsWithRandomNonces() {
        var cipher=cipher();var job=UUID.randomUUID();var token=UUID.randomUUID();String raw="A".repeat(43);
        byte[] first=cipher.encrypt(raw,job,token);byte[] second=cipher.encrypt(raw,job,token);
        assertThat(first).isNotEqualTo(second);assertThat(new String(first,java.nio.charset.StandardCharsets.UTF_8)).doesNotContain(raw);
        assertThat(cipher.decrypt(first,"test-v1",job,token)).isEqualTo(raw);
    }
    @Test void rejectsTamperingSwappedMetadataAndWrongKeys() {
        var cipher=cipher();var job=UUID.randomUUID();var token=UUID.randomUUID();byte[] encrypted=cipher.encrypt("A".repeat(43),job,token);
        assertThatThrownBy(()->cipher.decrypt(encrypted,"test-v1",UUID.randomUUID(),token)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->cipher.decrypt(encrypted,"other",job,token)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->cipher().decrypt(encrypted,"test-v1",job,token)).isInstanceOf(IllegalStateException.class);
        encrypted[encrypted.length-1]^=1;
        assertThatThrownBy(()->cipher.decrypt(encrypted,"test-v1",job,token)).isInstanceOf(IllegalStateException.class);
    }
    @Test void missingKeyDisablesIssuanceAndInvalidConfigurationNeverEchoesSecret() {
        var cipher=new TokenDeliveryCipher("","test-v1");
        assertThatThrownBy(cipher::requireConfigured).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.getStatus().value()).isEqualTo(503));
        assertThatThrownBy(()->new TokenDeliveryCipher("invalid-secret","test-v1"))
            .isInstanceOf(IllegalStateException.class).hasMessage("Invalid delivery encryption configuration.");
    }
}
