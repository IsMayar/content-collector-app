package com.ayaantrix.collector.auth.security;

import com.ayaantrix.collector.common.error.ApiException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class RefreshTokenHashes {
    private final byte[] pepper;
    private final SecureAccountTokens tokens;
    public RefreshTokenHashes(SecureAccountTokens tokens,@Value("${collector.auth.token-hash-pepper:}") String encoded){
        this.tokens=tokens;
        try{pepper=encoded.isBlank()?null:Base64.getDecoder().decode(encoded);
            if(pepper!=null && pepper.length!=32)throw new IllegalArgumentException();
        }catch(IllegalArgumentException invalid){throw new IllegalStateException("Invalid refresh token hashing configuration.");}
    }
    public void requireConfigured(){if(pepper==null)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"AUTH_UNAVAILABLE","Account sign-in is temporarily unavailable.");}
    public String digest(String raw){
        requireConfigured();tokens.digest(raw); // Reuse the existing strict 256-bit capability format validation.
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(pepper,"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
        }catch(java.security.GeneralSecurityException error){throw new IllegalStateException("Refresh token hashing is unavailable.");}
    }
}
