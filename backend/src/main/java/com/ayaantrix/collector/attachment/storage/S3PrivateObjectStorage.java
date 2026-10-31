package com.ayaantrix.collector.attachment.storage;

import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.*;
import software.amazon.awssdk.services.s3.presigner.model.*;

import java.net.URI;
import java.time.Duration;
import java.util.*;

@Component
public class S3PrivateObjectStorage implements PrivateObjectStorage, AutoCloseable {
    private final boolean enabled;
    private final S3Client client;
    private final S3Presigner signer;
    private final String staging, privateBucket;

    public S3PrivateObjectStorage(Environment env) {
        enabled = env.getProperty("collector.storage.enabled", Boolean.class, false);
        staging = env.getProperty("S3_BUCKET_STAGING", "");
        privateBucket = env.getProperty("S3_BUCKET_PRIVATE", "");
        if (!enabled) {
            client = null;
            signer = null;
            return;
        }
        var endpoint = URI.create(required(env, "S3_ENDPOINT"));
        var publicEndpoint = URI.create(env.getProperty("S3_PUBLIC_ENDPOINT", endpoint.toString()));
        validateEndpoint(endpoint);
        validateEndpoint(publicEndpoint);
        if (staging.isBlank() || privateBucket.isBlank() || staging.equals(privateBucket))
            throw new IllegalStateException(
                    "Separate private staging and canonical buckets are required");
        var creds =
                StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(
                                required(env, "S3_ACCESS_KEY"), required(env, "S3_SECRET_KEY")));
        var region = Region.of(env.getProperty("S3_REGION", "us-east-1"));
        var config =
                S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .chunkedEncodingEnabled(false)
                        .build();
        client =
                S3Client.builder()
                        .requestChecksumCalculation(
                                software.amazon.awssdk.core.checksums.RequestChecksumCalculation
                                        .WHEN_REQUIRED)
                        .endpointOverride(endpoint)
                        .region(region)
                        .credentialsProvider(creds)
                        .serviceConfiguration(config)
                        .httpClientBuilder(
                                UrlConnectionHttpClient.builder()
                                        .proxyConfiguration(
                                                software.amazon.awssdk.http.urlconnection
                                                        .ProxyConfiguration.builder()
                                                        .useSystemPropertyValues(false)
                                                        .useEnvironmentVariablesValues(false)
                                                        .build())
                                        .connectionTimeout(Duration.ofSeconds(5))
                                        .socketTimeout(Duration.ofSeconds(30)))
                        .overrideConfiguration(
                                c ->
                                        c.apiCallTimeout(Duration.ofSeconds(45))
                                                .apiCallAttemptTimeout(Duration.ofSeconds(35)))
                        .build();
        signer =
                S3Presigner.builder()
                        .endpointOverride(publicEndpoint)
                        .region(region)
                        .credentialsProvider(creds)
                        .serviceConfiguration(config)
                        .build();
    }

    private static void validateEndpoint(URI endpoint) {
        boolean local =
                Set.of("127.0.0.1", "localhost", "[::1]")
                        .contains(endpoint.getHost() == null ? "" : endpoint.getHost());
        if (endpoint.getHost() == null
                || endpoint.getUserInfo() != null
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null
                || (!"https".equals(endpoint.getScheme())
                        && !(local && "http".equals(endpoint.getScheme()))))
            throw new IllegalStateException(
                    "Storage endpoint requires HTTPS, or HTTP loopback for local development");
    }

    private static String required(Environment e, String key) {
        String v = e.getProperty(key);
        if (v == null || v.isBlank())
            throw new IllegalStateException("Missing private storage configuration: " + key);
        return v;
    }

    private static String sha256(byte[] bytes) {
        try {
            return Base64.getEncoder()
                    .encodeToString(
                            java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private void require() {
        if (!enabled)
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STORAGE_UNAVAILABLE",
                    "Private uploads are not configured.");
    }

    public boolean enabled() {
        return enabled;
    }

    public Signed upload(String key, long bytes, String type, UUID asset, Duration expiry) {
        require();
        var req =
                PutObjectRequest.builder()
                        .bucket(staging)
                        .key(key)
                        .contentLength(bytes)
                        .contentType(type)
                        .metadata(Map.of("asset-id", asset.toString()))
                        .build();
        var signed =
                signer.presignPutObject(
                        PutObjectPresignRequest.builder()
                                .signatureDuration(expiry)
                                .putObjectRequest(req)
                                .build());
        var headers = new HashMap<String, String>();
        signed.signedHeaders()
                .forEach(
                        (k, v) -> {
                            if (!k.equalsIgnoreCase("host")
                                    && !k.equalsIgnoreCase("content-length"))
                                headers.put(k, String.join(",", v));
                        });
        return new Signed(signed.url().toString(), Map.copyOf(headers));
    }

    public Head head(String key) {
        require();
        var h = client.headObject(HeadObjectRequest.builder().bucket(staging).key(key).build());
        return new Head(h.contentLength(), h.contentType());
    }

    public byte[] read(String key, long max) {
        require();
        try (var in =
                client.getObject(GetObjectRequest.builder().bucket(staging).key(key).build())) {
            if (in.response().contentLength() > max)
                throw new IllegalStateException("Staging object exceeds limit");
            byte[] bytes = in.readNBytes(Math.toIntExact(max + 1));
            if (bytes.length > max) throw new IllegalStateException("Staging object exceeds limit");
            return bytes;
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Storage read failed");
        }
    }

    public void put(String key, byte[] bytes, String type) {
        require();
        client.putObject(
                PutObjectRequest.builder()
                        .bucket(privateBucket)
                        .key(key)
                        .contentType("application/octet-stream")
                        .contentDisposition("attachment")
                        .cacheControl("private, no-store")
                        .checksumSHA256(sha256(bytes))
                        .build(),
                RequestBody.fromBytes(bytes));
    }

    public void deleteStaging(String key) {
        require();
        client.deleteObject(DeleteObjectRequest.builder().bucket(staging).key(key).build());
    }

    public void deletePrivate(String key) {
        require();
        client.deleteObject(DeleteObjectRequest.builder().bucket(privateBucket).key(key).build());
    }

    public String download(String key, String name, String type, Duration expiry) {
        require();
        String disposition =
                org.springframework.http.ContentDisposition.attachment()
                        .filename(name, java.nio.charset.StandardCharsets.UTF_8)
                        .build()
                        .toString();
        return signer.presignGetObject(
                        GetObjectPresignRequest.builder()
                                .signatureDuration(expiry)
                                .getObjectRequest(
                                        GetObjectRequest.builder()
                                                .bucket(privateBucket)
                                                .key(key)
                                                .responseContentDisposition(disposition)
                                                .responseContentType("application/octet-stream")
                                                .responseCacheControl("private, no-store")
                                                .build())
                                .build())
                .url()
                .toString();
    }

    public void close() {
        if (client != null) client.close();
        if (signer != null) signer.close();
    }
}
