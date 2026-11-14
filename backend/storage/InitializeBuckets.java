import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.util.*;

/** Explicit local administration tool, never run by application startup. */
class InitializeBuckets {
    public static void main(String[] args) throws Exception {
        var env = new Properties();
        try (var in = Files.newInputStream(Path.of(".env"))) {
            env.load(in);
        }
        // Allow an isolated local browser run to use its own buckets and origin.
        for (String key : List.of("APP_BASE_URL", "S3_BUCKET_STAGING", "S3_BUCKET_PRIVATE")) {
            String value = System.getenv(key);
            if (value != null && !value.isBlank()) env.setProperty(key, value);
        }
        String endpoint = env.getProperty("S3_ENDPOINT", "");
        if (!endpoint.equals("http://127.0.0.1:8333"))
            throw new IllegalStateException("Local loopback setup only");
        String origin = env.getProperty("APP_BASE_URL", "http://127.0.0.1:5173");
        var uri = URI.create(origin);
        if (!Set.of("localhost", "127.0.0.1").contains(uri.getHost()))
            throw new IllegalStateException("Local browser origin required");
        origin = uri.getScheme() + "://" + uri.getAuthority();
        try (var s3 =
                S3Client.builder()
                        .endpointOverride(URI.create(endpoint))
                        .region(Region.of(env.getProperty("S3_REGION", "us-east-1")))
                        .credentialsProvider(
                                StaticCredentialsProvider.create(
                                        AwsBasicCredentials.create(
                                                env.getProperty("S3_ACCESS_KEY"),
                                                env.getProperty("S3_SECRET_KEY"))))
                        .httpClientBuilder(
                                UrlConnectionHttpClient.builder()
                                        .proxyConfiguration(
                                                software.amazon.awssdk.http.urlconnection
                                                        .ProxyConfiguration.builder()
                                                        .useEnvironmentVariablesValues(false)
                                                        .useSystemPropertyValues(false)
                                                        .build()))
                        .forcePathStyle(true)
                        .build()) {
            for (String key : List.of("S3_BUCKET_STAGING", "S3_BUCKET_PRIVATE")) {
                String bucket = env.getProperty(key);
                try {
                    s3.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
                } catch (S3Exception e) {
                    if (e.statusCode() != 404)
                        throw new IllegalStateException(
                                "Storage is not ready or credentials were refused");
                    s3.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
                }
                s3.putBucketCors(
                        PutBucketCorsRequest.builder()
                                .bucket(bucket)
                                .corsConfiguration(
                                        CORSConfiguration.builder()
                                                .corsRules(
                                                        CORSRule.builder()
                                                                .allowedOrigins(origin)
                                                                .allowedMethods(
                                                                        "PUT", "GET", "HEAD")
                                                                .allowedHeaders(
                                                                        "content-type",
                                                                        "x-amz-meta-asset-id")
                                                                .exposeHeaders(
                                                                        "ETag",
                                                                        "Content-Disposition")
                                                                .maxAgeSeconds(60)
                                                                .build())
                                                .build())
                                .build());
            }
        }
        System.out.println(
                "Private local buckets initialized with one explicit browser origin; no anonymous"
                    + " identity configured.");
    }
}
