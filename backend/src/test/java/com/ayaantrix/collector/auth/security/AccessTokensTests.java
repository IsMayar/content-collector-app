package com.ayaantrix.collector.auth.security;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.BadJwtException;
import java.nio.file.*;
import java.security.interfaces.RSAPublicKey;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class AccessTokensTests {
    @TempDir Path dir;
    private final Instant now=Instant.parse("2026-10-27T00:00:00Z");
    private SigningKeyFixture keys;private AccessTokens tokens;
    @BeforeEach void setup() throws Exception {keys=SigningKeyFixture.create(dir.resolve("a"),"test-a");tokens=config(keys,Clock.fixed(now,ZoneOffset.UTC));}
    private AccessTokens config(SigningKeyFixture key,Clock clock){return new AccessTokens(clock,key.privateFile().toString(),key.publicFile().toString(),key.kid(),"https://issuer.test","collector-api");}
    private String signed(String mode) throws Exception {
        var alg=mode.equals("algorithm")?JWSAlgorithm.RS512:JWSAlgorithm.RS256;
        var claims=new JWTClaimsSet.Builder().issuer(mode.equals("issuer")?"https://wrong.test":"https://issuer.test")
            .audience(mode.equals("audience")?"wrong":"collector-api").subject(mode.equals("subject")?"bad":UUID.randomUUID().toString())
            .jwtID(UUID.randomUUID().toString()).claim("sid",mode.equals("session")?"bad":UUID.randomUUID().toString());
        var issued=mode.equals("expired")?now.minusSeconds(331):mode.equals("future")?now.plusSeconds(31):now;
        if(!mode.equals("missing-time"))claims.issueTime(Date.from(issued)).expirationTime(Date.from(issued.plusSeconds(mode.equals("lifetime")?600:300)));
        var jwt=new SignedJWT(new JWSHeader.Builder(alg).keyID(mode.equals("kid")?"unknown":keys.kid()).build(),claims.build());
        var signer=mode.equals("signature")?SigningKeyFixture.create(dir.resolve("other"),"other").pair().getPrivate():keys.pair().getPrivate();
        jwt.sign(new RSASSASigner(signer));return jwt.serialize();
    }
    @Test void roundTripHasOnlySafeClaimsFiveMinuteLifetimeAndRestartStableKey(){
        UUID user=UUID.randomUUID(),session=UUID.randomUUID();String raw=tokens.issue(user,session);var jwt=tokens.decode(raw);
        assertThat(jwt.getSubject()).isEqualTo(user.toString());assertThat(jwt.getClaimAsString("sid")).isEqualTo(session.toString());
        assertThat(jwt.getHeaders()).containsEntry("alg","RS256").containsEntry("kid","test-a");
        assertThat(jwt.getClaims().keySet()).containsExactlyInAnyOrder("iss","aud","sub","sid","jti","iat","exp");
        assertThat(jwt.getExpiresAt()).isEqualTo(now.plusSeconds(300));assertThat(config(keys,Clock.fixed(now,ZoneOffset.UTC)).decode(raw).getSubject()).isEqualTo(user.toString());
    }
    @ParameterizedTest @ValueSource(strings={"issuer","audience","subject","session","expired","future","missing-time","lifetime","kid","signature","algorithm"})
    void rejectsInvalidSignedTokens(String mode) throws Exception {String raw=signed(mode);assertThatThrownBy(()->tokens.decode(raw)).isInstanceOf(BadJwtException.class).hasMessage("Invalid access token.");}
    @ParameterizedTest @ValueSource(strings={"","garbage","a.b.c","eyJhbGciOiJub25lIn0.e30."})
    void rejectsMalformedAndUnsigned(String raw){assertThatThrownBy(()->tokens.decode(raw)).isInstanceOf(BadJwtException.class);}
    @Test void keyRotationAllowsRetainedPublicKeyAndRetiresItExplicitly() throws Exception {
        String old=tokens.issue(UUID.randomUUID(),UUID.randomUUID());var next=SigningKeyFixture.create(dir.resolve("b"),"test-b");
        var oldPublic=new RSAKey.Builder((RSAPublicKey)keys.pair().getPublic()).keyID(keys.kid()).build();
        var newPublic=new RSAKey.Builder((RSAPublicKey)next.pair().getPublic()).keyID(next.kid()).build();
        Files.writeString(next.publicFile(),new JWKSet(List.of(oldPublic,newPublic)).toString());var rotated=config(next,Clock.fixed(now,ZoneOffset.UTC));
        assertThat(rotated.decode(old)).isNotNull();assertThat(rotated.decode(rotated.issue(UUID.randomUUID(),UUID.randomUUID()))).isNotNull();
        Files.writeString(next.publicFile(),new JWKSet(newPublic).toString());assertThatThrownBy(()->config(next,Clock.fixed(now,ZoneOffset.UTC)).decode(old)).isInstanceOf(BadJwtException.class);
    }
    @Test void missingOrMismatchedConfigurationFailsClosed() throws Exception {
        var disabled=new AccessTokens(Clock.systemUTC(),"","","","","");assertThatThrownBy(disabled::requireConfigured).isInstanceOf(com.ayaantrix.collector.common.error.ApiException.class);
        assertThatThrownBy(()->new AccessTokens(Clock.systemUTC(),keys.privateFile().toString(),"missing","kid","issuer","aud"))
            .isInstanceOf(IllegalStateException.class).hasMessage("Invalid JWT signing configuration.");
        var other=SigningKeyFixture.create(dir.resolve("mismatch"),"test-a");
        assertThatThrownBy(()->new AccessTokens(Clock.systemUTC(),other.privateFile().toString(),keys.publicFile().toString(),"test-a","issuer","aud"))
            .isInstanceOf(IllegalStateException.class).hasMessage("Invalid JWT signing configuration.");
    }
    @Test void refreshDigestUsesStableConfiguredPepperAndNeverPersistsRaw(){
        var secrets=new SecureAccountTokens();String raw=secrets.generate();String pepper=Base64.getEncoder().encodeToString(new byte[32]);
        var hashes=new RefreshTokenHashes(secrets,pepper);assertThat(hashes.digest(raw)).hasSize(64).doesNotContain(raw);
        assertThat(new RefreshTokenHashes(secrets,pepper).digest(raw)).isEqualTo(hashes.digest(raw));
        assertThatThrownBy(()->hashes.digest("bad")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new RefreshTokenHashes(secrets,"bad")).isInstanceOf(IllegalStateException.class);
    }
}
