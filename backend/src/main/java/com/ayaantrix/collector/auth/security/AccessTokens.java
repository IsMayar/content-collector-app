package com.ayaantrix.collector.auth.security;

import com.ayaantrix.collector.common.error.ApiException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.*;
import java.util.*;

@Component
public class AccessTokens implements JwtDecoder {
    private final Map<String,NimbusJwtDecoder> decoders=new HashMap<>();
    private final Clock clock;
    private final String issuer,audience,keyId;
    private NimbusJwtEncoder encoder;
    public AccessTokens(Clock clock,@Value("${collector.jwt.private-key:}") String privateFile,
            @Value("${collector.jwt.public-keys:}") String publicFile,@Value("${collector.jwt.key-id:}") String keyId,
            @Value("${collector.jwt.issuer:}") String issuer,@Value("${collector.jwt.audience:}") String audience) {
        this.clock=clock;this.keyId=keyId;this.issuer=issuer;this.audience=audience;
        if(privateFile.isBlank() && publicFile.isBlank() && keyId.isBlank() && issuer.isBlank() && audience.isBlank())return;
        try {
            if(!keyId.matches("[A-Za-z0-9_-]{1,80}") || issuer.isBlank() || audience.isBlank())throw new IllegalArgumentException();
            var keys=JWKSet.parse(Files.readString(Path.of(publicFile))).getKeys();
            for(var key:keys){
                if(!(key instanceof RSAKey rsa) || rsa.isPrivate() || rsa.getKeyID()==null || decoders.containsKey(rsa.getKeyID())
                        || rsa.toRSAPublicKey().getModulus().bitLength()<2048
                        || (rsa.getAlgorithm()!=null && !JWSAlgorithm.RS256.equals(rsa.getAlgorithm())))throw new IllegalArgumentException();
                var decoder=NimbusJwtDecoder.withPublicKey(rsa.toRSAPublicKey()).signatureAlgorithm(SignatureAlgorithm.RS256).build();
                var time=new JwtTimestampValidator(Duration.ofSeconds(30));time.setClock(clock);
                decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(time,new JwtIssuerValidator(issuer),jwt->{
                    try {
                        UUID.fromString(jwt.getSubject());UUID.fromString(jwt.getClaimAsString("sid"));UUID.fromString(jwt.getId());
                        if(!jwt.getAudience().equals(List.of(audience)) || jwt.getIssuedAt()==null || jwt.getExpiresAt()==null
                                || !jwt.getExpiresAt().equals(jwt.getIssuedAt().plusSeconds(300))
                                || jwt.getIssuedAt().isAfter(clock.instant().plusSeconds(30)))throw new IllegalArgumentException();
                        return OAuth2TokenValidatorResult.success();
                    }catch(RuntimeException invalid){return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Invalid access token.",null));}
                }));
                decoders.put(rsa.getKeyID(),decoder);
            }
            var selected=keys.stream().filter(k->keyId.equals(k.getKeyID())).findFirst().orElseThrow();
            String pem=Files.readString(Path.of(privateFile)).replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replaceAll("\\s","");
            var privateKey=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));
            var publicKey=((RSAKey)selected).toRSAPublicKey();
            if(!privateKey.getModulus().equals(publicKey.getModulus()))throw new IllegalArgumentException();
            var signing=new RSAKey.Builder(publicKey).privateKey(privateKey).keyID(keyId).algorithm(JWSAlgorithm.RS256).build();
            encoder=new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(signing)));
        }catch(Exception invalid){throw new IllegalStateException("Invalid JWT signing configuration.");}
    }
    public void requireConfigured(){if(encoder==null)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"AUTH_UNAVAILABLE","Account sign-in is temporarily unavailable.");}
    public String issue(UUID userId,UUID sessionId){
        requireConfigured();var now=clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        var claims=JwtClaimsSet.builder().issuer(issuer).audience(List.of(audience)).subject(userId.toString())
            .claim("sid",sessionId.toString()).id(UUID.randomUUID().toString()).issuedAt(now).expiresAt(now.plusSeconds(300)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId(keyId).type("JWT").build(),claims)).getTokenValue();
    }
    @Override public Jwt decode(String raw){
        try{
            if(raw==null || raw.length()>8192)throw new IllegalArgumentException();
            var header=SignedJWT.parse(raw).getHeader();
            if(!JWSAlgorithm.RS256.equals(header.getAlgorithm()))throw new IllegalArgumentException();
            var decoder=decoders.get(header.getKeyID());if(decoder==null)throw new IllegalArgumentException();
            return decoder.decode(raw);
        }catch(Exception invalid){throw new BadJwtException("Invalid access token.");}
    }
}
