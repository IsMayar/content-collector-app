import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** Java 21 single-file helper. Never prints key material; never overwrites existing files. */
class GenerateAuthKeys {
    public static void main(String[] args) throws Exception {
        var root=Path.of(args[0]).toAbsolutePath();Files.createDirectories(root);
        for(String file:List.of("private.pem","public.jwks.json","auth.properties"))
            if(Files.exists(root.resolve(file)))throw new IllegalStateException("Auth key files already exist; preserve them.");
        var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(3072);var pair=generator.generateKeyPair();
        var publicKey=(RSAPublicKey)pair.getPublic();var base64=Base64.getUrlEncoder().withoutPadding();
        byte[] n=publicKey.getModulus().toByteArray(),e=publicKey.getPublicExponent().toByteArray();
        if(n[0]==0)n=Arrays.copyOfRange(n,1,n.length);
        if(e[0]==0)e=Arrays.copyOfRange(e,1,e.length);
        String jwks=String.format("""
            {"keys":[{"kty":"RSA","use":"sig","alg":"RS256","kid":"local-rsa-v1","n":"%s","e":"%s"}]}
            """,base64.encodeToString(n),base64.encodeToString(e));
        String pem=String.join(System.lineSeparator(),"-----BEGIN PRIVATE KEY-----",Base64.getMimeEncoder(64,new byte[]{10}).encodeToString(pair.getPrivate().getEncoded()),"-----END PRIVATE KEY-----");
        byte[] pepper=new byte[32];new SecureRandom().nextBytes(pepper);
        Files.writeString(root.resolve("private.pem"),pem,StandardOpenOption.CREATE_NEW);
        Files.writeString(root.resolve("public.jwks.json"),jwks,StandardOpenOption.CREATE_NEW);
        String config=String.join(System.lineSeparator(),
            "JWT_PRIVATE_KEY="+root.resolve("private.pem").toString().replace(java.io.File.separatorChar,'/'),
            "JWT_PUBLIC_KEYS="+root.resolve("public.jwks.json").toString().replace(java.io.File.separatorChar,'/'),
            "JWT_KEY_ID=local-rsa-v1","JWT_ISSUER=http://127.0.0.1:8080","JWT_AUDIENCE=collector-api",
            "TOKEN_HASH_PEPPER="+Base64.getEncoder().encodeToString(pepper))+System.lineSeparator();
        Files.writeString(root.resolve("auth.properties"),config,StandardOpenOption.CREATE_NEW);
    }
}
