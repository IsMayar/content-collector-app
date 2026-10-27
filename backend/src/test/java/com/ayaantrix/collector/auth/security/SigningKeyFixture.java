package com.ayaantrix.collector.auth.security;
import com.nimbusds.jose.jwk.*;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
public record SigningKeyFixture(Path privateFile,Path publicFile,KeyPair pair,String kid){
    public static SigningKeyFixture create(Path dir,String kid) throws Exception {
        Files.createDirectories(dir);var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);var pair=generator.generateKeyPair();
        Path privateFile=dir.resolve("private.pem"),publicFile=dir.resolve("public.json");
        Files.writeString(privateFile,String.join(System.lineSeparator(),"-----BEGIN PRIVATE KEY-----",Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),"-----END PRIVATE KEY-----"));
        var key=new RSAKey.Builder((RSAPublicKey)pair.getPublic()).keyID(kid).algorithm(com.nimbusds.jose.JWSAlgorithm.RS256).build();
        Files.writeString(publicFile,new JWKSet(key).toString());return new SigningKeyFixture(privateFile,publicFile,pair,kid);
    }
    @Override public String toString(){return "SigningKeyFixture[redacted]";}
}
