package com.ayaantrix.collector.auth;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import jakarta.validation.ConstraintViolationException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class IdentityPersistenceTests {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873")
            .asCompatibleSubstituteFor("postgres"));
    private ConfigurableApplicationContext context;
    private UserAccountRepository users;
    private AccountTokenRepository tokens;
    private JdbcTemplate jdbc;
    private String passwordHash;
    private final SecureAccountTokens secrets = new SecureAccountTokens();
    private final Instant now = Instant.parse("2026-10-26T00:00:00Z");

    @BeforeAll
    void start() {
        context = new SpringApplicationBuilder(CollectorApplication.class).profiles("test").run(
                "--server.port=0", "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "--spring.datasource.username=" + POSTGRES.getUsername(),
                "--spring.datasource.password=" + POSTGRES.getPassword());
        users = context.getBean(UserAccountRepository.class);
        tokens = context.getBean(AccountTokenRepository.class);
        jdbc = context.getBean(JdbcTemplate.class);
        passwordHash = context.getBean(PasswordEncoder.class).encode("synthetic persistence password");
    }

    @AfterAll
    void close() { if (context != null) context.close(); }

    private UserAccount user() {
        return users.saveAndFlush(new UserAccount(UUID.randomUUID() + "@example.test", "Alex", passwordHash, now));
    }
    private AccountToken token(UserAccount user, TokenPurpose purpose) {
        return tokens.saveAndFlush(new AccountToken(user, secrets.digest(secrets.generate()), purpose, now));
    }

    @Test
    void persistsAccountAndUpdatesStateTimestampAndOptimisticVersion() {
        var saved = user();
        var found = users.findByEmailNormalized(saved.getEmailNormalized()).orElseThrow();
        assertThat(users.existsByEmailNormalized(found.getEmailNormalized())).isTrue();
        assertThat(found.getState()).isEqualTo(AccountState.UNVERIFIED);
        assertThat(found.getVerifiedAt()).isNull();
        assertThat(found.getCreatedAt()).isEqualTo(now);
        assertThat(found.getPasswordHash()).isEqualTo(passwordHash);
        long version = found.getVersion();
        found.markVerified(now.plusSeconds(1));
        users.saveAndFlush(found);
        var updated = users.findById(found.getId()).orElseThrow();
        assertThat(updated.getState()).isEqualTo(AccountState.ACTIVE);
        assertThat(updated.getVerifiedAt()).isEqualTo(now.plusSeconds(1));
        assertThat(updated.getUpdatedAt()).isEqualTo(now.plusSeconds(1));
        assertThat(updated.getVersion()).isGreaterThan(version);
    }

    @Test
    void rejectsDuplicateEmailAfterCaseAndWhitespaceNormalization() {
        String email = UUID.randomUUID() + "@example.test";
        users.saveAndFlush(new UserAccount(" " + email.toUpperCase(java.util.Locale.ROOT) + " ", "Alex", passwordHash, now));
        assertThatThrownBy(() -> users.saveAndFlush(new UserAccount(email, "Other", passwordHash, now)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseRejectsNoncanonicalEmailEvenWhenJpaIsBypassed() {
        assertThatThrownBy(() -> jdbc.update("""
                insert into collector.users (email_normalized,display_name,password_hash)
                values (?, 'Alex', ?)
                """, "Upper" + UUID.randomUUID() + "@EXAMPLE.TEST", passwordHash))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void beanValidationRejectsMalformedEmail() {
        assertThatThrownBy(() -> users.saveAndFlush(new UserAccount("invalid-email", "Alex", passwordHash, now)))
                .isInstanceOf(ConstraintViolationException.class);
    }

    @Test
    void lookupRequiresPurposeAndStorageContainsOnlyDigest() {
        var saved = token(user(), TokenPurpose.VERIFY_EMAIL);
        assertThat(tokens.findByTokenHashAndPurpose(saved.getTokenHash(), TokenPurpose.VERIFY_EMAIL)).isPresent();
        assertThat(tokens.findByTokenHashAndPurpose(saved.getTokenHash(), TokenPurpose.RESET_PASSWORD)).isEmpty();
        assertThat(tokens.findByUserIdAndPurpose(saved.getUserId(), TokenPurpose.VERIFY_EMAIL)).hasSize(1);
        assertThat(jdbc.queryForObject("select token_hash from collector.access_tokens where id=?", String.class, saved.getId()))
                .isEqualTo(saved.getTokenHash()).matches("[0-9a-f]{64}");
    }

    @Test
    void databaseEnforcesUniqueDigestAndAccountForeignKey(org.springframework.boot.test.system.CapturedOutput output) {
        var saved = token(user(), TokenPurpose.RESET_PASSWORD);
        assertThatThrownBy(() -> tokens.saveAndFlush(new AccountToken(user(), saved.getTokenHash(), TokenPurpose.VERIFY_EMAIL, now)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into collector.access_tokens(user_id,email_normalized,purpose,token_hash,expires_at)
                values (?, 'missing@example.test','RESET_PASSWORD',?,now()+interval '30 minutes')
                """, UUID.randomUUID(), secrets.digest(secrets.generate())))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> users.deleteById(saved.getUserId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(output.getAll()).doesNotContain(saved.getTokenHash(), passwordHash);
    }

    @Test
    void databaseRejectsRawTokensInvalidPurposeAndInvalidExpiry() {
        var account = user();
        assertThatThrownBy(() -> jdbc.update("""
                insert into collector.access_tokens(user_id,email_normalized,purpose,token_hash,expires_at)
                values (?,?,'RESET_PASSWORD','raw-token',now()+interval '30 minutes')
                """, account.getId(), account.getEmailNormalized())).isInstanceOf(DataIntegrityViolationException.class);
        var saved = token(account, TokenPurpose.RESET_PASSWORD);
        assertThatThrownBy(() -> jdbc.update("update collector.access_tokens set purpose='TEAM_INVITE' where id=?", saved.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update collector.access_tokens set expires_at=created_at where id=?", saved.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void consumptionRequiresCorrectPurposeAndUnexpiredUnconsumedState() {
        var saved = token(user(), TokenPurpose.RESET_PASSWORD);
        assertThat(tokens.consume(saved.getId(), TokenPurpose.VERIFY_EMAIL, now)).isZero();
        assertThat(tokens.consume(saved.getId(), TokenPurpose.RESET_PASSWORD, now.minusSeconds(1))).isZero();
        assertThat(tokens.consume(saved.getId(), TokenPurpose.RESET_PASSWORD, saved.getExpiresAt())).isZero();
        assertThat(tokens.consume(saved.getId(), TokenPurpose.RESET_PASSWORD, now.plusSeconds(1))).isEqualTo(1);
        assertThat(tokens.consume(saved.getId(), TokenPurpose.RESET_PASSWORD, now.plusSeconds(2))).isZero();
        var found = tokens.findById(saved.getId()).orElseThrow();
        assertThat(found.getConsumedAt()).isEqualTo(now.plusSeconds(1));
        assertThat(found.isUsableFor(TokenPurpose.RESET_PASSWORD, now.plusSeconds(2))).isFalse();
    }

    @Test
    void revocationPreventsConsumptionAndIsPurposeScoped() {
        var account = user();
        var verify = token(account, TokenPurpose.VERIFY_EMAIL);
        var reset = token(account, TokenPurpose.RESET_PASSWORD);
        var otherAccountToken = token(user(), TokenPurpose.VERIFY_EMAIL);
        assertThat(tokens.revokeUnconsumedForUserAndPurpose(account.getId(), TokenPurpose.VERIFY_EMAIL, now.plusSeconds(1))).isEqualTo(1);
        assertThat(tokens.consume(verify.getId(), TokenPurpose.VERIFY_EMAIL, now.plusSeconds(2))).isZero();
        assertThat(tokens.findById(verify.getId()).orElseThrow().getRevokedAt()).isEqualTo(now.plusSeconds(1));
        assertThat(tokens.findById(verify.getId()).orElseThrow().isUsableFor(TokenPurpose.VERIFY_EMAIL, now.plusSeconds(2))).isFalse();
        assertThat(tokens.findById(reset.getId()).orElseThrow().isUsableFor(TokenPurpose.RESET_PASSWORD, now.plusSeconds(2))).isTrue();
        assertThat(tokens.findById(otherAccountToken.getId()).orElseThrow().getRevokedAt()).isNull();
        assertThat(tokens.revoke(reset.getId(), TokenPurpose.RESET_PASSWORD, now.plusSeconds(2))).isEqualTo(1);
        assertThat(tokens.revoke(reset.getId(), TokenPurpose.RESET_PASSWORD, now.plusSeconds(3))).isZero();
    }

    @Test
    void consumptionRollsBackWithCallingTransaction() {
        var saved = token(user(), TokenPurpose.VERIFY_EMAIL);
        var transactions = new org.springframework.transaction.support.TransactionTemplate(
                context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            assertThat(tokens.consume(saved.getId(), TokenPurpose.VERIFY_EMAIL, now.plusSeconds(1))).isEqualTo(1);
            throw new IllegalStateException("Synthetic workflow rollback");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(tokens.findById(saved.getId()).orElseThrow().getConsumedAt()).isNull();
        assertThat(tokens.consume(saved.getId(), TokenPurpose.VERIFY_EMAIL, now.plusSeconds(2))).isEqualTo(1);
    }

    @Test
    void concurrentConsumptionHasExactlyOneWinner() throws Exception {
        var saved = token(user(), TokenPurpose.VERIFY_EMAIL);
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> attempt = () -> {
                ready.countDown();
                if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test barrier timed out");
                return tokens.consume(saved.getId(), TokenPurpose.VERIFY_EMAIL, now.plusSeconds(1));
            };
            var first = pool.submit(attempt);
            var second = pool.submit(attempt);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS) + second.get(15, TimeUnit.SECONDS)).isEqualTo(1);
        } finally { go.countDown(); }
    }

    @Test
    void cleanMigrationAndHibernateValidationHaveNoPendingChanges() {
        var flyway = context.getBean(Flyway.class);
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.info().applied()).hasSize(23);
        assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='collector'", Integer.class))
                .isEqualTo(43);
    }

    @Test
    void v1DatabaseUpgradesToV2WithoutLosingExistingData() throws Exception {
        jdbc.execute("create database collector_upgrade");
        String url = "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/collector_upgrade";
        var source = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
        var upgradeJdbc = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).defaultSchema("public").target("1").load().migrate();
        upgradeJdbc.execute("create table collector.upgrade_probe(id integer primary key, value text not null)");
        upgradeJdbc.update("insert into collector.upgrade_probe values(1,'preserved')");
        var upgrade = Flyway.configure().dataSource(source).defaultSchema("public").load();
        upgrade.migrate();
        assertThat(upgrade.validateWithResult().validationSuccessful).isTrue();
        assertThat(upgrade.info().applied()).hasSize(23);
        assertThat(upgradeJdbc.queryForObject("select value from collector.upgrade_probe where id=1", String.class)).isEqualTo("preserved");
        assertThat(upgradeJdbc.queryForObject("select count(*) from collector.users", Integer.class)).isZero();
    }
}
