package com.ayaantrix.collector.attachment;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.*;

import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

import java.net.URI;
import java.time.Duration;
import java.util.*;

/** Isolated actual S3 and clamd protocol services. Tiny deterministic signatures are TEST ONLY. */
public final class StorageFixture implements AutoCloseable {
    public static final String ACCESS = "collector-test-key",
            SECRET = "synthetic-private-storage-test-key-only",
            STAGING = "collector-staging",
            PRIVATE = "collector-private";
    private final GenericContainer<?> s3 =
            new GenericContainer<>(
                            DockerImageName.parse(
                                    "chrislusf/seaweedfs:4.00@sha256:dcbccdc9f33689d43ca3d1fb73d2baa319f8307c59d7923191b993ddc85ba6f8"))
                    .withExposedPorts(8333)
                    .withCopyFileToContainer(
                            MountableFile.forClasspathResource("attachment/s3.json"),
                            "/etc/collector-s3.json")
                    .withCommand(
                            "server",
                            "-s3",
                            "-filer",
                            "-dir=/data",
                            "-ip=127.0.0.1",
                            "-ip.bind=0.0.0.0",
                            "-s3.config=/etc/collector-s3.json",
                            "-volume.max=64",
                            "-master.volumeSizeLimitMB=32")
                    .waitingFor(Wait.forListeningPort())
                    .withStartupTimeout(Duration.ofSeconds(90));
    private GenericContainer<?> clam;
    private S3Client client;

    public void start() {
        s3.start();
        if (System.getProperty("collector.test.clam-port") == null) {
            clam =
                    new GenericContainer<>(
                                    DockerImageName.parse(
                                            "clamav/clamav:stable_base@sha256:a01a78acf14e356f9d95c0eeb640ac9fa48a98a59933dea877f5a4d01573a0eb"))
                            .withExposedPorts(3310)
                            .withCopyFileToContainer(
                                    MountableFile.forClasspathResource("attachment/test.hdb"),
                                    "/test/database/test.hdb")
                            .withCopyFileToContainer(
                                    MountableFile.forClasspathResource("attachment/clamd.conf"),
                                    "/test/clamd.conf")
                            .withCreateContainerCmdModifier(cmd -> cmd.withEntrypoint("clamd"))
                            .withCommand("--config-file=/test/clamd.conf")
                            .waitingFor(Wait.forListeningPort())
                            .withStartupTimeout(Duration.ofSeconds(60));
            clam.start();
        }
        client =
                S3Client.builder()
                        .endpointOverride(URI.create(endpoint()))
                        .region(Region.US_EAST_1)
                        .credentialsProvider(
                                StaticCredentialsProvider.create(
                                        AwsBasicCredentials.create(ACCESS, SECRET)))
                        .forcePathStyle(true)
                        .httpClientBuilder(
                                UrlConnectionHttpClient.builder()
                                        .proxyConfiguration(
                                                software.amazon.awssdk.http.urlconnection
                                                        .ProxyConfiguration.builder()
                                                        .useSystemPropertyValues(false)
                                                        .useEnvironmentVariablesValues(false)
                                                        .build()))
                        .build();
        for (String bucket : List.of(STAGING, PRIVATE)) {
            client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
            client.putBucketCors(
                    PutBucketCorsRequest.builder()
                            .bucket(bucket)
                            .corsConfiguration(
                                    CORSConfiguration.builder()
                                            .corsRules(
                                                    CORSRule.builder()
                                                            .allowedOrigins(
                                                                    "https://localhost:*",
                                                                    "https://127.0.0.1:*",
                                                                    "http://127.0.0.1:5173")
                                                            .allowedMethods("PUT", "GET", "HEAD")
                                                            .allowedHeaders("*")
                                                            .exposeHeaders("ETag")
                                                            .maxAgeSeconds(60)
                                                            .build())
                                            .build())
                            .build());
        }
    }

    public String endpoint() {
        return "http://" + s3.getHost() + ":" + s3.getMappedPort(8333);
    }

    public String scannerHost() {
        return clam == null ? "127.0.0.1" : clam.getHost();
    }

    public int scannerPort() {
        return clam == null
                ? Integer.parseInt(System.getProperty("collector.test.clam-port"))
                : clam.getMappedPort(3310);
    }

    public S3Client client() {
        return client;
    }

    public String[] args() {
        return new String[] {
            "--collector.storage.enabled=true",
            "--collector.storage.worker-enabled=false",
            "--S3_ENDPOINT=" + endpoint(),
            "--S3_REGION=us-east-1",
            "--S3_BUCKET_STAGING=" + STAGING,
            "--S3_BUCKET_PRIVATE=" + PRIVATE,
            "--S3_ACCESS_KEY=" + ACCESS,
            "--S3_SECRET_KEY=" + SECRET,
            "--CLAMAV_HOST=" + scannerHost(),
            "--CLAMAV_PORT=" + scannerPort(),
            "--IMAGE_WORKER_IMAGE=collector-image-worker:t16"
        };
    }

    public void close() {
        java.nio.file.Path log = java.nio.file.Path.of("target-t16-s3-diagnostic.log");
        try {
            java.nio.file.Files.writeString(log, s3.getLogs());
        } catch (Exception ignored) {
        }
        if (client != null) client.close();
        if (clam != null) clam.stop();
        s3.stop();
    }
}
