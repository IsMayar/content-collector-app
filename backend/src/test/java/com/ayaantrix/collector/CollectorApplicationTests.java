package com.ayaantrix.collector;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class CollectorApplicationTests {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
            .asCompatibleSubstituteFor("postgres"));

    private ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(CollectorApplication.class).profiles("test").run(
                "--server.port=0",
                "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "--spring.datasource.username=" + POSTGRES.getUsername(),
                "--spring.datasource.password=" + POSTGRES.getPassword());
    }

    @Test
    void cleanDatabaseMigratesAndRestartPreservesDataAndHealthSecurity() throws Exception {
        try (var first = start()) {
            var jdbc = first.getBean(JdbcTemplate.class);
            assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='collector'", Integer.class)).isEqualTo(4);
            assertThat(first.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
            assertThat(first.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
            // Test-only probe, never a product migration or table.
            jdbc.execute("create table collector.restart_probe (id integer primary key, value text not null)");
            jdbc.update("insert into collector.restart_probe values (1, 'preserved')");
            assertHealthAndSecurity(first);
        }
        try (var second = start()) {
            var jdbc = second.getBean(JdbcTemplate.class);
            assertThat(jdbc.queryForObject("select value from collector.restart_probe where id=1", String.class)).isEqualTo("preserved");
            assertThat(jdbc.queryForObject("select count(*) from public.flyway_schema_history where success", Integer.class)).isEqualTo(3);
            assertThat(second.getBean(Flyway.class).validateWithResult().validationSuccessful).isTrue();
            assertThat(second.getBean(Flyway.class).info().pending()).isEmpty();
            assertHealthAndSecurity(second);
        }
    }

    private void assertHealthAndSecurity(ConfigurableApplicationContext context) throws Exception {
        int port = ((WebServerApplicationContext) context).getWebServer().getPort();
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            var health = request(client, port, "/actuator/health", "GET");
            assertThat(health.statusCode()).isEqualTo(200);
            assertThat(health.body()).isEqualTo("{\"status\":\"UP\"}");
            for (String path : new String[]{"/", "/api/v1/projects", "/actuator", "/actuator/env", "/actuator/health/db", "/login"}) {
                assertThat(request(client, port, path, "GET").statusCode()).as(path).isEqualTo(403);
            }
            assertThat(request(client, port, "/actuator/health", "POST").statusCode()).isEqualTo(403);
        }
    }

    private HttpResponse<String> request(HttpClient client, int port, String path, String method) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).method(method, HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
