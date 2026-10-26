package com.ayaantrix.collector.auth.delivery;

import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;

@Component
public class TokenDeliveryCipher {
    private final SecretKeySpec key;
    private final String keyId;
    private final SecureRandom random = new SecureRandom();
    public TokenDeliveryCipher(@Value("${collector.delivery.encryption-key:}") String encoded,
            @Value("${collector.delivery.key-id:local-v1}") String keyId) {
        try {
            this.keyId = keyId;
            if (!keyId.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException();
            byte[] bytes = encoded.isBlank() ? null : Base64.getDecoder().decode(encoded);
            if (bytes != null && bytes.length != 32) throw new IllegalArgumentException();
            this.key = bytes == null ? null : new SecretKeySpec(bytes,"AES");
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("Invalid delivery encryption configuration.");
        }
    }
    public void requireConfigured() {
        if (key == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "EMAIL_DELIVERY_UNAVAILABLE", "Account registration is temporarily unavailable.");
    }
    public String keyId() { return keyId; }
    public byte[] encrypt(String raw, UUID jobId, UUID tokenId) {
        requireConfigured();
        byte[] nonce = new byte[12]; random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,key,new GCMParameterSpec(128,nonce));
            cipher.updateAAD(aad(jobId,tokenId));
            byte[] encrypted = cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8));
            byte[] envelope = Arrays.copyOf(nonce,nonce.length+encrypted.length);
            System.arraycopy(encrypted,0,envelope,nonce.length,encrypted.length);
            return envelope;
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException("Token delivery encryption failed.");
        }
    }
    public String decrypt(byte[] envelope, String storedKeyId, UUID jobId, UUID tokenId) {
        requireConfigured();
        if (!keyId.equals(storedKeyId) || envelope == null || envelope.length < 29)
            throw new IllegalStateException("Token delivery payload is unavailable.");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOf(envelope,12)));
            cipher.updateAAD(aad(jobId,tokenId));
            return new String(cipher.doFinal(envelope,12,envelope.length-12),StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException("Token delivery payload is unavailable.");
        }
    }
    private byte[] aad(UUID jobId, UUID tokenId) {
        return ("verification-v1:"+jobId+":"+tokenId).getBytes(StandardCharsets.UTF_8);
    }
}
