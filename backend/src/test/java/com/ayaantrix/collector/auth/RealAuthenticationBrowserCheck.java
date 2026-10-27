package com.ayaantrix.collector.auth;

import com.ayaantrix.collector.CollectorApplication;
import com.ayaantrix.collector.auth.dto.LoginRequest;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.*;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.service.AgencySessions;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Explicit integration command, separate from backend-only CI. No assumptions or skipped browser tests. */
@Testcontainers
class RealAuthenticationBrowserCheck {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873").asCompatibleSubstituteFor("postgres"));
    @TempDir Path directory;
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods=false)
    static class Configuration {
        @Bean @Primary AccountRegistrationWorkflowTests.TestClock browserClock(){var clock=new AccountRegistrationWorkflowTests.TestClock();clock.now.set(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));return clock;}
    }
    @Test void realHttpsBrowserAuthLifecycleWithoutMocks() throws Exception {
        String password="Synthetic browser-only password",next="Synthetic replacement browser password",email="browser-only@example.test";
        String certificatePassword=UUID.randomUUID().toString();Path certificate=directory.resolve("browser.p12");
        String keytool=Path.of(System.getProperty("java.home"),"bin","keytool.exe").toString();
        var cert=new ProcessBuilder(keytool,"-genkeypair","-alias","browser","-keyalg","RSA","-keysize","2048","-validity","1",
            "-dname","CN=localhost","-storetype","PKCS12","-keystore",certificate.toString(),"-storepass",certificatePassword,"-keypass",certificatePassword)
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        assertThat(cert.waitFor(30,TimeUnit.SECONDS)).as("Local test certificate generation").isTrue();assertThat(cert.exitValue()).isZero();
        var keys=SigningKeyFixture.create(directory.resolve("signing"),"browser-only");byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);String pepper=Base64.getEncoder().encodeToString(bytes);
        try(ConfigurableApplicationContext app=new SpringApplicationBuilder(CollectorApplication.class,Configuration.class).profiles("test").run(
            "--server.port=0","--server.address=127.0.0.1","--spring.datasource.url="+POSTGRES.getJdbcUrl(),
            "--spring.datasource.username="+POSTGRES.getUsername(),"--spring.datasource.password="+POSTGRES.getPassword(),
            "--collector.jwt.private-key="+keys.privateFile(),"--collector.jwt.public-keys="+keys.publicFile(),"--collector.jwt.key-id="+keys.kid(),
            "--collector.jwt.issuer=https://browser.test","--collector.jwt.audience=collector-api","--collector.auth.token-hash-pepper="+pepper,
            "--collector.auth.cookie-secure=true","--server.servlet.session.cookie.secure=true","--collector.delivery.worker-enabled=false")) {
            var clock=app.getBean(AccountRegistrationWorkflowTests.TestClock.class);var users=app.getBean(UserAccountRepository.class);
            var user=new UserAccount(email,"Synthetic Browser User",app.getBean(PasswordEncoder.class).encode(password),clock.instant());user.markVerified(clock.instant());users.saveAndFlush(user);
            int port=((WebServerApplicationContext)app).getWebServer().getPort();
            Path runner=Path.of(System.getProperty("user.dir")).resolve("../frontend/real-auth/browser-check.mjs").normalize();
            var builder=new ProcessBuilder("node",runner.toString()).redirectError(ProcessBuilder.Redirect.DISCARD);
            builder.environment().remove("DEBUG");builder.environment().remove("PWDEBUG");
            Process process=builder.start();
            try(var io=new BrowserProtocol(process)) {
                io.step(Map.of("action","start","backend","http://127.0.0.1:"+port,"email",email,"password",password,"certificate",certificate.toString(),"certificatePassword",certificatePassword));
                io.step(Map.of("action","csrf"));io.step(Map.of("action","cors"));io.step(Map.of("action","bootstrap"));
                var extra=app.getBean(AgencySessions.class).login(new LoginRequest(email,password));
                UUID extraId=UUID.fromString(app.getBean(AccessTokens.class).decode(extra.accessToken()).getClaimAsString("sid"));
                clock.advance(331);io.step(Map.of("action","expired-write","sessionId",extraId.toString()));
                clock.advance(331);io.step(Map.of("action","concurrent-refresh"));
                io.step(Map.of("action","logout"));io.step(Map.of("action","invalid-login"));io.step(Map.of("action","signin"));
                var secrets=app.getBean(SecureAccountTokens.class);String reset=secrets.generate();
                app.getBean(AccountTokenRepository.class).saveAndFlush(new AccountToken(users.findById(user.getId()).orElseThrow(),secrets.digest(reset),TokenPurpose.RESET_PASSWORD,clock.instant()));
                io.step(Map.of("action","reset","token",reset,"password",next));
                io.step(Map.of("action","signin"));io.step(Map.of("action","logout-all"));io.step(Map.of("action","signin"));
                clock.advance(8*86400);io.step(Map.of("action","expired-session"));io.step(Map.of("action","storage"));io.step(Map.of("action","stop"));
            }
        }
    }
    static final class BrowserProtocol implements AutoCloseable {
        private final Process process;private final BufferedWriter writer;private final BufferedReader reader;
        private final ExecutorService waiting=Executors.newSingleThreadExecutor();private final JsonMapper json=JsonMapper.builder().build();
        BrowserProtocol(Process process){this.process=process;writer=new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.UTF_8));reader=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8));}
        void step(Map<String,String> command) throws Exception {
            writer.write(json.writeValueAsString(command));writer.newLine();writer.flush();
            String line=waiting.submit((Callable<String>)reader::readLine).get(120,TimeUnit.SECONDS);
            assertThat(line).as("Browser process response for %s",command.get("action")).isNotNull();
            var result=json.readTree(line);assertThat(result.get("ok").asBoolean()).as("Browser stage %s (%s)",result.get("phase").asText(),result.get("kind").asText()+" "+result.get("http")).isTrue();
            System.out.println("PASS real HTTPS browser: "+command.get("action"));
        }
        public void close() throws Exception {
            if(!process.waitFor(5,TimeUnit.SECONDS)){
                process.descendants().forEach(child->child.destroyForcibly());process.destroyForcibly();
            }
            waiting.shutdownNow();reader.close();writer.close();
        }
    }
}
